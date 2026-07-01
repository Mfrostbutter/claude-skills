# 06 · Graph patterns

Reach for the smallest shape that fits.

## ReAct tool-loop

Investigate by calling read-only tools until the model stops, then conclude.

```python
g.add_conditional_edges("investigate", tools_condition, {"tools": "tools", END: "conclude"})
g.add_edge("tools", "investigate")
```
Route a cheap model here (diagnosis is within a small model's range). Read-only.

## Parallel fan-out / reduce

A plan node dispatches N lenses that run concurrently in ONE superstep, then a synthesize node reduces. Use an **additive** state channel so parallel nodes append without clobbering:

```python
class HealthState(MessagesState):
    findings: list      # each lens returns {"findings": [one]}; they concatenate
```
Shows real branching topology in the graph view.

## Routing pipeline

One graph chains triage -> assess -> conditional route -> propose -> approve[interrupt] -> apply, with an escalate branch. `assess` uses structured output to classify, `route` returns the next node name:

```python
def route(state): return "propose" if state["is_fixable"] else "escalate"
g.add_conditional_edges("assess", route, {"propose": "propose", "escalate": "escalate"})
```

## Two-model content

Cheap model ranks/routes (structured), quality model writes prose. Inject both into the factory: `build(ranker, writer, effects, checkpointer)`. Make the ranker from the writer's key (`_anthropic_key_from`, see `02`). Ends in an interrupt + a stage node that dry-runs without creds.

## Cross-provider reviewer

A DIFFERENT vendor's model judges the primary's output before it acts (autonomy with a second opinion). Inject a `reviewer_llm` built from another provider (`langchain-openai` + that provider's key). A different model family is less likely to share the primary's blind spot.

## Grounding fact-check + bounded self-repair

For any agent that generates factual content from sources, add a check BEFORE the human sees it. A `factcheck` node grounds every concrete claim (names, version numbers, dollar amounts, dates, counts) against the SOURCE TEXT the draft was built from (not the model's memory), returning structured flags. Then a conditional edge auto-revises ONCE on high-severity flags and re-checks; remaining flags get baked into the interrupt proposal so the human sees "claims to verify" with the draft.

```
assemble -> factcheck -> (route) -> revise -> assemble   (bounded: revise_count < MAX)
                                  \-> review[interrupt]
```

Keys: ground against the provided sources, not world knowledge; flag, do not silently rewrite (the human is the final gate); bound the loop (1 auto-revision) so it cannot spin; never block the pipeline on a checker failure (fail to zero flags). Catches the "wrong version / invented number" class of hallucination. A cross-provider checker is the stronger v2.

## Multi-gate content agent + live publish

Two-model content (above) with TWO human gates and a consequential publish:

```
ingest -> ideate -> review_ideas[interrupt] -> prepare -> write -> factcheck
       -> (revise)* -> review_draft[interrupt] -> publish -> END
```

Gate 1 picks one of N proposed ideas; gate 2 approves the written draft with a `mode: "dry_run"|"live"`. The terminal `publish` node is the gated action: on `live` it writes the artifact (and e.g. commits/pushes so CI deploys it); dry-run (default) writes a draft file and never pushes. Keep the publish effect injected so Studio runs it in dry-run. Fail the publish CLOSED (report the error; leave the file staged) so a push problem never silently looks live.

## Dedup by reading the live output

When the agent's past output IS a queryable artifact (published posts, staged files), dedup against THAT, not only a DB. Reading the live artifacts is a source of truth that can't drift and respects items a human added by hand. Layer a small committed ledger (artifact -> sources consumed) on top so the agent won't re-mine the same source. Both fail open (treat everything as fresh) so a dedup hiccup never blocks a run. Contrast: dedup against a `*_seen` table keyed on canonical URL when the inputs are external feeds, not local artifacts.

## Structured output for decision nodes

Any node that classifies, selects, scores, or judges should return a pydantic model via `llm.with_structured_output(Model)`, not free text you parse.

## Choosing a model tier

- Cheap/fast model: triage, classify, rank, route, summarize lenses (good enough, low cost).
- Quality model: propose a fix, write prose, anything correctness- or voice-sensitive.
- Override per agent via an env var (e.g. `OPS_TRIAGE_MODEL`) without code changes.
