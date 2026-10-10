# Filming n8n (2.3x): selectors, state and traps

Selectors that held on n8n 2.35 (`data-test-id`):

| Element | Selector |
|---|---|
| canvas node by name | `[data-test-id=canvas-node]:has-text('Fetch rates')` (dblclick opens the NDV) |
| NDV credential select | `[data-test-id=node-credentials-select]`, items `.el-select-dropdown__item:has-text('…')` |
| NDV parameter | `[data-test-id=parameter-input-<name>]` (`input` or `[contenteditable]` inside) |
| execute node | `[data-test-id=node-execute-button]`; output `[data-test-id=output-panel]` |
| project credentials | `/projects/<id>/credentials`, `[data-test-id=add-resource-credential]`, list rows `[data-test-id=resources-list-item]:has-text('…')` |
| credential dialog | `[data-test-id=credential-edit-dialog]`, name `[data-test-id=credential-name]`, save `[data-test-id=credential-save-button]`, tabs `[data-test-id=sharing]` |
| credential type picker | type the name, Enter, then `[data-test-id=new-credential-type-button]` |
| expression toggle | hover the field, then the nearest `[data-test-id=radio-button-expression]` by y; typing `{{` does not switch |
| External Secrets page | `/settings/external-secrets`, `[data-test-id=secrets-provider-display-name]` |

First-run noise: the personalisation modal (`button:has-text('Get started')`), the NPS survey
(`.el-overlay:has([data-test-id=nps-survey-modal])` hidden by CSS), banners (`[data-test-id=banner-stack]`).

Server state through the public API (`/api/v1`, `X-N8N-API-KEY`):

- Create a workflow then `PUT /workflows/{id}/transfer {destinationProjectId}`; creating directly in a team
  project 404s. Same for credentials. Deleting through the API archives in 2.x.
- `POST /projects` takes `{name}` only. Users: `POST /users` invites; accept with
  `POST /rest/invitations/accept` using the token from `inviteAcceptUrl`.
- Session calls to `/rest/*` need a `browser-id` header and, from `httpx`, an explicit `cookie: n8n-auth=…`
  header (the jar drops cookies for `localhost`). Manual run: `POST /rest/workflows/{id}/run` with
  `{workflowData, runData: {}, startNodes: [], triggerToStartFrom: {name}}`; read the execution through
  `/api/v1/executions/{id}?includeData=true` (the `/rest` execution data is flatted JSON).
- External Secrets (Enterprise): vaults live under `/rest/secret-providers/connections` (providerKey is the
  `$secrets.<key>` segment, case-sensitive; PATCH `settings`, `projectIds` ([] = global), `isEnabled`; then
  `/test` and `/reload`). The older `/rest/external-secrets/providers/<type>` endpoint configures a shadow
  provider the credential validator cannot see ("secret provider does not exist in this project" on save).
  `POST /rest/external-secrets/settings {systemRolesEnabled: true}` lets project roles use vault secrets.
- Audit lines from a custom node reach the text log only through the message string; metadata fields are
  dropped unless `N8N_LOG_FORMAT=json`. Toggling log env vars needs a container recreate, and `/rest/login`
  404s for a few seconds after `/healthz` is green.
