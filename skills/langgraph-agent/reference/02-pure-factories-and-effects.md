# 02 · Pure factories + injected effects

Why these two rules exist and how to follow them.

## Pure factory: no app imports, lazy heavy imports

A graph module is imported by TWO very different callers:
- your app at boot (module discovery walks the package to reach your routes/wiring), and
- `langgraph dev` / Studio, which imports the graph directly from a clean process.

So a graph module must import cleanly with **neither** the app context **nor** every optional extra present. The rules:

- **No `from <your_app>... import`** in a graph file. Import only siblings (`.prompts`, `.sources`, `.dedup`) and langchain/langgraph types used in signatures.
- **Heavy imports inside functions.** `langchain_anthropic`, `psycopg2`, `langgraph.checkpoint`, `langsmith` go inside the node/builder body, never at module top.
- **Nothing at module scope that runs work.** No DB connect, no model construct, no network. Only `def`/`class`. (Exception: a `studio.py` deliberately builds graphs at module scope for Studio, and is never imported by the app.)

Symptom of breaking this: the whole module fails to import, taking your agent (or every agent) down at boot, or Studio can't load the graph.

A good habit: in each app-side builder, do `from .<name>.graph import build_...` **inside** the function, not at the top.

## Injected effects: keep IO out of the graph

A node must not call a database, an HTTP API, or an external service directly. Instead the builder receives an `effects` (or `ops`) dict of callables and the nodes call those:

```python
def build_x_graph(llm, effects, checkpointer=None):
    async def gather(state):
        items = effects["fetch_all"](state["window"])     # <- injected
        fresh, _ = effects["partition_seen"](items)        # <- injected
        return {"items": fresh, "messages": [AIMessage(content=f"{len(fresh)} fresh", name="gather")]}
```

Your app wires the real effects; Studio/tests wire dry-run/no-op ones. Benefits:
- The graph stays pure and Studio-safe (effects can be pure-python or stubs).
- You can unit-test the graph with fake effects, no DB/API needed.
- One graph runs in three contexts (app, Studio, test) by swapping the effects.

## Effects fail open or dry-run

An effect whose credentials are absent must degrade, not crash:
- **Dedup:** on any DB/import error, `partition_seen` returns everything as fresh. Repeats are better than a dead pipeline.
- **Staging/publish:** with no API key, the effect returns a dry-run dict describing the would-be action instead of calling out.

This is what makes the agent runnable in Studio (no creds) and resilient in prod.

## Two models from one key

Build ONE `llm` and pass it to `build(llm, checkpointer)`. To run a cheap model alongside the quality one, pull the key off the passed model and build a second:

```python
def _anthropic_key_from(llm):
    for attr in ("anthropic_api_key", "api_key"):
        v = getattr(llm, attr, None)
        if v is not None:
            try: return v.get_secret_value()
            except AttributeError: return str(v)
    return os.environ.get("ANTHROPIC_API_KEY") or ""

ranker = ChatAnthropic(model="claude-haiku-4-5-20251001", api_key=_anthropic_key_from(llm), ...)
```

One credential, two tiers. Haiku ranks/routes/classifies; Sonnet writes/proposes.
