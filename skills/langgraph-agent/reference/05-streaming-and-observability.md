# 05 · Streaming, a live graph view, and tracing

How a run becomes a live timeline AND a lighting-up graph, and what your nodes must do.

## Drive the stream

```python
async for upd in graph.astream(state, config, stream_mode="updates"):
    if "__interrupt__" in upd:
        emit("awaiting_approval", proposal=upd["__interrupt__"][0].value.get("proposal")); break
    for node, payload in upd.items():
        for m in payload.get("messages", []):
            if getattr(m, "name", None):
                emit("node", label=m.name, text=m.content)      # a labeled step
            elif not getattr(m, "tool_calls", None):
                result = m.content                               # result-so-far; last one is final
```

## What your nodes must emit

- **`AIMessage(content=..., name="ingest")`** -> a labeled step. Emit one per node so each step shows in the timeline AND can light up a graph view.
- **`AIMessage` with tool calls** -> tool-call events.
- **`AIMessage` with NO name and NO tool calls** -> the result-so-far; the last one is the final. So your terminal node returns an UNNAMED message.

Rule of thumb: intermediate nodes return `name=`'d messages; the finalize node returns an unnamed message (the result).

## A workable event contract

If you broadcast run events over WebSocket/SSE, one discriminated event type works well:

| phase | when | key fields |
|---|---|---|
| `started` | run begins | `task, model, agent_id` |
| `thinking` | model text before a tool call | `text` |
| `tool_call` / `tool_result` | a tool runs | `tool, args` / `tool, preview` |
| `node` | a NAMED intermediate AIMessage | `label` (= the message `name`), `text` |
| `awaiting_approval` | `interrupt()` hit | `proposal` |
| `resumed` | human resumed | `action` |
| `final` | run finished | `result`, `trace_url`, tokens, cost |
| `error` | failed | `message` |

## The live graph view

- **Topology:** build the agent's graph with a throwaway, never-invoked model and return `compiled.get_graph()` as `{nodes, edges}`. No API key needed (`get_graph()` doesn't invoke the model).
- **Lighting nodes:** map phases to nodes and drive pending (dim) -> current (pulsing) -> done, turning traversed edges on as steps arrive.
- **Name nodes and their messages the SAME** so the match is exact (node `ingest` emits `name="ingest"`). `:` is a reserved char in node ids — a message name like `probe:openai` will NOT light node `probe_openai`. In a fan-out factory, set `name=f"probe_{e}"` (== the node id).
- A terminal node that returns only an unnamed result maps to the final/end; if you want it to light green, emit a named step message AND the unnamed result.

## LangSmith (optional, complementary)

Set `LANGSMITH_TRACING=true` + `LANGSMITH_API_KEY` and stamp each run's `run_id` as the LangSmith root trace to capture the trace URL + per-call token/cost. The in-app graph is the live SHAPE; LangSmith is the deep call WATERFALL. Tracing self-disables with no key (no 401 noise).
