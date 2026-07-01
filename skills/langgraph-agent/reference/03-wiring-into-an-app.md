# 03 · Wiring a graph into your app

A compiled graph is not yet a product. To run many agents from one app, keep the app-side machinery **agent-agnostic** and make adding an agent a small, declarative change.

## The builder contract

Each agent exposes ONE app-side builder:

```python
def build(llm, checkpointer=None):
    # construct effects (+ any second model), import the graph LAZILY, call the factory
    from .digest.graph import build_digest_graph
    effects = {"gather": sources.gather, "persist": sources.mark_seen, "stage": mailer.stage}
    return build_digest_graph(llm, effects, checkpointer=checkpointer)
```

- HITL agents receive a real `MemorySaver` from the driver; non-HITL get `None`.
- The builder is the ONLY place your app package and the pure graph meet.

## A registry / catalog (optional but recommended)

If you run more than one agent, describe each declaratively so the runner, UI, and Studio can all read the same source:

```python
@dataclass(frozen=True)
class AgentDef:
    id: str                 # stable id (URL + routing)
    name: str; tagline: str; description: str
    badges: tuple = ()
    default_model: str = "claude-sonnet-5"
    model_env: str = ""     # env var to override the model without code changes
    build: callable = None  # (llm, checkpointer) -> compiled graph
    initial_state: callable = None  # (task, target) -> dict fed to astream
    kickoff: callable = None        # (context, prompt) -> the task string
    hitl: bool = False      # True -> driver supplies a checkpointer

REGISTRY = [AgentDef(id="digest", name="Digest", build=build, hitl=True, ...)]
```

Adding an agent becomes: write the graph + effects, append one `AgentDef`. Nothing in the runner/UI changes.

## The driver (what runs a graph)

Keep ONE agent-agnostic driver that, given an `AgentDef` and input:
1. builds the model (honoring `model_env`), calls `def.build(llm, checkpointer)`,
2. seeds state via `def.initial_state(...)` and drives `graph.astream(state, config, stream_mode="updates")`,
3. maps node updates to your UI events (see `05-streaming-and-observability.md`),
4. on `__interrupt__`, parks the compiled graph by `thread_id`, emits "awaiting approval", and re-enters with `Command(resume=...)` on resume (see `04-hitl.md`),
5. optionally stamps a LangSmith trace.

Because the driver only reads the registry, one implementation runs every agent.

## Studio registration

`langgraph dev` / Studio import graphs from a clean process, so give them a module that builds each graph at module scope **without** a checkpointer (the dev server supplies persistence), using dry-run effects:

```python
# studio.py
digest = build_digest_graph(_llm, _studio_effects)   # no checkpointer
# langgraph.json
{ "graphs": { "digest": "your_pkg.agents.studio:digest" } }
```

Studio effects should be dry-run/no-op — there are no creds in the dev server. This only works if the graph obeys the pure-factory rule (`02`).
