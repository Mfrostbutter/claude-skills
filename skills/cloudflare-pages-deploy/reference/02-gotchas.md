# Gotchas

Each of these produces a **successful-looking deploy** with a broken result.
That is what makes them expensive: nothing in the deploy output is red.

---

## 1. `wrangler.toml [vars]` overwrites dashboard plain-text variables

`wrangler pages deploy` rewrites the deployment's plain-text runtime bindings
from `wrangler.toml [vars]` on **every** deploy. Any plain-text environment
variable that exists only in the Cloudflare dashboard is dropped.

Encrypted **secrets** are a different store and survive untouched.

### Why it is confusing

The failure is partial. A site configured with a secret API key in the dashboard
and a plain-text base URL in the dashboard will, after the next deploy, still
authenticate correctly and still fail, because the key survived and the URL did
not. The symptom looks like a broken integration, not a broken deploy.

### The rule

Every plain-text runtime binding lives in `wrangler.toml [vars]`, committed to
the repo. Treat the dashboard's "Environment Variables -> Plain text" section as
read-only in a wrangler-deployed project.

```toml
name = "my-site"
compatibility_date = "2024-09-23"
pages_build_output_dir = "dist"

[vars]
API_BASE_URL = "https://api.example.com"
LIST_ID = "42"

[env.preview.vars]
API_BASE_URL = "https://staging-api.example.com"
LIST_ID = "1"
```

Secrets never go here. `[vars]` is plain text, ships readable to the edge, and
is in your git history forever. Use the dashboard's encrypted secrets or:

```bash
npx wrangler pages secret put API_KEY --project-name my-site
```

### Verifying

After a deploy, check the deployment's bindings in the dashboard, or hit an
endpoint that echoes a non-sensitive var. Do not assume the dashboard's current
display reflects what the last deploy actually shipped.

---

## 2. `pages deploy dist` silently drops Pages Functions

Pages Functions are discovered from a `functions/` directory **inside the
uploaded directory**. The conventional repo layout puts `functions/` at the repo
root, next to `dist/`, so `wrangler pages deploy dist` uploads the static build
and no Functions at all.

The deploy reports success. Every API route returns 404.

### Fix

Copy them in before deploying, as part of the build step:

```bash
rm -rf dist/functions && cp -r functions dist/functions
npx wrangler pages deploy dist --project-name my-site --branch=main
```

`rm -rf` first, so a renamed or deleted Function does not linger from a previous
copy. Wire this into `package.json` rather than remembering it:

```json
{ "scripts": { "build": "astro build && rm -rf dist/functions && cp -r functions dist/functions" } }
```

Some frameworks copy a `public/` directory into the build output automatically
and can be made to carry Functions along; check your adapter before adding the
manual copy, so you do not end up with two competing sources.

### Verifying

```bash
curl -s -o /dev/null -w '%{http_code}\n' "https://example.com/api/contact?_=$(date +%s)"
```

404 means the Function did not ship. Anything else, including a 405 for a
GET against a POST-only route, means it did.

---

## 3. Cloudflare caches 404s at the edge

A request for a URL that does not exist yet gets its 404 cached at the edge,
commonly for hours. When the file finally lands at origin, the edge keeps
serving the cached 404.

This bites hardest in exactly the situation you would expect not to matter:
polling a URL to wait for a deploy to finish. The polling itself is what
poisons the cache.

### Why the obvious fixes do not work

- `fetch(url, { cache: 'no-store' })` skips only the **browser's** cache. The
  request still hits the edge and still gets the cached 404.
- `Cache-Control: no-cache` request headers are not honored as a cache bypass by
  the edge for anonymous requests.

### Fix

Change the URL. A query string is enough, because the cache key includes it:

```bash
curl -sIL "https://example.com/assets/new-file.js?_=$(date +%s)"
```

```js
const res = await fetch(`${url}?_=${Date.now()}`);
```

Apply the buster to the final resource URL too, once the file is confirmed live.
The clean URL is a separate cache key and is still holding a 404. Requesting it
once after the file exists caches the 200 and returns things to normal.

### Prevention

Prefer polling the deployment status rather than the asset. `wrangler pages
deployment list --project-name my-site` tells you the deploy finished without
touching the asset URL at all. If you must purge, do it from the dashboard's
**Caching -> Configuration -> Purge Cache**, or the zone purge API.

---

## 4. PowerShell reports `NativeCommandError` on a clean deploy

Wrangler writes progress and status to **stderr**. Windows PowerShell 5.1 wraps
each stderr line from a native executable in an ErrorRecord and sets `$?` to
`$false`, even when the process exited 0.

So a completely successful deploy prints red text and fails an `if ($?)` check.

### Rules

- Judge success by the `Deployment complete` / `Success!` line and the exit
  code, never by `$?`.
- Do not add `2>&1`. It makes this worse, not better; the redirect is what
  produces the wrapped ErrorRecords in the first place.
- If you need a programmatic check, read `$LASTEXITCODE`, which reflects the
  real process exit code:

```powershell
npx wrangler pages deploy dist --project-name my-site --branch=main
if ($LASTEXITCODE -ne 0) { throw "deploy failed with exit code $LASTEXITCODE" }
```

---

## 5. A wrong `--project-name` creates a new project

`wrangler pages deploy` does not error on an unrecognized project name. Depending
on version and flags it will create the project, then deploy into it. You get a
success line and a live `pages.dev` URL for a project with no custom domain,
while the real site sits untouched.

Always take the name from `npx wrangler pages project list` rather than memory,
and verify against the **custom domain** after deploying, never the `pages.dev`
URL printed by the deploy.

Clean up a project created by accident from the dashboard, or:

```bash
npx wrangler pages project delete <accidental-name>
```

---

## 6. `pages_build_output_dir` vs the positional directory

Newer `wrangler.toml` files declare `pages_build_output_dir`. The positional
argument to `pages deploy` still wins when both are present, and mismatches
between them are a quiet source of "I deployed the wrong folder". Deploying
`.` when the build output is `dist` uploads the entire repo, including
`node_modules` and any gitignored file sitting in the tree.

Keep them consistent, and be deliberate about ever passing `.`.
