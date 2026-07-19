# claude-skills

A collection of reusable [Claude Code](https://claude.com/claude-code) skills, distilled from real working sessions. Each skill is a self-contained folder with a `SKILL.md` (instructions + trigger) and any reference files it needs. They are model-agnostic in spirit but written for and tested with Claude Code.

> Skills are progressive-disclosure instruction packs: a short description that tells the model *when* to load the skill, a body that loads on trigger, and reference files that load only when needed. See Anthropic's [Agent Skills](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) docs.

## Skills in this repo

| Skill | What it does |
|---|---|
| [`figma-design-build`](skills/figma-design-build) | Build, edit, and read designs in Figma through the Figma MCP (the cloud `use_figma` plugin-API + `get_screenshot` loop), and do design-to-code. Encodes server-side font limits, load-before-edit, geometry/shear math, styles + components, organize-as-you-go layer hygiene, and a catalog of real gotchas. |
| [`fusion-360-mcp`](skills/fusion-360-mcp) | Drive Autodesk Fusion for parametric CAD, through either a typed 75-tool MCP server or Autodesk's own four-tool MCP: constrained sketches, extrudes, holes, fillets, shells, multi-body modeling, components + as-built joints, motion and print-in-place mechanisms, exports (STL/3MF/STEP), and API-doc lookups. Ships a full tool reference (`tools.md`) plus a failure catalog (`gotchas.md`) built from a live test battery against Fusion 2704.1.23 — including the silent-failure class where a tool reports success while doing the wrong thing (an unset pattern direction triples geometry, a joint drive past its limit is ignored, an occurrence move reverts). |
| [`langgraph-agent`](skills/langgraph-agent) | Build production LangGraph agents: pure-factory graphs, injected effects, human-in-the-loop `interrupt`/resume (incl. multi-gate), streaming + topology for a live view, the two-model pattern, and a catalog of graph shapes (ReAct, fan-out, routing, cross-provider reviewer, grounding fact-check). Encodes the 1.x API, the five non-negotiables, and headless testing with stub models. |
| [`langsmith-evals`](skills/langsmith-evals) | Evaluate and observe LangChain / LangGraph agents and RAG pipelines with LangSmith: offline datasets + evaluators + experiments, code-vs-LLM-judge, the two-tier CI pattern, the RAG triad, hosted/online automation rules (REST), and `langgraph dev` / Studio setup. Encodes the eval vocabulary, the `variable_mapping` singular-roots gotcha, the `dumpd` model-serialization requirement, the workspace-secret rule, and the stable server pins. |
| [`after-effects-extendscript`](skills/after-effects-extendscript) | Author After Effects motion graphics from scratch in ExtendScript (`.jsx`): comps, typing-on/edge-track/blink expressions, easy-ease keyframes, polystar sparkles, font PostScript resolution, and ffmpeg `silencedetect` audio-sync. Encodes the ES3 rules, the property-matchname cheatsheet, the `sourceRectAtTime` layout pattern, and the spatial-Position keyframe gotcha. |

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
