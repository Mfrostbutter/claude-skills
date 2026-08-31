#!/usr/bin/env python3
"""PreToolUse guard template: tiered allow / ask / deny wall in front of the shell.

Wire it in settings.json with an ABSOLUTE interpreter path:

  "PreToolUse": [
    {
      "matcher": "Bash|PowerShell",
      "hooks": [
        {
          "type": "command",
          "command": "\"/abs/path/to/python\" \"/abs/path/to/hook_template.py\"",
          "timeout": 5
        }
      ]
    }
  ]

Contract: reads one JSON payload on stdin, exits 0 always. A decision is a JSON
object on stdout; silence means allow. Fails OPEN on anything unparseable, so a
bug here can never wedge unrelated shell work.
"""

import datetime
import json
import re
import sys

# Hook payloads are UTF-8. Windows defaults stdin to cp1252, which raises on any
# non-ASCII command and (with fail-open) silently disables the guard.
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")

# Split so a safe clause cannot launder a dangerous one hiding after ; or &&.
# Decide deliberately whether a bare | belongs here: for a leak guard it does not,
# because `list | grep` still has every value in the pipe.
_SEPARATORS = re.compile(r"\|\||&&|[;&\n]")


# ---- CRITICAL: irrecoverable or attack-shaped. Always deny. ----
_CRITICAL = [
    (re.compile(r"\brm\s+(-\w*[rf]\w*\s+)*(/|~|\$HOME)(\s|$)"),
     "rm targeting a filesystem root or home directory"),
    (re.compile(r"Remove-Item\b[^|;&\n]*-Recurse[^|;&\n]*\s['\"]?([A-Za-z]:[\\/]?|\$env:USERPROFILE)['\"]?\s*($|-)",
                re.IGNORECASE),
     "recursive Remove-Item of a drive root or user profile"),
    (re.compile(r":\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:"),
     "fork bomb"),
    (re.compile(r"\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(ba)?sh\b"),
     "piping a remote download straight into a shell"),
    (re.compile(r"\b(iwr|irm|Invoke-WebRequest|Invoke-RestMethod)\b[^|;&\n]*\|\s*(iex|Invoke-Expression)\b",
                re.IGNORECASE),
     "piping a remote download straight into Invoke-Expression"),
    (re.compile(r"\bmkfs(\.\w+)?\b"), "filesystem format"),
    (re.compile(r"\bdd\b[^|;&\n]*\bof=/dev/"), "dd writing directly to a device"),
    (re.compile(r">\s*/dev/(sd|nvme|hd)\w*"), "redirect writing directly to a block device"),
    (re.compile(r"\bchmod\b\s+(-\w+\s+)*0?777\b"), "chmod 777 (world-writable)"),
]

# ---- WARNING: legitimate but high blast radius. Ask the human. ----
_WARNING = [
    (re.compile(r"\bgit\s+push\b[^|;&\n]*(--force(?!-with-lease)|\s-f\b)"),
     "git push --force (use --force-with-lease, or confirm)"),
    (re.compile(r"\bgit\s+reset\s+--hard\b"), "git reset --hard discards uncommitted changes"),
    (re.compile(r"\bgit\s+clean\b[^|;&\n]*-\w*[dx]"), "git clean deletes untracked files irrecoverably"),
    (re.compile(r"\bgit\s+(filter-repo|filter-branch)\b"), "history rewrite"),
    (re.compile(r"\bDROP\s+(DATABASE|TABLE|SCHEMA)\b", re.IGNORECASE), "SQL DROP"),
    (re.compile(r"\bTRUNCATE\s+TABLE\b", re.IGNORECASE), "SQL TRUNCATE"),
]

# ---- DELETION: recursive delete outside temp -> deny with an archive rewrite. ----
_DELETE_SHAPES = [
    re.compile(r"\brm\b[^|;&\n]*\s-\w*r"),
    re.compile(r"\brmdir\b\s+/s", re.IGNORECASE),
    re.compile(r"\bdel\b\s+/s", re.IGNORECASE),
    re.compile(r"Remove-Item\b[^|;&\n]*-Recurse", re.IGNORECASE),
]

# Paths where deletion is normal hygiene. Grow this from real usage: a deletion
# guard that fires on `rm -rf node_modules` gets disabled within a day.
_TEMP_OK = re.compile(
    r"(/tmp/|\\Temp\\|/Temp/|AppData.Local.Temp|scratchpad|\.tmp[\\/]|__pycache__|"
    r"node_modules|\.pytest_cache|\.venv|dist[\\/]|build[\\/]|\.cache[\\/]|"
    r"\.trash-staging|\$env:TEMP|%TEMP%)",
    re.IGNORECASE)


def _check(command: str):
    """Return (decision, reason) or None to allow."""
    for pat, why in _CRITICAL:
        if pat.search(command):
            return ("deny", f"CRITICAL: {why}. This command is never allowed through the harness.")

    for clause in _SEPARATORS.split(command):
        clause = clause.strip()
        if not clause:
            continue
        for shape in _DELETE_SHAPES:
            if shape.search(clause) and not _TEMP_OK.search(clause):
                today = datetime.date.today().isoformat()
                # Deny WITH the replacement command, not just a refusal.
                return ("deny",
                        "DELETION: the house rule is archive, never delete. Move the target "
                        "into a dated staging folder instead, e.g.:\n"
                        f"  mkdir -p .trash-staging/{today} && mv <target> .trash-staging/{today}/\n"
                        "Recursive deletes of temp/cache paths are exempt and pass through.")

    for pat, why in _WARNING:
        if pat.search(command):
            return ("ask", f"WARNING: {why}. Confirm before running.")

    return None


def main() -> None:
    try:
        payload = json.load(sys.stdin)
        # Valid JSON is not necessarily a dict. `[]` parses, then .get() throws.
        if not isinstance(payload, dict):
            sys.exit(0)
        command = (payload.get("tool_input") or {}).get("command") or ""
    except Exception:
        sys.exit(0)  # fail open

    if not command:
        sys.exit(0)

    try:
        result = _check(command)
    except Exception:
        sys.exit(0)  # fail open on any logic error too

    if result is None:
        sys.exit(0)  # silence means allow

    decision, reason = result
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,          # allow | ask | deny
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)  # exit 0 even when denying; the JSON carries the decision


if __name__ == "__main__":
    main()
