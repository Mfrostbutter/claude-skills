---
name: claude-code-hooks
description: >-
  Write, wire, test, and debug Claude Code hooks: shell commands the harness runs
  on tool calls and session lifecycle events. Use whenever the task is to block or
  gate a dangerous command, keep secrets out of a transcript, enforce a house rule
  mechanically instead of hoping the model remembers it, inject context at session
  start, audit or log what an agent did, flag prompt injection in retrieved
  content, or debug a hook that fires but seems to do nothing. Also use for any
  request phrased as "always do X before Y", "never let it Z", "automatically run
  this after every edit", or "make sure it can't", since those are hook problems
  and not prompt problems. Encodes the exit-code and JSON output contract per
  event, the fail-open discipline, shell-clause splitting so a guard cannot be
  laundered past, deny-with-a-rewrite, and subprocess golden tests.
---

# Claude Code hooks

Hooks are shell commands the harness runs at fixed points in the loop. They are
the only enforcement layer that does not depend on the model choosing to comply.

**That is the entire point.** A rule in `CLAUDE.md` is a request the model
usually honors and occasionally forgets, precisely when it is busy doing
something else. A rule in a hook is a wall. If a rule matters enough that a
single miss is expensive, it belongs in a hook, not in prose.

The canonical example: "never print credentials into the transcript" was written
down as a rule and still got violated by a secrets-CLI listing that piped a
name+value table through `grep`. The rule was correct and it did not fire. The
same rule as a `PreToolUse` matcher on `Bash` has not been violated since,
because it cannot be.

## The two output channels

Every hook communicates in one of two ways. Getting this wrong is the most
common reason a hook "does nothing".

**Exit codes.**

| Code | Meaning |
|---|---|
| `0` | Success. `stdout` is shown to the user in transcript mode, not to the model (except where an event specifies otherwise). |
| `2` | Blocking error. `stderr` is fed back **to the model**. This is the terse way to make Claude self-correct. |
| other | Non-blocking error. `stderr` goes to the user, the loop continues. |

**Structured JSON on stdout, exit 0.** More control, and the only way to express
`ask`. Shape:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "why, and what to do instead"
  }
}
```

`permissionDecision` is one of `allow`, `deny`, `ask`. Prefer JSON for
`PreToolUse` guards: the reason string is what the model reads, and it is the
difference between a guard that teaches and a guard that just obstructs.

> **Gotcha, verified the hard way:** for `PostToolUse`, `decision: "block"` and
> exit-2 stderr were both silently dropped for hooks registered mid-session. The
> channel that reliably reached the model was
> `hookSpecificOutput.additionalContext`. If a `PostToolUse` hook seems inert,
> switch to `additionalContext` before assuming your logic is wrong. Full
> debugging ladder in `reference/03-testing-and-debugging.md`.

## Events

| Event | Fires | Use it for |
|---|---|---|
| `PreToolUse` | Before a tool runs, can block | Guards. The only place you can stop something. |
| `PostToolUse` | After a tool succeeds | Validators, scanners, audit records |
| `SessionStart` | Session begin / resume | Injecting memory, project context, stale-doc warnings |
| `UserPromptSubmit` | Before the prompt reaches the model | Prompt-level policy, extra context |
| `PreCompact` | Before context compaction | Capturing session state that is about to be summarized away |
| `Stop` / `SubagentStop` | Turn or subagent ends | Daily logs, audit flush, completion checks |
| `Notification` | Permission prompts, idle | Desktop or phone alerts |
| `SessionEnd` | Session teardown | Final flush |

`SessionStart`, `UserPromptSubmit`, and `PostToolUse` can all inject text with
`additionalContext`. Details and payload shapes per event:
`reference/01-events-and-contract.md`.

## Matchers

`PreToolUse` and `PostToolUse` take a `matcher` regex against the tool name:

```json
{ "matcher": "Bash|PowerShell", "hooks": [ ... ] }
{ "matcher": "Write|Edit", "hooks": [ ... ] }
{ "matcher": "WebFetch|WebSearch|Read|mcp__.*", "hooks": [ ... ] }
```

`mcp__.*` catches every MCP tool, which is where untrusted content usually
arrives. Omit `matcher` entirely to fire on every event of that type.

Match the shells you actually have. A guard matching only `Bash` on a box that
also exposes `PowerShell` is a guard with a hole in it.

## The five rules

Everything below is downstream of these. Break them and you will end up deleting
your hooks in frustration within a week.

### 1. Fail open, without exception

Every guard wraps its logic in `try/except` and exits 0 on anything it cannot
parse. A hook that crashes on an unusual payload does not fail safe, it wedges
unrelated work, and then it gets removed, and then you have no guard at all.

```python
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)  # fail open
```

A guard only has to be right about the handful of shapes that actually cause
harm. It does not have to be right about everything.

### 2. Split on shell separators

A guard that regexes the whole command string is trivially laundered:

```bash
echo hi && rm -rf /important
```

If the pattern requires the dangerous token at the start, the leading `echo`
defeats it. Split first, then check every clause:

```python
_SEPARATORS = re.compile(r"\|\||&&|[;&\n]")
for clause in _SEPARATORS.split(command):
    ...
