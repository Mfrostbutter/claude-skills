#!/usr/bin/env bash
# Run a Kie.ai edit script with the required secrets in the environment.
# Usage: bash run.sh gen_banner_text.py
#
# These scripts read secrets from env and never print them. How they get there is
# your call: a .env file, a CI secret, `op run --`, `vault exec`, `infisical run --`,
# or an export in your shell profile. Replace the block below with your own loader.
#
#   KIE_AI_API_KEY          required, from https://kie.ai
#   IMAGE_HOST_UPLOAD_URL   required unless you pass SRC_URL for an already-hosted source
#   IMAGE_HOST_TOKEN        bearer token for that upload endpoint, if it needs one
#   IMAGE_HOST_DIR          optional subdirectory on the host (default "generated")
#
# One gotcha worth keeping if you wire this to a secret manager: a CLI that has no
# env-var auth path will silently drop into an interactive login inside a
# non-interactive shell and hang. Log in explicitly and pass the resulting token to
# each read instead of relying on an ambient session.
set -euo pipefail

: "${KIE_AI_API_KEY:?set KIE_AI_API_KEY (or load it from your secret store here)}"

python "$@"
