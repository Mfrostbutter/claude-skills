# Setup + auth

## Tools are deferred

Figma MCP tools usually arrive deferred. Load schemas before calling:

```
ToolSearch: select:mcp__claude_ai_Figma__whoami,mcp__claude_ai_Figma__use_figma,mcp__claude_ai_Figma__get_screenshot,mcp__claude_ai_Figma__create_new_file,mcp__claude_ai_Figma__get_design_context,mcp__claude_ai_Figma__get_metadata
```

## whoami → account + planKey

Call `whoami` first. It returns the handle, email, and `plans[]`. You need `plans[].key` (e.g. `team::1639320580503257932`) to create files.

**Account matters.** If the user has multiple Figma accounts (e.g. a personal/brand account and an old employer account), edits can fail or land in the wrong place on the wrong account. Confirm the email is the intended one. The desktop app the user is watching must be signed into the **same** account, or they will not see your changes (and a different account may be view-only and reject edits).

## Creating a file

`create_new_file` needs `fileName`, `planKey`, `editorType` (`design` / `figjam` / `slides`). Returns `file_key` and `file_url`. Capture the `file_key`; every later call needs it as `fileKey`.

The server may say to load a `/figma-create-new-file` skill first; do so if it exists.

## Extracting fileKey + nodeId from URLs

- `figma.com/design/:fileKey/:name?node-id=1-2` → `fileKey` = `:fileKey`, `nodeId` = `1:2` (convert the `-` to `:`).
- Branch URLs `…/design/:fileKey/branch/:branchKey/…` → use `:branchKey` as the fileKey.
- `nodeId` must be the real id form `123:456` or `123-456`. Placeholders like `"F"` or a guessed id are rejected. Get real ids by having `use_figma` **return** `node.id`.

## The user is watching in desktop

When the user wants to watch live: they open the file in Figma desktop, on the same account. Your `use_figma` edits stream into their open file via Figma's realtime sync. If they "see nothing": (1) wrong page selected (your work is often on a non-default page; tell them the page name), (2) stale file open before you created the page (Ctrl+R / reopen to reload), (3) wrong account.
