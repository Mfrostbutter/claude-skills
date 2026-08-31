# Events, payloads, and the output contract

## Configuration shape

Hooks live in `settings.json`, at `~/.claude/settings.json` (all projects),
`.claude/settings.json` (project, committed), or `.claude/settings.local.json`
(project, gitignored).

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell",
        "hooks": [
          {
            "type": "command",
            "command": "\"/abs/path/python\" \"/abs/path/guard.py\"",
            "timeout": 5,
            "statusMessage": "Checking command..."
          }
        ]
      }
    ]
  }
}
```

Note the doubled nesting: an array of **matcher groups**, each containing an
array of **hooks**. Multiple groups on the same event all fire; use separate
groups when they need different matchers, and separate entries within one group
when they share a matcher.

- `matcher`: regex against the tool name. Omit to match everything. Only
  meaningful for `PreToolUse` / `PostToolUse`.
- `timeout`: seconds. Keep guards at 5. Anything doing real work gets 10 to 15.
  A hook that exceeds its timeout is killed and treated as a non-blocking error.
- `statusMessage`: shown in the UI while it runs. Worth setting for anything
  slower than instant, so the pause is explained.

## Input: JSON on stdin

Every hook receives one JSON object. Common keys:

| Key | Present | Notes |
|---|---|---|
| `session_id` | always | Stable per session, good dedup/correlation key |
| `transcript_path` | always | Path to the session JSONL |
| `cwd` | always | Working directory, useful for project/entity routing |
| `hook_event_name` | always | Echo it back in `hookSpecificOutput` |
| `tool_name` | tool events | e.g. `Bash`, `Edit`, `mcp__server__tool` |
| `tool_input` | tool events | The tool's arguments |
| `tool_response` | `PostToolUse` | The tool's result; string or object |
| `prompt` | `UserPromptSubmit` | The raw user prompt |
| `source` | `SessionStart` | `startup`, `resume`, `clear`, `compact` |

`tool_input` shape varies by tool. The ones you will read most:

```python
(payload.get("tool_input") or {}).get("command")      # Bash / PowerShell
(payload.get("tool_input") or {}).get("file_path")    # Write / Edit / Read
(payload.get("tool_input") or {}).get("content")      # Write
(payload.get("tool_input") or {}).get("new_string")   # Edit
```

Always use `(payload.get("tool_input") or {})`. The key can be present and
`null`, and `.get` on `None` is the crash that silently disables your guard.

## Output: exit codes

| Code | `stdout` | `stderr` | Effect |
|---|---|---|---|
| 0 | shown in transcript mode | ignored | Continue |
| 2 | ignored | **fed to the model** | Blocking error |
| other | ignored | shown to user | Continue |

Exit 2 is the quickest way to make Claude self-correct: write the correction to
`stderr` and exit 2. It works reliably on `PreToolUse` and `UserPromptSubmit`.
It is unreliable on `PostToolUse` (see below).

## Output: structured JSON

Exit 0 and print JSON to stdout. This is the richer channel and the only way to
express `ask`.

### PreToolUse

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "why, plus the correct command to run instead"
  }
}
```

`permissionDecision`:

- `allow`: bypass the normal permission prompt. Use sparingly; this is how you
  auto-approve a known-safe shape, and it is also how you accidentally
  auto-approve something you did not mean to.
- `deny`: block. The reason goes to the model.
- `ask`: force a human confirmation even if permissions would have allowed it.

The reason string is the entire user interface of your guard. Write it as
instructions, not as a complaint.

### PostToolUse

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "text injected into the model's context"
  }
}
```

> **Use `additionalContext`.** `decision: "block"` and exit-2 stderr have both
> been observed to be silently dropped for `PostToolUse` hooks registered
> mid-session. `additionalContext` reached the model reliably in the same
> conditions. If your `PostToolUse` hook runs (confirmed under `--debug`) but the
> model never reacts, this is why. Switch channels before rewriting logic.

### SessionStart / UserPromptSubmit

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "memory, project state, stale-doc warnings"
  }
}
```

For `SessionStart`, plain `stdout` on exit 0 is also injected as context, which
is why a one-line `echo` hook works. Prefer explicit JSON once the content is
non-trivial, so the intent is legible in `settings.json`.

`UserPromptSubmit` can additionally block the prompt outright with exit 2, with
`stderr` shown to the user rather than the model.

### Common to all events

```json
{
  "continue": false,
  "stopReason": "shown to the user when continue is false",
  "suppressOutput": true
}
```

`continue: false` halts the whole turn. It outranks any `permissionDecision`.
Reserve it for genuine circuit-breakers.

`suppressOutput: true` keeps `stdout` out of transcript mode. Useful for hooks
that log, so their bookkeeping does not clutter the session.

## Per-event notes

**`PreToolUse`.** The only event that can prevent an action. If a rule must
hold, it holds here or nowhere.

**`PostToolUse`.** The tool already ran. You can validate, record, or warn, but
you cannot undo. For `Write`/`Edit`, check only the text just written
(`content` / `new_string`), never the whole file: validating whole files means
every legacy violation fires on every unrelated edit, which is noise, and noise
gets muted.

**`SessionStart`.** `source` distinguishes `startup` from `resume`, `clear`, and
`compact`. Cheap work only; this runs before the user can type, and a slow hook
here is felt on every single session.

**`PreCompact`.** The last chance to capture state about to be summarized away.
Pair it with `Stop` on the same script when you want a durable session log
regardless of how the session ends.

**`Stop` / `SubagentStop`.** Good for flushes and completion checks. `Stop` can
block with exit 2 to force the model to continue working, which is powerful and
easy to turn into an infinite loop. The payload carries a flag indicating a stop
hook is already active; respect it.

**`Notification`.** Fires on permission prompts and idle. This is the desktop
or push notification hook.

## Environment

Hooks run with the user's environment and the project directory available as
`$CLAUDE_PROJECT_DIR`. Use it to reference scripts by a stable path:

```json
"command": "\"$CLAUDE_PROJECT_DIR/.claude/scripts/guard.py\""
```

Hooks are read from settings at session start. Editing `settings.json`
mid-session does not reliably re-register them, and mid-session registration is
where the `PostToolUse` channel weirdness shows up. After changing hooks,
restart the session before concluding anything about behavior.
