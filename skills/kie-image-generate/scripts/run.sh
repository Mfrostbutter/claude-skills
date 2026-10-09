#!/usr/bin/env bash
# Run a Kie.ai generation script with the key in the environment and never printed.
# Usage: PACK=scripts/packs/frosty-snowman.json OUTDIR=out bash scripts/run.sh scripts/generate.py
#
#   KIE_API_KEY   from https://kie.ai/api-key. If unset, read from ~/.config/kie/api-key (mode 600),
#                 which the key's owner writes once from their own terminal:
#                   mkdir -p ~/.config/kie && umask 077 && printf '%s' '<key>' > ~/.config/kie/api-key
set -euo pipefail
if [ -z "${KIE_API_KEY:-}" ] && [ -s "$HOME/.config/kie/api-key" ]; then
  KIE_API_KEY="$(tr -d '[:space:]' < "$HOME/.config/kie/api-key")"
  export KIE_API_KEY
fi
: "${KIE_API_KEY:?set KIE_API_KEY or write ~/.config/kie/api-key}"
python3 "$@"
