# Skill Anatomy

## Structure

```
skill-name/
  SKILL.md            required: frontmatter + body
  references/         loaded as needed: conventions, gotchas, per-variant docs
  scripts/            deterministic repeatable steps
  assets/             templates the workflow outputs
```

## Progressive disclosure (three levels)

1. name + description: always in context (~100 words). The description is the trigger. Be pushy, list concrete contexts, put all "when to use" info here.
2. SKILL.md body: loads on trigger. Under ~500 lines. Imperative voice. Explain why a rule matters.
3. Bundled resources: loaded only when needed. Reference files over ~300 lines get a table of contents.

## Domain organization

When a workflow has variants (Figma vs n8n vs Fusion), keep SKILL.md as workflow plus selection logic and push specifics into references/<variant>.md so only the relevant file loads.

## Writing patterns

- Imperative form for instructions.
- Define fixed output formats with an explicit template block.
- Include 1 to 2 short input/output examples where format matters.
- Theory of mind over heavy-handed MUSTs.
