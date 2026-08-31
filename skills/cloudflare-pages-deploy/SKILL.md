---
name: cloudflare-pages-deploy
description: >-
  Deploy a static or framework site to Cloudflare Pages from a headless shell
  with wrangler, without an interactive `wrangler login`. Use whenever the task
  is to deploy, ship, push live, or promote a Cloudflare Pages project; to set
  up deploys from CI, a container, an agent, or a machine that cannot open a
  browser; to fix a deploy that "succeeded" but did not update the production
  domain; or to debug environment variables that vanish after a deploy, Pages
  Functions that 404, or a stale 404 that keeps serving after the file is live.
  Encodes token-based auth and the mandatory account ID, the `--branch` flag
  that decides production vs preview, `wrangler.toml [vars]` overwriting
  dashboard plain-text variables, and edge-cached 404s.
---

# Cloudflare Pages: headless deploy

`wrangler pages deploy` is the whole product surface, and almost every way it
goes wrong is silent. It exits 0, prints a success URL, and leaves production
untouched. This skill is the recipe plus the four failures that actually happen.

Never paste a token value into a file, a commit, a log, or chat. Auth is
environment variables, resolved at deploy time.

## The one-shell rule

Environment variables do not persist between separate shell invocations. Resolve
the token, set the account ID, build, and deploy **in a single shell**. A deploy
split across calls fails on the second one with an auth error that looks like a
bad token but is an empty one.

## Auth: two variables, both required

```bash
export CLOUDFLARE_API_TOKEN=...     # token with the Cloudflare Pages:Edit permission
export CLOUDFLARE_ACCOUNT_ID=...    # the 32-hex account ID
npx wrangler pages deploy <dir> --project-name <project> --branch=main
```

`CLOUDFLARE_ACCOUNT_ID` is **not optional** when the token is scoped to Pages.
A scoped token cannot list the accounts it belongs to, so wrangler's
auto-discovery fails with:

```
Failed to automatically retrieve account IDs for the logged-in user.
```

That error reads like an auth failure. It is not. The token is fine; wrangler
just has nowhere to look. Set the account ID explicitly and it goes away. Find
it in the Cloudflare dashboard URL (`dash.cloudflare.com/<account-id>`) or with
an account-scoped token via `npx wrangler whoami`.

Do not run `wrangler login` on a headless machine. It opens a browser, hangs,
and on timeout leaves a half-written config that makes later token-based deploys
behave inconsistently. If one was already attempted, `npx wrangler logout` first.

For pulling the token from a secrets manager, CI provider, or `.env` instead of
exporting it by hand, see `reference/01-auth.md`.

## `--branch` decides production vs preview

**`--branch=main` (or whatever the project's production branch is) is required.**

Without it, wrangler ships a **preview** deployment. You get a `Success!` line
and a working `<hash>.<project>.pages.dev` URL, so it looks deployed. The custom
production domain does not change. This is the single most common "the deploy
worked but the site is stale" report.

On a direct-upload project, `--branch` is a routing label only. It has nothing
to do with which git branch the files were built from. Building from a feature
branch and deploying `--branch=main` is normal and correct when you are shipping
a release candidate to production from a non-default branch.

Confirm the project's production branch name before assuming `main`:

```bash
npx wrangler pages project list
```

That is also the source of truth for the exact project name, which must match
`--project-name` character for character. A typo creates a brand new project
rather than erroring, so a wrong name shows as a successful deploy of a site
nobody is looking at.

## Framework sites: build vars bake in at build time

For Astro, Next, Vite, and friends, any public/client-side variable
(`PUBLIC_*`, `NEXT_PUBLIC_*`, `VITE_*`) is inlined into the bundle by the
bundler. Setting it in the deploy shell after `npm run build` does nothing.
Set it **before the build, in the same shell as the build**:

```bash
export PUBLIC_API_URL=https://api.example.com
npm run build
npx wrangler pages deploy dist --project-name my-site --branch=main
```

Runtime bindings are a separate mechanism and are covered below.

## The four gotchas

Full detail and reproduction steps in `reference/02-gotchas.md`. In short:

1. **`wrangler.toml [vars]` overwrites dashboard plain-text variables on every
   deploy.** Plain-text vars set only in the dashboard silently disappear.
   Dashboard **secrets** (encrypted) survive untouched. So a deploy can leave a
   site with a working secret API key and a missing plain-text base URL, which
   presents as a confusing partial outage. Put every plain-text runtime binding
   in `wrangler.toml [vars]` and commit it; treat the dashboard's plain-text
   section as read-only.

2. **`pages deploy dist` drops Pages Functions.** Functions must live inside the
   uploaded directory. If `functions/` sits next to `dist/` rather than in it,
   the deploy succeeds and every API route 404s. Copy it in before deploying.

3. **Cloudflare's edge caches 404s.** Poll a URL before the file exists and the
   negative response is cached, often for hours, and keeps being served after
   the file lands. Client-side `cache: 'no-store'` skips only the local cache.
   Bust it with a query string: `${url}?_=${Date.now()}`.

4. **PowerShell prints `NativeCommandError` on wrangler's stderr.** Harmless.
   Wrangler writes progress to stderr and PowerShell wraps each line in an
   ErrorRecord, setting `$?` to false on a clean exit 0. The
   `Deployment complete` / `Success!` line is the truth, not `$?`.

## Verify, every time

A deploy is not done until a request proves it. Check the **custom domain**, not
the `pages.dev` URL, since that is exactly the difference a missing `--branch`
hides.

```bash
curl -sIL "https://example.com/?_=$(date +%s)"          # expect 200
curl -s  "https://example.com/api/health?_=$(date +%s)"  # Functions: expect not-404
```

Append the cache-buster when checking a path that was polled before it existed,
then check the clean URL once, so the busted 200 is what gets cached.

## Checklist

1. `npx wrangler pages project list` for the exact project name, deploy
   directory, and production branch name.
2. Framework site: export build-time `PUBLIC_*` vars, then `npm run build`.
3. Pages Functions: copy `functions/` into the deploy directory.
4. In **one** shell: resolve `CLOUDFLARE_API_TOKEN`, set
   `CLOUDFLARE_ACCOUNT_ID`, run
   `wrangler pages deploy <dir> --project-name <project> --branch=<prod-branch>`.
5. Read the `Deployment complete` line. Ignore PowerShell stderr noise.
6. Curl the custom domain and any Function route. Bust cached 404s.
7. Any new plain-text runtime var goes in `wrangler.toml [vars]`, committed,
   never the dashboard alone.

Parameterized scripts for both shells: `assets/deploy.sh`, `assets/deploy.ps1`.
