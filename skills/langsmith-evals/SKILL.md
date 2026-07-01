---
name: langsmith-evals
description: >-
  Evaluate and observe LangChain / LangGraph agents and RAG pipelines with
  LangSmith. Use whenever the task is to build an eval suite (datasets,
  evaluators, experiments), score an agent or RAG pipeline, add an LLM-as-judge,
  gate a PR on eval scores, set up a hosted/online evaluator that scores live
  production traces, wire LangSmith tracing, read experiment results back
  programmatically, or stand up LangGraph Studio (`langgraph dev`). Triggers:
  "build evals", "eval my agent", "I have no evals", "add a faithfulness /
  correctness / hallucination check", "RAG eval", "LLM-as-judge", "score
  production traffic", "online evaluator", "evals as a CI gate", "set up
  Studio", "langgraph dev won't start / won't load my graph", "why aren't my
  evaluators on the Evaluators page". Complements the `langgraph-agent` skill,
  which BUILDS agents; this one EVALUATES and OBSERVES them. Encodes the eval
  vocabulary, the two-tier offline pattern, the RAG triad, code-vs-LLM-judge,
  the hosted-rule REST recipe with the singular input./output. variable_mapping
  gotcha and the dumpd model-serialization requirement, the workspace-secret
  requirement, and the stable langgraph-dev version pins.
---

# Evaluating + observing agents with LangSmith

An eval is a **test for a non-deterministic system**: run a target over a dataset of examples, **score** each output with evaluators, and track scores across versions to catch regressions. It is not a unit test (`f(x)==y`) because the output varies; you score against criteria instead of asserting equality.

Four parts, name them in these words:

| Part | What it is |
|---|---|
| **Dataset** | examples = `inputs` + a *reference* output (the expected / known-good) |
| **Target** | the thing under test (an agent, a node, a pure function, a RAG pipeline) |
| **Evaluator** | scores one output — **code** (oracle exists), **LLM-as-judge** (fuzzy), or human |
| **Experiment** | one run of target × dataset × evaluators → comparable scores you diff |

Two axes that decide everything below:
- **Offline vs online.** Offline = dataset + experiments, run in CI pre-merge to catch regressions. Online = score live production traces server-side, route low scores to a human, feed failures back into the dataset. Build offline first; add online to close the loop.
- **Code vs LLM-judge.** Use **code** wherever ground truth exists (cheaper, deterministic, CI-able, free). Reserve **LLM-judge** for properties with no oracle (faithfulness, helpfulness). Keep the judge a **different model/vendor than the generator** — no model marks its own homework.

Three granularities for an *agent* eval — cover at least two: **final response** (end-to-end outcome), **trajectory** (right steps/tools in order), **single step** (one node's decision).

## The build procedure

1. **Pick a target.** Prefer a **verifiable-domain** agent (coding/ops, where correctness is checkable) so most evaluators can be code, not a judge. For a RAG app, the target is the real retrieval+generation pipeline — import the app's production functions, do not reimplement.
2. **Scaffold `evals/`** next to the code (not in `tests/`): `datasets.py`, `targets.py`, `evaluators.py`, `run_evals.py`, `README.md`. See `reference/01-offline-evals.md` for the shape of each. Write evaluators as plain scorers `f(outputs, reference, inputs) -> {key, score, comment}` and adapt to LangSmith's `(run, example)` with one wrapper — the same scorer then runs in your local CI runner AND in `evaluate()`.
3. **Go two-tier when ground truth exists.** A `safety`/deterministic tier over pure functions (no API key, exact-match, CI gate, non-zero exit on fail) plus a `behavior` tier over the real agent (real models + one cross-vendor LLM-judge). The cheap tier runs free in CI.
4. **Run local first, then upload.** `run_evals.py` is dual-mode: a local score table with a CI exit code, or `--langsmith` to call `evaluate()` and push an experiment. Validate the numbers locally before spending on a cloud run.
5. **Read the first run skeptically.** The first run debugs your **evaluators** as much as your agent. Read the actual outputs before trusting a low score — naive code evaluators (e.g. a regex flagging "his" when the answer narrates about a third party) produce false positives. Fix the evaluator, re-run.
6. **Close the loop online (optional).** Add a hosted LangSmith automation rule (LLM-judge) that scores live traces server-side. See `reference/02-online-evaluators.md`.

## Hard-won rules (each cost real time — do not relearn them)

- **Online-rule `variable_mapping` uses SINGULAR roots**: `input.question`, `output.answer`. Plural (`inputs.`/`outputs.`) silently resolves to null → every score comes back 0. Diagnose by reading the evaluator's OWN trace, not the score. Dry-run with `/runs/rules/validate` + `test_inputs`/`test_outputs`.
- **An online-rule `model` must be a LangChain-SERIALIZED model** (`dumpd(ChatOpenAI(...))`), not a `{model, provider}` dict. LangSmith deserializes it into a Runnable.
- **Hosted evaluators need a WORKSPACE model secret** (LangSmith → Settings → Workspace → Secrets) named EXACTLY `OPENAI_API_KEY` / `ANTHROPIC_API_KEY`. They run on LangSmith's servers, so they need their own credentials. No public API to set it — UI only.
- **`langgraph dev` needs STABLE server pins.** `pip install langgraph-cli[inmem]` can pull broken prereleases. Pin `langgraph-api==0.10.0` + `langgraph-runtime-inmem==0.30.0`. See `reference/03-studio-setup.md`.
- **Studio loads the graph by MODULE path, not file path.** `pip install -e .` and set `langgraph.json` graph to `pkg.module:graph` — a `./src/.../file.py:graph` spec breaks relative imports.
- **LLM-judge vendor ≠ generator vendor.** A judge from a different model family is less likely to share the generator's blind spot.
- **Don't trust a blended RAG-triad average.** Guardrail questions (refusals, knowledge misses) intentionally score low on relevance; bucket them separately. `faithfulness` is the headline (grounded, no hallucination).

## Reference (load on demand)

- `reference/01-offline-evals.md` — the `evals/` package shape, evaluator/scorer pattern, `evaluate()` dual-mode, dataset upsert, fetching results, the two-tier + RAG-triad recipes.
- `reference/02-online-evaluators.md` — hosted automation rules via REST `/api/v1/runs/rules`: full payload, model serialization, the variable_mapping gotcha, workspace secret, `@traceable` to feed the project, triggering + reading scores.
- `reference/03-studio-setup.md` — `langgraph dev` + Studio: version pins, editable install, module-path graph spec, health checks.
- `reference/04-infra-and-gotchas.md` — LangSmith is hosted SaaS (self-host = Enterprise; Langfuse for OSS); the `load_dotenv(override=True)` clobber; the Git-Bash `MSYS_NO_PATHCONV` trap; SDK version split.

Ship a `README.md` inside `evals/` that doubles as the eval vocabulary + how-to-run cheat sheet.
