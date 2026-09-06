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

## Studio is a second registration

`studio.py` builds every Studio-visible graph at module scope and `langgraph.json` names each one, so an agent lives in FOUR places: the catalog, `studio.py`, `langgraph.json`, and the docs index. Removing or renaming an agent means all four; grepping the old id across the repo (excluding `Archive/`) is the cheap check. Graphs whose effects need app-side data with no HTTP equivalent (a DB lookup) simply do not get a Studio entry.

## Seed every custom state channel

A key absent from the initial state is MISSING, not `None`. Nodes that do `state["workflow"]` raise `KeyError` on a fresh run. Make `initial_state` seed every custom channel the graph declares (`{"messages": [...], "triage_target": t, "workflow": None, "findings": [], "report": None}`) and prefer `state.get()` inside nodes anyway.

## Starting a run from another view

When a different screen wants to start an agent on ITS object (an execution id from an errors list, a workflow id from a workflow list), do not widen the `kickoff(context, prompt)` contract. Accept the external id on the route, run the pre-check that screen expects (refuse with a typed detail, e.g. `{"code": "execution_purged"}`, when the object is gone so the UI renders one state), and translate the id into the task text plus a `target` label (`exec:<id>`) before calling the driver. The agent stays agnostic; the route owns the translation.

## Retiring agents: archive, never delete

`git mv` the graph packages into `Archive/<date>-<reason>/`, save the removed catalog entries verbatim to a `.py.txt` next to a README that says why they left and where they live now, and drop their prompts, deps, compose mounts, and env knobs in the same commit. Ruff should already exclude `Archive/`. A test that asserts the retired ids are absent from the catalog keeps them from creeping back.
