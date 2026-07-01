"""Copy-paste eval runner skeleton: local CI table | --langsmith upload.

Fill in DATA (examples), target(inputs)->outputs, and SCORERS. A scorer is
f(outputs, reference, inputs) -> {"key","score","comment"}; score in [0,1] or None to skip.
"""
from __future__ import annotations

import argparse


# --- 1. dataset: examples = inputs + reference outputs -----------------------
DATA = [
    {"inputs": {"q": "..."}, "outputs": {"expected": "..."}},
]


# --- 2. target: function(inputs) -> outputs ----------------------------------
def target(inputs: dict) -> dict:
    # call your agent / pure function / RAG pipeline; return a flat dict the scorers read
    return {"expected": inputs["q"].upper()}


# --- 3. evaluators: one shape, code or LLM-judge -----------------------------
def exact_match(outputs, reference, inputs=None) -> dict:
    ok = outputs.get("expected") == reference.get("expected")
    return {"key": "exact_match", "score": 1.0 if ok else 0.0, "comment": str(outputs.get("expected"))}


SCORERS = [exact_match]


def as_langsmith(scorer):
    def _e(run, example):
        r = scorer(run.outputs or {}, example.outputs or {}, example.inputs or {})
        return {"key": r["key"], "score": r.get("score"), "comment": r.get("comment", "")}
    _e.__name__ = scorer.__name__
    return _e


# --- 4. runner: local (CI exit code) or LangSmith ----------------------------
def run_local() -> bool:
    totals, all_pass = {}, True
    for ex in DATA:
        out = target(ex["inputs"])
        for s in SCORERS:
            r = s(out, ex["outputs"], ex["inputs"])
            if r["score"] is None:
                continue
            totals.setdefault(r["key"], []).append(r["score"])
            if r["score"] < 1.0:
                all_pass = False
                print(f"  FAIL {r['key']}: {r['comment']}")
    for k, v in totals.items():
        print(f"  {k:24s} {sum(v)/len(v)*100:5.1f}%  ({sum(v):.0f}/{len(v)})")
    return all_pass


def run_langsmith():
    from langsmith import Client, evaluate
    c = Client()
    name = "myagent::suite"
    if c.has_dataset(dataset_name=name):
        ds = c.read_dataset(dataset_name=name)
        for ex in c.list_examples(dataset_id=ds.id):
            c.delete_example(example_id=ex.id)
    else:
        ds = c.create_dataset(dataset_name=name)
    c.create_examples(dataset_id=ds.id, inputs=[e["inputs"] for e in DATA],
                      outputs=[e["outputs"] for e in DATA])
    evaluate(target, data=name, evaluators=[as_langsmith(s) for s in SCORERS],
             experiment_prefix="myagent-suite", max_concurrency=4)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--langsmith", action="store_true")
    args = ap.parse_args()
    if args.langsmith:
        run_langsmith()
    else:
        ok = run_local()
        print("ALL PASS" if ok else "FAILURES")
        raise SystemExit(0 if ok else 1)
