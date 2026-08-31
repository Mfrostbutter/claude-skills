# Writing a guard

A guard is a `PreToolUse` hook that inspects a command and returns
allow / ask / deny. This is the anatomy, in the order the code runs.

## 1. Reconfigure stdin, then read

```python
import json, re, sys

if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")

try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # fail open
```

The `hasattr` check keeps this working on older interpreters. Without the
reconfigure, any payload containing non-ASCII raises `UnicodeDecodeError` on
Windows and your fail-open branch silently disables the guard.

## 2. Cheap bail-out first

```python
command = (payload.get("tool_input") or {}).get("command") or ""
if not command:
    sys.exit(0)
if "docker" not in command:      # guard-specific fast path
    sys.exit(0)
```

This hook runs on every matching tool call. Get out early. A substring check
before the regex work is worth it when your guard only cares about one binary.

## 3. Split into clauses

```python
_SEPARATORS = re.compile(r"\|\||&&|[;&\n]")
```

Then evaluate every clause independently. Two failure modes this prevents:

**Laundering a dangerous clause behind a safe one.**

```bash
echo "just looking" && rm -rf /important
```

**Exempting a dangerous clause because of a safe one.** If your secret guard
allows `VAR=$(secrets get X --plain)` because the value is captured, it must not
then allow:

```bash
VAR=$(secrets get X --plain); secrets get Y
```

Check the *clause* for the dangerous shape, and check the *clause* for the
exemption. Mixing scopes is how guards get bypassed by accident.

Note the separator set excludes a single `|`. Whether to split on pipes depends
on the guard. A secret guard must **not** treat a pipe as a boundary that makes
things safe, because `secrets list | grep foo` still has every value in the pipe.
A destructive guard generally should split on it. Decide deliberately.

## 4. Tier the patterns

```python
_CRITICAL = [
    (re.compile(r"\brm\s+(-\w*[rf]\w*\s+)*(/|~|\$HOME)(\s|$)"),
     "rm targeting a filesystem root or home directory"),
    (re.compile(r":\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:"),
     "fork bomb"),
    (re.compile(r"\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(ba)?sh\b"),
     "piping a remote download straight into a shell"),
    (re.compile(r"\bmkfs(\.\w+)?\b"), "filesystem format"),
    (re.compile(r"\bdd\b[^|;&\n]*\bof=/dev/"), "dd writing directly to a device"),
]

_WARNING = [
    (re.compile(r"\bgit\s+push\b[^|;&\n]*(--force(?!-with-lease)|\s-f\b)"),
     "git push --force (use --force-with-lease, or confirm)"),
    (re.compile(r"\bgit\s+reset\s+--hard\b"),
     "git reset --hard discards uncommitted changes"),
    (re.compile(r"\bDROP\s+(DATABASE|TABLE|SCHEMA)\b", re.IGNORECASE), "SQL DROP"),
]
```

Two details that matter:

`[^|;&\n]*` inside a pattern keeps a match from spanning a clause boundary. Use
it in patterns that need to see two tokens near each other, so `curl x; sh` does
not read as `curl | sh`.

`(--force(?!-with-lease))`: the negative lookahead is what makes the guard
teach the safe idiom rather than banning the whole operation.

## 5. Exempt the normal cases

A deletion guard without exemptions fires on `rm -rf node_modules` and is dead
within a day.

```python
_TEMP_OK = re.compile(
    r"(/tmp/|\\Temp\\|/Temp/|AppData.Local.Temp|scratchpad|\.tmp[\\/]|__pycache__|"
    r"node_modules|\.pytest_cache|\.venv|dist[\\/]|build[\\/]|"
    r"\.cache[\\/]|\$env:TEMP|%TEMP%)",
    re.IGNORECASE)
```

Write the exemption list from the commands you actually run, not from theory.
Every time the guard fires on something legitimate, either add an exemption or
accept that the guard is wrong. Do not just tolerate the noise.

## 6. Return a reason that is an instruction

```python
today = datetime.date.today().isoformat()
return ("deny",
        "DELETION: the house rule is archive, never delete. Move the target into "
        f"a dated staging folder instead, e.g.:\n"
        f"  mkdir -p .trash-staging/{today} && mv <target> .trash-staging/{today}/\n"
        "(or Move-Item to an Archive/ path). Recursive deletes of temp/cache "
        "paths are exempt and pass through.")
```

Three things this does:

1. Names the rule, so the model can generalize rather than pattern-matching on
   the single blocked command.
2. Gives the exact replacement, with the date already interpolated. The model can
   run it without thinking.
3. States the exemption, so it does not conclude that all deletion is forbidden
   and start asking permission for `rm -rf node_modules`.

For a guard that blocks a leak, say what leaked and why the obvious workaround
does not work:

> Bare `secrets list` prints a NAME + VALUE table. Piping it through grep does
> NOT help: the values are already in the output being filtered.

Without that second sentence, the next attempt is `secrets list | grep -v`.

## 7. Emit and exit 0

```python
print(json.dumps({
    "hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": decision,
        "permissionDecisionReason": reason,
    }
}))
sys.exit(0)
```

Exit **0**, not 2. The JSON carries the decision; a non-zero exit alongside it
muddies which channel the harness honors.

## 8. Wrap the logic in fail-open too

The stdin parse is not the only thing that can throw. A malformed regex against
pathological input, a `None` where a string was expected, an OS error reading a
config file:

```python
try:
    result = _check(command)
except Exception:
    sys.exit(0)
```

Assert this in a test. Fail-open must be a decision you verified, not an
accident you are relying on.

## Anti-patterns

**Guarding on the model's intent.** You are matching command strings, not
reading minds. Keep patterns concrete.

**One giant regex.** Unmaintainable and impossible to test per-rule. A list of
`(pattern, reason)` tuples is testable one row at a time.

**Blocking on a heuristic.** If the pattern is fuzzy (injection detection,
secret-shaped strings, prose style), warn with `additionalContext` instead. The
cost of a false positive on a blocking hook is far higher than a missed warning.

**Guarding one shell when two are exposed.** Match `Bash|PowerShell` if the
harness offers both.

**Silent guards.** If a guard denies something, the reason must say so plainly.
A guard that blocks without explaining looks like a bug in the tool.

**Forgetting `mcp__.*`.** MCP tools are how untrusted external content usually
arrives. A scanner matching only `WebFetch` misses most of the surface.
