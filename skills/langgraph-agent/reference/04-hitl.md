# 04 · Human-in-the-loop (interrupt / resume)

The pattern that makes an agent safe to ship: it HALTS, a human decides, it resumes from exactly where it paused.

## In the graph

```python
def review(state):
    # interrupt(payload) HALTS the graph. payload is surfaced to the human.
    # The return value of interrupt() is whatever the resume passes back.
    decision = interrupt({"proposal": state.get("draft_md", ""), "modes": ["approve", "edit", "reject"]})
    return {"decision": decision or {}}

async def finalize(state):
    d = state.get("decision") or {}
    action = (d.get("action") or "approve").lower()
    if action == "reject":
        body = "## Rejected\n\nNothing was applied."
    elif action == "edit" and d.get("edited"):
        body = "## Approved (edited)\n\n" + d["edited"]
    else:
        body = "## Approved\n\n" + state.get("draft_md", "")
    return {"messages": [AIMessage(content=body)]}   # unnamed -> the run result
```

A useful decision contract: `{"action": "approve"|"edit"|"reject", "edited": str, "mode": "dry_run"|"live"}`.

## What your driver must do (you implement this)

Drive the stream to the first `__interrupt__`, then:
1. park the LIVE compiled graph keyed by `run_id`/`thread_id` (its checkpointer holds the paused state), release any single-flight slot, emit an `awaiting_approval` event with the proposal.
2. on resume, re-enter the SAME graph object with `Command(resume=decision)` and drive to the end, emitting `resumed` then `final`.

With an in-memory checkpointer a parked run survives a browser refresh but not a server restart (fine for live use; a stale parked run is just re-run). Supply the `MemorySaver` only when the agent declares `hitl=True`.

## Write-path agents: dry-run first

For agents that mutate something external, default the decision to `dry_run` and require an explicit `live`. The `apply` node computes the exact write on dry-run and changes nothing; on `live` it snapshots for rollback, writes, and verifies. Surface distinct controls ("Approve · dry run" vs "Apply live") for write agents.

## Surfacing the proposal

The interrupt payload's `proposal` is what the human judges — render it (e.g. as markdown) in the approval panel. Put the human-readable draft there; keep any machine artifact (staged HTML, a diff) separate and only used after approve.

## Multiple gates (sequential interrupts in one run)

A run can pause more than once. Your driver handles it: on resume it drives the graph and, if it hits ANOTHER `interrupt()`, it RE-parks and re-emits `awaiting_approval`. So a two-gate agent is just two `interrupt()` nodes on the path (e.g. gate 1: pick one of N proposed ideas; gate 2: approve the written draft). Each gate is its own pause/resume cycle on the same `thread_id`.

Two rules for multi-gate:
- **Every interrupt value must carry a `proposal` key** — the driver reads it for the approval panel at each pause. A gate without it breaks the stream.
- **Resolve a CHOICE from the decision** when a gate is a pick, not just approve/reject:

```python
def _pick_index(decision, n):           # gate 1: which of the N proposed ideas?
    if isinstance(decision.get("choice"), int):
        return max(0, min(decision["choice"], n - 1))
    for tok in str(decision.get("edited") or "").split():
        if tok.isdigit():
            return max(0, min(int(tok) - 1, n - 1))
    return 0                            # approve with no pick -> the top idea
```

A reject at an EARLY gate still flows to the terminal node (you can't skip nodes), so the terminal node must detect "nothing was produced" (e.g. `if not state.get("post")`) and report a clean rejection rather than publishing an empty result.

## Common mistakes

- **No checkpointer** -> `interrupt()` raises / never pauses. Supply one when `hitl=True`.
- **New graph object on resume** -> lost state. Resume must reuse the parked compiled graph.
- **Trailing assistant turn before a tool-less call** -> Anthropic rejects it. Rebuild a clean `[System, Human]` for the propose/judge step.
- **Emitting the proposal as the final result** -> the UI shows it as "done" instead of "awaiting approval". The proposal goes in the interrupt payload; the final (unnamed) message is produced AFTER resume.
