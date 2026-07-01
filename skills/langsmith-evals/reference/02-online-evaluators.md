# Hosted (online) evaluators — LangSmith automation rules

Offline evaluators run on YOUR machine (only scores upload, so they never appear on
LangSmith's "Evaluators" page). A **hosted/online evaluator** runs on LangSmith's servers and
auto-scores **live traces** in a tracing project — the online half of the loop. It is a
LangSmith **automation rule**. There is **no SDK method**; use the REST API.

## Recipe

### 1. Prereq: a workspace model secret (UI, one-time)
LangSmith → Settings → Workspace → **Secrets** → add the key named EXACTLY `OPENAI_API_KEY`
or `ANTHROPIC_API_KEY`. Hosted evaluators run server-side, so they need their own model
credentials. A mis-named secret → `api_key must be set`. No public API to set this.

### 2. Serialize the judge model — NOT a config dict
The rule's `model` field must be a LangChain-serialized chat model; a `{model, provider}`
dict is rejected (`Input should be an instance of Runnable`).

```python
from langchain_core.load import dumpd
from langchain_openai import ChatOpenAI          # judge ≠ generator vendor
MODEL = dumpd(ChatOpenAI(model="gpt-4o-mini", temperature=0))
```

### 3. Build the rule payload
`POST /api/v1/runs/rules`. Required: `display_name`, `sampling_rate`, and `session_id`
(the tracing project) or `dataset_id`.

```python
EVALUATOR = {"structured": {
    "prompt": [["system", "You are a strict faithfulness grader. ..."],
               ["human", "Question:\n{{question}}\n\nContext:\n{{context}}\n\nAnswer:\n{{answer}}\n\nGrounded?"]],
    "template_format": "mustache",
    "schema": {"type": "object",
               "properties": {"score": {"type": "integer", "enum": [0, 1]}, "reasoning": {"type": "string"}},
               "required": ["score"]},
    # SINGULAR roots. Plural (inputs./outputs.) silently yields null -> all scores 0.
    "variable_mapping": {"question": "input.question",
                          "answer": "output.answer",
                          "context": "output.contexts_text"},
    "model": MODEL,
}}
RULE = {"display_name": "faithfulness (online)", "sampling_rate": 1.0,
        "is_enabled": True, "session_id": SESSION_ID, "evaluators": [EVALUATOR]}
```

`schema` keys become feedback: `score` → feedback score, `reasoning` → comment.

### 4. Validate BEFORE creating
`POST /api/v1/runs/rules/validate` actually INVOKES the evaluator and accepts
`test_inputs` / `test_outputs` to dry-run the mapping. Use it to confirm variables resolve:

```python
payload = {**RULE, "test_inputs": {"question": "Q"},
           "test_outputs": {"answer": "A", "contexts_text": "CTX"}}
r = httpx.post(f"{BASE}/api/v1/runs/rules/validate", headers=H, json=payload)
# response[0]["inputs"] shows the RESOLVED variables. If question/answer/context are null,
# your variable_mapping paths are wrong (see roots below).
```

### 5. Create, then feed it traces
After create, emit traces into the project so the rule has traffic:

```python
import os; os.environ["LANGSMITH_TRACING"] = "true"; os.environ["LANGCHAIN_PROJECT"] = PROJECT
from langsmith import traceable

@traceable(name="my-app", run_type="chain")
def ask(question):                  # args -> run.inputs ; return dict -> run.outputs
    return {"answer": ..., "contexts_text": ...}
```

Rules apply to incoming runs on a schedule (per `sampling_rate`). The `/trigger` endpoint was
flaky (500s); the scheduled pass fired within ~30-60s anyway. Then read feedback via
`list_runs(project_name=PROJECT) + list_feedback`.

## The variable_mapping gotcha (cost the most time)

| Want | Correct path | Wrong (silently null) |
|---|---|---|
| a run **input** field | `input.question` (or bare `question`) | `inputs.question` |
| a run **output** field | `output.answer` | `outputs.answer`, `answer` |

Roots are **singular**. A wrong mapping does NOT error — it resolves to null, the judge grades
an empty prompt, and you get score=0 everywhere. **Diagnose by reading the evaluator's own
trace** (in the `evaluators` project): inspect its `inputs` and the filled LLM prompt. If the
prompt is blank, it's the mapping, not the agent.

## Hosted vs code evaluators (say this distinction)

| | Code/SDK (offline) | Hosted (online) |
|---|---|---|
| Lives in | your repo, version-controlled | LangSmith (UI / REST) |
| Runs | locally / CI | LangSmith servers |
| Best for | deterministic, CI gate, has an oracle | scoring live prod traffic |
| Needs | nothing extra | a workspace model secret |
| Shows on Evaluators page | no (only scores upload) | yes |

## REST quick reference

- `POST /api/v1/runs/rules` — create. `GET` — list. `DELETE /{id}` — remove.
- `POST /api/v1/runs/rules/validate` — dry-run with `test_inputs`/`test_outputs`.
- Auth header: `{"x-api-key": LANGSMITH_API_KEY}`. Base: `https://api.smith.langchain.com`.
- Discover the exact schema from `https://api.smith.langchain.com/openapi.json`
  (`RunRulesCreateSchema`, `EvaluatorStructuredOutput`) — it shifts over time.
