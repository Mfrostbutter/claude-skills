#!/usr/bin/env bash
# Drive the AE build + render from the shell. Run from the working dir (captures/ vo/ ae/ out/).
# IN: ae/manifest.json (from assemble.py), ae/build_comp.jsx, After Effects open with the scripting pref on.
# OUT: ae/walkthrough.aep, out/<name per jsx CONFIG>.mp4. ON FAILURE: prints ae/build-log.txt and exits non-zero.
set -euo pipefail
AE="/c/Program Files/Adobe/Adobe After Effects 2026/Support Files"
HERE_W="$(cygpath -w "$PWD")"
cp ae/build_comp.jsx ae/_check.js && node --check ae/_check.js && rm -f ae/_check.js
rm -f ae/build-log.txt
"$AE/AfterFX.exe" -r "$HERE_W\ae\build_comp.jsx"
n=0; until [ -s ae/build-log.txt ] || [ $n -ge 150 ]; do sleep 2; n=$((n+1)); done; sleep 1
cat ae/build-log.txt; echo
grep -q "^ERROR" ae/build-log.txt && { echo "AE build failed"; exit 3; }
[ -f ae/walkthrough.aep ] || { echo "no .aep saved"; exit 4; }
"$AE/aerender.exe" -project "$HERE_W\ae\walkthrough.aep" -sound ON > ae/render-log.txt 2>&1
grep -E "Finished|rror|Total Time|Output To" ae/render-log.txt || true
ls -la out/
