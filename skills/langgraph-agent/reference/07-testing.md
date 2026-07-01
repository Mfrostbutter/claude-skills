# 07 · Testing a graph before you wire the UI

Prove topology, streaming, the pause, and staging headless, with **stub models + real or no-op effects**. No API key needed for the structural pass.

## Matched venv (one-time)

Build a venv on the pins:

```bash
python -m venv .venv
.venv/bin/pip install "langgraph==1.2.4" "langchain-core==1.4.6" \
  "langchain-anthropic==1.4.5" psycopg2-binary python-dotenv
```

## Import the pure graph without the app

Because the graph is a pure factory (`02`), you can import it directly — add the agent package's parent to `sys.path` and import it as a top-level package so relative imports resolve WITHOUT pulling in your app:

```python
import sys; sys.path.insert(0, "path/to/agents")
from digest.graph import build_digest_graph, Selection   # pure, no app imports
```

## Stub the models, keep the IO real

```python
class _Structured:                       # what with_structured_output(...).ainvoke returns
    def __init__(self, v): self._v = v
    async def ainvoke(self, _): return self._v
class StubRanker:
    def with_structured_output(self, schema): return _Structured(Selection(...))
class StubWriter:
    async def ainvoke(self, _):
        from langchain_core.messages import AIMessage; return AIMessage(content="stub")
```

Use REAL effects where they are read-only/safe (a feed fetch, a dedup read), a no-op for writes (`"mark_seen": lambda *a: calls.append(a)`), and dry-run for staging. This exercises the real IO path while staying offline-safe and DB-clean.

## Drive to the interrupt, then resume

```python
from langgraph.checkpoint.memory import MemorySaver
from langgraph.types import Command
graph = build_digest_graph(StubRanker(), StubWriter(), effects, checkpointer=MemorySaver())
cfg = {"recursion_limit": 25, "configurable": {"thread_id": "test-1"}}

async for upd in graph.astream({"window_days": 35}, cfg, stream_mode="updates"):
    if "__interrupt__" in upd:
        proposal = upd["__interrupt__"][0].value.get("proposal"); break

async for upd in graph.astream(Command(resume={"action": "approve"}), cfg, stream_mode="updates"):
    for node, payload in upd.items():
        for m in payload.get("messages", []):
            if not getattr(m, "name", None): final = m.content   # the result
```

Assert: each node fired (named messages), the interrupt produced a proposal, resume reached the staging result, and write effects were called the expected number of times.

**Drive async, not sync.** A graph with any `async def` node CANNOT be run with sync `graph.invoke()` — it raises `TypeError: No synchronous function provided to "<node>"`. Use `ainvoke`/`astream`. If you prefer invoke over stream, `await graph.ainvoke(state, cfg)` returns the state, and `"__interrupt__" in state` tells you it paused (`state["__interrupt__"][0].value` is the payload).

**Multi-gate: resume once per interrupt.**

```python
s1 = await graph.ainvoke(initial, cfg);                 assert "__interrupt__" in s1   # gate 1
s2 = await graph.ainvoke(Command(resume={"action": "approve", "edited": "1"}), cfg)
assert "__interrupt__" in s2                                                            # gate 2
s3 = await graph.ainvoke(Command(resume={"action": "approve", "mode": "dry_run"}), cfg) # done
```

## Then the cheap checks

- `py_compile` every new/edited file before deploying: `python -m py_compile path/to/*.py`.
- For the topology endpoint, build with a keyless model and assert `get_graph()` returns the expected node set.

## Dependency gaps

If the agent imports something your runtime lacks (`psycopg2`, `langchain-openai`), either add it to your deps and reinstall, OR import it lazily and fail open. Prefer lazy + fail-open for anything non-essential so a missing dep degrades instead of crashing.
