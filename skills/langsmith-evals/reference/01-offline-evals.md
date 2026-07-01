# Offline evals — package shape, evaluators, evaluate(), results

## The `evals/` package

Co-locate next to the code under test (never a top-level `tests/`):

```
evals/
  __init__.py
  datasets.py     example lists + LangSmith dataset upsert
  targets.py      the function(s) under test
  evaluators.py   scorers + the as_langsmith adapter + LLM-judge factory
  run_evals.py    CLI: local score table (CI exit code) | --langsmith upload
  README.md       the eval vocabulary + how to run (doubles as a cheat sheet)
```

## datasets.py — examples are inputs + reference

Each example is `{"inputs": {...}, "outputs": <reference>}` — `outputs` is the *expected*
(ground truth) the evaluators score against, NOT the model's output.

```python
ROUTE = [
    {"inputs": {"category": "auth_credential", ...}, "outputs": {"auto_fixable": False, "severity": "high"}},
    ...
]

def upsert_langsmith_dataset(name, examples):
    from langsmith import Client
    c = Client()
    ds_name = f"myagent::{name}"
    if c.has_dataset(dataset_name=ds_name):
        ds = c.read_dataset(dataset_name=ds_name)
        for ex in c.list_examples(dataset_id=ds.id):   # wipe so dataset == code-of-record
            c.delete_example(example_id=ex.id)
    else:
        ds = c.create_dataset(dataset_name=ds_name)
    c.create_examples(dataset_id=ds.id,
                      inputs=[e["inputs"] for e in examples],
                      outputs=[e["outputs"] for e in examples])
    return ds_name
```

## targets.py — function(inputs) -> outputs

A target takes an example's `inputs` dict and returns a flat `outputs` dict the evaluators
read. Deterministic targets (pure functions) need no API key; the agent target builds real
models from env.

LangGraph gotcha: if the graph has an `interrupt()` node, compile it WITH a checkpointer
(`MemorySaver`) and a per-example `thread_id`. On interrupt, `invoke` returns a state
containing `"__interrupt__"` instead of a normal terminal — map that to your "escalated"
(or equivalent) outcome.

```python
def graph_target(inputs):
    state = _graph().invoke({...}, {"configurable": {"thread_id": inputs["id"]}})
    terminal = "escalated" if "__interrupt__" in state else state.get("outcome")
    return {"terminal": terminal, "trajectory": _names(state["messages"]), ...}
```

## evaluators.py — one scorer shape, two flavors

Write every scorer as `f(outputs, reference, inputs=None) -> {"key","score","comment"}`,
`score` in [0,1] or `None` to skip (not counted — e.g. a fix-quality judge on a run that
escalated and produced no fix). Adapt to LangSmith with one wrapper so the SAME code runs
locally and in `evaluate()`:

```python
def as_langsmith(scorer):
    def _e(run, example):
        r = scorer(run.outputs or {}, example.outputs or {}, example.inputs or {})
        return {"key": r["key"], "score": r.get("score"), "comment": r.get("comment", "")}
    _e.__name__ = scorer.__name__
    return _e
```

**Code evaluator** (oracle exists — preferred):
```python
def outcome_match(outputs, reference, inputs=None):
    ok = outputs.get("terminal") == reference.get("terminal")
    return {"key": "outcome", "score": 1.0 if ok else 0.0, "comment": f"{outputs.get('terminal')}"}
```

**LLM-as-judge** (no oracle) — different vendor from the generator, structured output, low temp:
```python
def make_fix_judge(model=None):
    def judge(outputs, reference, inputs=None):
        if not outputs.get("patch"):  # nothing to judge
            return {"key": "fix_ok", "score": None, "comment": "n/a"}
        from langchain_openai import ChatOpenAI
        from pydantic import BaseModel
        class V(BaseModel): ok: bool; reason: str
        j = ChatOpenAI(model=model or "gpt-4o", temperature=0).with_structured_output(V).invoke([...])
        return {"key": "fix_ok", "score": 1.0 if j.ok else 0.0, "comment": j.reason}
    return judge
```

## Trajectory + single-step evaluators

- **Trajectory**: recover the visited node order (from named progress messages) and assert
  invariants — e.g. `review` precedes `gate`, `gate` precedes any write. A structural check,
  not a string match.
- **Single step**: feed one state to one pure decision function (route, gate) and exact-match
  the decision. Highest-signal, fully deterministic.

## run_evals.py — local CI + LangSmith, one runner

```python
# local: iterate examples, call target, call scorers, print a table, exit non-zero on any fail
# --langsmith: upsert dataset, then
from langsmith import evaluate
evaluate(target, data=ds_name, evaluators=[as_langsmith(s) for s in scorers],
         experiment_prefix="myagent-safety", max_concurrency=4)
```

Default the runner to the free deterministic suite; require `--suite behavior` (real models +
keys) explicitly. Needs `LANGSMITH_API_KEY`; add `LANGSMITH_TRACING=true` to also capture the
agent's traces during the run.

## Fetching experiment results programmatically

The experiment name IS a project name. Aggregate run-level feedback (more reliable than
`read_project().feedback_stats`, which can lag):

```python
agg = {}
for r in client.list_runs(project_name=experiment_name, is_root=True):
    for fb in client.list_feedback(run_ids=[r.id]):
        if fb.score is not None:
            agg.setdefault(fb.key, []).append(fb.score)
# -> {evaluator_key: [scores]}; an LLM-judge that skipped some runs has a smaller n
```

## The two-tier pattern (when ground truth exists)

- `safety` — deterministic single-step evals over pure functions (`classify()`, `check_patch()`).
  No API key, exact-match, runs in CI, non-zero exit on fail. The highest-signal, free tier.
- `behavior` — the full agent over fixtures with real models, scored by final/trajectory/
  single-step code evaluators + one cross-vendor LLM-judge.

## The RAG triad

All LLM-judge (RAG quality has no code oracle), reusing the app's PRODUCTION retrieval +
generation so you score the real pipeline:
- **context_relevance** — did retrieval return relevant chunks?
- **faithfulness** — is every claim grounded in the retrieved context? (the headline — catches hallucination)
- **answer_relevance** — does the answer address the question?

Add deterministic guardrail evaluators next to the triad (voice/format rules, banned content,
jailbreak-refusal). Reading the scores: bucket guardrail questions separately — refusals and
knowledge-misses are *supposed* to score low on relevance, so a blended average understates
capability-question quality.

## The lesson: the first run debugs your evaluators

Read the actual outputs before trusting a low aggregate. Common false positives: a regex that
flags third-person pronouns referring to OTHER people; a refusal check that keyword-matches
instead of grading the security property (did the system prompt leak?). Fix the evaluator to
be principled, then re-run. This is expected, not failure.
