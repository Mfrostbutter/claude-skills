# Auth: getting a token into a headless deploy

The deploy itself only ever reads two environment variables:

| Variable | What it is |
|---|---|
| `CLOUDFLARE_API_TOKEN` | API token with the **Cloudflare Pages: Edit** permission |
| `CLOUDFLARE_ACCOUNT_ID` | 32-hex account ID, mandatory for a Pages-scoped token |

Everything below is just a different way of populating them. Pick one.

## Creating the token

Dashboard, **My Profile -> API Tokens -> Create Token -> Custom token**.

- Permission: `Account` / `Cloudflare Pages` / `Edit`.
- Account resources: include the one account you deploy to.
- No zone permissions needed for `pages deploy`. Add `Zone / DNS / Edit` only if
  the same token also manages custom domains.

Scope it to Pages:Edit and nothing else. The blast radius of a leaked deploy
token should be "can publish a bad build", not "can edit DNS".

The token is shown once. If it is lost, roll it rather than hunting for it.

## Where the account ID lives

- Dashboard URL: `https://dash.cloudflare.com/<account-id>/...`
- Dashboard, any account-level page, right sidebar, **Account ID**.
- `npx wrangler whoami`, but only with an account-scoped token. A Pages-only
  token cannot answer this, which is the whole reason the variable is required.

It is an identifier, not a secret, but it is still account-identifying. Keep it
in config rather than hardcoding it into a skill or a public README.

## Option A: a plain `.env`

Simplest for a workstation. Keep the file gitignored.

```bash
set -a; . ./.env; set +a
npx wrangler pages deploy dist --project-name my-site --branch=main
```

## Option B: GitHub Actions

```yaml
- name: Deploy to Cloudflare Pages
  env:
    CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
    CLOUDFLARE_ACCOUNT_ID: ${{ vars.CLOUDFLARE_ACCOUNT_ID }}
  run: npx wrangler pages deploy dist --project-name my-site --branch=main
```

The token is a repository **secret**; the account ID can be a plain repository
**variable**. Do not `echo` either into the log.

## Option C: a secrets manager (Vault, Infisical, Doppler, 1Password, AWS/GCP)

The pattern is identical whichever one you run. Fetch into a shell variable,
export it, never print it.

```bash
CLOUDFLARE_API_TOKEN="$(<your-cli> read --field value --plain path/to/CLOUDFLARE_API_TOKEN)"
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID=...
npx wrangler pages deploy dist --project-name my-site --branch=main
```

Two things bite here regardless of vendor:

- **Use the CLI's "raw value" flag** (`--plain`, `--field value`, `-r`,
  depending on the tool). The default output is usually a formatted table, and
  capturing that gives you a token wrapped in box-drawing characters. The
  resulting auth failure looks like a bad token.
- **Disable the CLI's update checker** for the same reason. An "a new version is
  available" banner on stdout concatenates into the captured value. Most tools
  expose an env var for this; set it before the fetch.

Trim the result. Command substitution strips trailing newlines but not trailing
carriage returns, which is a real problem for anything captured on Windows or
through a container boundary:

```bash
CLOUDFLARE_API_TOKEN="$(printf '%s' "$raw" | tr -d '\r\n')"
```

## Option D: an agent or automation runner

Same as C, with one added rule: the fetch and the deploy must happen inside a
single tool call. An agent that resolves the token in one shell and deploys in
the next gets an empty variable, because each call is a fresh process.

If the runner cannot reach the secrets manager (a common failure for scheduled
tasks running as a service account with no user session), do not fall back to
hardcoding. Grant the runner its own scoped machine identity, or hand it a
pre-populated environment from the scheduler.

## Verifying auth without deploying

```bash
npx wrangler pages project list
```

Succeeds on a valid Pages:Edit token with the account ID set. This is the cheap
pre-flight: it separates "auth is broken" from "the deploy is broken", and it
returns the exact project names and production branch names you need anyway.

## Never do this

- `wrangler login` on a headless box. It hangs on the browser handoff and leaves
  a partial `~/.wrangler` config that makes later token deploys behave
  inconsistently. Run `npx wrangler logout` to clear one.
- `echo "$CLOUDFLARE_API_TOKEN"` to check whether it is set. Check the length or
  emptiness instead: `[ -n "$CLOUDFLARE_API_TOKEN" ] && echo "token set"`.
- Committing `wrangler.toml` with a token in it. `[vars]` is plain text and ships
  to the edge as a readable runtime binding. Secrets go in the dashboard's
  encrypted secrets section or `wrangler pages secret put`, never `[vars]`.
