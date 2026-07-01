# Infra + environment gotchas

## Where LangSmith actually lives

- **LangSmith the platform** (datasets, experiments, the Evaluators page, hosted rules) is
  **LangChain's hosted cloud SaaS** at `smith.langchain.com`. NOT Docker, NOT local. Your eval
  data lives in their cloud — that's why it shows in the browser.
- **The SDK + LangGraph** are pip installs in a Python venv. **The `langgraph dev` server** is
  a local Python process, not a container.

## Self-hosting

- **Self-hosted LangSmith needs an ENTERPRISE license** (a license key from sales). The
  Developer/Plus cloud tiers cannot be self-hosted. Deployment is a multi-container stack —
  Kubernetes (Helm, prod) or Docker Compose (dev): LangSmith backend + frontend + workers,
  **ClickHouse** (trace storage), **Postgres**, **Redis**, S3-compatible blob storage. ~4+ vCPU
  / 16GB+ RAM minimum. Heavy. Don't self-host LangSmith for normal use.
- **For OSS / data-local self-hosting, use Langfuse** (open-source LLM observability + evals +
  datasets, clean Docker/K8s self-host), or **Phoenix (Arize)**. Or no server at all:
  `openevals` / `ragas` / `deepeval` run evaluators locally.
- For a quick start or demo: stay on LangSmith cloud (free Developer tier). Self-hosting adds
  cost and ops risk for no upside.

## Environment traps

- **`load_dotenv(override=True)` clobber.** If an app module calls `load_dotenv(override=True)`,
  it walks UP the tree and a stray parent `.env` (e.g. one in a parent directory) overrides your
  explicit env when you run the app off-server. Neutralize it before importing the app module:
  ```python
  import dotenv; dotenv.load_dotenv = lambda *a, **k: False
  ```
  and set the needed env vars explicitly first. Symptom seen: an eval silently used the wrong
  embedding model/collection.

- **Git Bash mangles POSIX paths to native CLIs.** A `/path` arg gets rewritten to a Windows
  path (`/secret/path` → `C:/Program Files/Git/...`), e.g. for a secrets-manager CLI. Fix:
  ```bash
  export MSYS_NO_PATHCONV=1 MSYS2_ARG_CONV_EXCL='*'
  ```
  This is a shell quirk, not a tool/auth error.

- **SDK version split.** Different envs can carry different `langsmith` versions (e.g. 0.7.x vs
  0.8.x). The core methods used here (`evaluate`, `Client.create_dataset/create_examples/
  has_dataset/list_runs/list_feedback`) exist across both, but pin a version per venv if a method
  is missing. Rule creation/automation methods are NOT on the `Client` in these versions — use REST.

## Discovering the REST schema

LangSmith's REST schema shifts. Pull it live and inspect the relevant components rather than
trusting a hardcoded payload:
```python
spec = httpx.get("https://api.smith.langchain.com/openapi.json").json()
spec["components"]["schemas"]["RunRulesCreateSchema"]        # rule fields
spec["components"]["schemas"]["EvaluatorStructuredOutput"]   # the LLM-judge config
```
