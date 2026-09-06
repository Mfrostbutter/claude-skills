# claude-skills

A collection of reusable [Claude Code](https://claude.com/claude-code) skills, distilled from real working sessions. Each skill is a self-contained folder with a `SKILL.md` (instructions + trigger) and any reference files it needs. They are model-agnostic in spirit but written for and tested with Claude Code.

> Skills are progressive-disclosure instruction packs: a short description that tells the model *when* to load the skill, a body that loads on trigger, and reference files that load only when needed. See Anthropic's [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) docs.

## Skills in this repo

| Skill | What it does |
|---|---|
| [`figma-design-build`](skills/figma-design-build) | Build, edit, and read designs in Figma through the Figma MCP (the cloud `use_figma` plugin-API + `get_screenshot` loop), and do design-to-code. Encodes server-side font limits, load-before-edit, geometry/shear math, styles + components, organize-as-you-go layer hygiene, and a catalog of real gotchas. |
| [`fusion-360-mcp`](skills/fusion-360-mcp) | **Moved** to [fusion-cad-mcp](https://github.com/Mfrostbutter/fusion-cad-mcp), where it ships with the MCP server it drives, under the name `fusion-cad`. |
| [`langgraph-agent`](skills/langgraph-agent) | Build production LangGraph agents: pure-factory graphs, injected effects, human-in-the-loop `interrupt`/resume (incl. multi-gate), streaming + topology for a live view, the two-model pattern, and a catalog of graph shapes (ReAct, fan-out, routing, cross-provider reviewer, grounding fact-check). Encodes the 1.x API, the five non-negotiables, and headless testing with stub models. |
| [`langsmith-evals`](skills/langsmith-evals) | Evaluate and observe LangChain / LangGraph agents and RAG pipelines with LangSmith: offline datasets + evaluators + experiments, code-vs-LLM-judge, the two-tier CI pattern, the RAG triad, hosted/online automation rules (REST), and `langgraph dev` / Studio setup. Encodes the eval vocabulary, the `variable_mapping` singular-roots gotcha, the `dumpd` model-serialization requirement, the workspace-secret rule, and the stable server pins. |
| [`after-effects-extendscript`](skills/after-effects-extendscript) | Author After Effects motion graphics from scratch in ExtendScript (`.jsx`): comps, typing-on/edge-track/blink expressions, easy-ease keyframes, polystar sparkles, font PostScript resolution, and ffmpeg `silencedetect` audio-sync. Encodes the ES3 rules, the property-matchname cheatsheet, the `sourceRectAtTime` layout pattern, and the spatial-Position keyframe gotcha. |
| [`claude-code-hooks`](skills/claude-code-hooks) | Write, wire, test, and debug Claude Code hooks, the only enforcement layer that does not depend on the model choosing to comply. Covers the exit-code vs JSON output contract per event (including the `PostToolUse` channel where `decision: block` and exit-2 stderr get silently dropped and `additionalContext` does not), fail-open discipline, splitting on shell separators so a guard cannot be laundered past with `echo hi && rm -rf /`, deny-with-a-rewrite, and the three-tier deny/ask/exempt model. Ships six production archetypes (destructive guard, secret-leak guard, injection scanner, style validator, context loader, audit spool-and-flush), a guard template, and a subprocess golden-test harness plus a `settings.json` wiring lint. |
| [`cloudflare-pages-deploy`](skills/cloudflare-pages-deploy) | Deploy to Cloudflare Pages from a headless shell (CI, container, agent) with token auth instead of `wrangler login`. Encodes the four ways a deploy silently succeeds while doing nothing useful: a missing `--branch` shipping a preview instead of production, `wrangler.toml [vars]` wiping dashboard plain-text variables while secrets survive, `pages deploy dist` dropping Pages Functions so every API route 404s, and edge-cached 404s that outlive the file landing. Plus the mandatory `CLOUDFLARE_ACCOUNT_ID` that scoped tokens cannot auto-discover. Ships bash + PowerShell deploy scripts. |
| [`kie-image-edit`](skills/kie-image-edit) | Edit an existing image through the Kie.ai jobs API instead of regenerating it: swap headline text, remove an element, grade a photograph, restyle a graphic, while the rest of the artwork survives. Encodes the workaround for Kie's dead uploader, which model ids actually accept an edit (the market-page slug is not reliably the API id), the size parameter that is named differently per model, and the finding that **there is no resolution control** at all: output is a fixed per-model pixel budget, so aspect ratio only decides the shape of it. Plus the prompt structures that stop a redraw (enumerate the keeps, spell text letter by letter, lock identity on a portrait), how fidelity degrades as a grade moves further from the captured conditions, an EXIF-rotation trap that silently edits the image sideways, and how to read a model's enum out of the validator for free. Ships four fan-out scripts with a JSON look-pack format. |

> Looking for the skill-authoring meta-skills (`workflow-capture` + `skill-forge`)? They are the toolchain that *builds* skills like these, so they live in their own repo: **[skill-forge](https://github.com/Mfrostbutter/skill-forge)**.

## Install

Skills load from `~/.claude/skills/` (available in every project) or `.claude/skills/` (one project). Put a skill folder in either location.

**Clone and symlink the ones you want (recommended — stays in sync with `git pull`):**

macOS / Linux:
```bash
git clone https://github.com/Mfrostbutter/claude-skills.git
cd claude-skills
ln -s "$PWD/skills/figma-design-build" ~/.claude/skills/figma-design-build
```

Windows (PowerShell, as admin or with Developer Mode on):
```powershell
git clone https://github.com/Mfrostbutter/claude-skills.git
cd claude-skills
New-Item -ItemType SymbolicLink -Path "$env:USERPROFILE\.claude\skills\figma-design-build" -Target "$PWD\skills\figma-design-build"
```

**Or just copy a folder** into `~/.claude/skills/` if you don't want the symlink.

Then start (or restart) Claude Code — the skill is discovered automatically and invoked when your request matches its description.

## How these are built

Most of these were grown the same way: run a complex session with **`workflow-capture`** journaling the decisions, corrections, and dead ends, then run **`skill-forge`** to distill that journal into a `SKILL.md`. The result is a skill that encodes hard-won, battle-tested knowledge rather than guesses. Those two meta-skills are the authoring toolchain and live in their own repo: **[skill-forge](https://github.com/Mfrostbutter/skill-forge)**.

## Contributing

Issues and PRs welcome. A good skill: a pushy description that lists concrete triggers, an imperative body under ~500 lines that explains *why* rules matter, and long/variant-specific detail pushed into `references/`. Keep skills generic — no machine paths, secrets, or business-specific identifiers.

## License

[MIT](LICENSE) © Michael Frostbutter