```

The same applies in reverse: a *safe* idiom in one clause must not exempt a
dangerous one in another.

### 3. Deny with a rewrite, not a refusal

A `deny` reason that only says "not allowed" produces a model that retries three
variations and then gives up. A reason that hands back the correct command
produces one that complies immediately and learns the idiom.

Compare:

> `rm -rf` is blocked.

against:

> DELETION: the house rule is archive, never delete. Move the target into a dated
> staging folder instead:
> `mkdir -p .trash-staging/2026-08-31 && mv <target> .trash-staging/2026-08-31/`
> Recursive deletes of temp/cache paths are exempt and pass through.

The second one is a guard people keep.

### 4. Three tiers, not two

Binary allow/deny is too blunt. Real policy has a middle:

- **CRITICAL** to `deny` always. Irrecoverable or attack-shaped: `rm -rf /`, fork
  bombs, `curl | sh`, `mkfs`, `dd of=/dev/...`.
- **POLICY** to `deny` with a rewrite. Recoverable, but the house has a preferred
  idiom: recursive delete outside temp, force-push, history rewrite.
- **WARNING** to `ask`. High blast radius but legitimate: `git reset --hard`,
  `DROP TABLE`, destroying a VM. The human confirms.

And carve out explicit exemptions. Deleting `node_modules`, `__pycache__`, or a
scratch directory is normal hygiene, not data loss. A deletion guard without a
temp-path exemption fires constantly and gets disabled.

### 5. Scanners warn, they never block

For anything heuristic (prompt-injection detection, style linting, secret-shaped
strings), append `additionalContext` and let the model decide. Blocking on a
fuzzy match means false positives halt real work, and the cost of a false
positive on a blocking scanner is much higher than the cost of a missed warning.

## Interpreters: pin the absolute path

The single most common wiring failure. `python` on the `PATH` is frequently not
the interpreter you tested against, especially on Windows where an msys/MinGW
Python shadows the real install and lacks your dependencies. Bare `python3` on
macOS can be the Xcode stub.

Use an absolute path in `settings.json`:

```json
"command": "\"C:\\Users\\you\\AppData\\Local\\Programs\\Python\\Python313\\python.exe\" \"C:\\Users\\you\\.claude\\scripts\\guard.py\""
```

Then lint for it, so it cannot regress. A test that walks every hook command in
`settings.json` and asserts the interpreter resolves is 40 lines and catches this
class permanently. See `reference/03-testing-and-debugging.md`.

## Windows: reconfigure stdin to UTF-8

Hook payloads are UTF-8. Python on Windows defaults stdin to cp1252, so a
payload containing an em dash, a smart quote, or an emoji raises
`UnicodeDecodeError` before your logic runs. Combined with fail-open, the guard
silently stops guarding on exactly the inputs most likely to be interesting.

```python
if hasattr(sys.stdin, "reconfigure"):
    sys.stdin.reconfigure(encoding="utf-8")
```

Put this in every hook script. Test with UTF-8 **bytes**, not `text=True`, or the
test round-trips through the same wrong codec and masks the bug.

## Hooks that need the network

Never let a hook block on a remote call. It runs on every tool use, the timeout
is short, and the network is not always there.

Use **spool then flush**: the hot-path hook appends one NDJSON line to a local
file and exits. A separate hook on `SessionStart` (or a cron job) ships the spool
and tracks a byte offset per file. If the destination is unreachable, it exits 0
**without advancing the offset**, so nothing is lost and the next run retries.

Full pattern in `reference/04-recipes.md`.

## Getting started

1. Copy `assets/hook_template.py`. It has the stdin reconfigure, fail-open
   wrapper, clause splitting, and the JSON emitter already in place.
2. Wire it in `~/.claude/settings.json` (global) or `.claude/settings.json`
   (project) with an absolute interpreter path and a `timeout`.
3. Copy `assets/test_hooks_template.py` and write the three contracts for it:
   allow, deny, malformed-stdin-exits-0.
4. Restart Claude Code, or run `/hooks` to confirm registration.
5. Verify with `claude --debug`, which prints each hook invocation and its raw
   output.

Working implementations of all six hook archetypes (destructive guard, secret
guard, injection scanner, style validator, context loader, audit spool) are in
`reference/04-recipes.md`.

## Reference

- `reference/01-events-and-contract.md`: every event, payload keys, output shapes
- `reference/02-writing-a-guard.md`: the guard anatomy in detail
- `reference/03-testing-and-debugging.md`: golden tests, settings lint, why a hook is silent
- `reference/04-recipes.md`: six production hook archetypes
- `assets/hook_template.py`: guard skeleton
- `assets/test_hooks_template.py`: three-contract test harness
