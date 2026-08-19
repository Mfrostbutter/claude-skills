# fusion-360-mcp (moved)

This skill now lives in **[fusion-cad-mcp](https://github.com/Mfrostbutter/fusion-cad-mcp)**,
alongside the MCP server it drives, under its own name `fusion-cad`.

It was published here as a standalone copy of the tool reference, pattern
library and failure catalog. Those same files ship inside the server package,
so keeping a second copy here only let the two drift apart.

## Install

```bash
git clone https://github.com/Mfrostbutter/fusion-cad-mcp
cd fusion-cad-mcp
pip install -e .
python install_skill.py
```

That writes `~/.claude/skills/fusion-cad/`.
