#!/usr/bin/env bash
# Headless Cloudflare Pages deploy. Auth by env var, no `wrangler login`.
#
#   ./deploy.sh <project-name> <deploy-dir> [prod-branch]
#
# Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment.
# Set FUNCTIONS_DIR to copy Pages Functions into the deploy dir first.

set -euo pipefail

PROJECT="${1:?usage: deploy.sh <project-name> <deploy-dir> [prod-branch]}"
DEPLOY_DIR="${2:?usage: deploy.sh <project-name> <deploy-dir> [prod-branch]}"
BRANCH="${3:-main}"
FUNCTIONS_DIR="${FUNCTIONS_DIR:-}"

# Both vars are mandatory. A Pages-scoped token cannot discover its own account.
: "${CLOUDFLARE_API_TOKEN:?CLOUDFLARE_API_TOKEN is not set}"
: "${CLOUDFLARE_ACCOUNT_ID:?CLOUDFLARE_ACCOUNT_ID is not set (scoped tokens cannot auto-discover it)}"

[ -d "$DEPLOY_DIR" ] || { echo "deploy dir not found: $DEPLOY_DIR" >&2; exit 1; }

# Strip stray CR/LF from a token captured through a secrets CLI or a container.
CLOUDFLARE_API_TOKEN="$(printf '%s' "$CLOUDFLARE_API_TOKEN" | tr -d '\r\n')"
export CLOUDFLARE_API_TOKEN

# Pre-flight: separates "auth is broken" from "the deploy is broken".
echo "==> verifying auth"
npx wrangler pages project list >/dev/null

# Functions only ship if they live inside the uploaded directory.
if [ -n "$FUNCTIONS_DIR" ]; then
  echo "==> staging functions from $FUNCTIONS_DIR"
  rm -rf "${DEPLOY_DIR%/}/functions"
  cp -r "$FUNCTIONS_DIR" "${DEPLOY_DIR%/}/functions"
fi

# --branch is what routes to production. Without it this is a preview deploy.
echo "==> deploying $DEPLOY_DIR to $PROJECT (branch=$BRANCH)"
npx wrangler pages deploy "$DEPLOY_DIR" \
  --project-name "$PROJECT" \
  --branch="$BRANCH"

echo "==> done. Verify the CUSTOM DOMAIN, not the pages.dev URL:"
echo "    curl -sIL \"https://<your-domain>/?_=\$(date +%s)\""
