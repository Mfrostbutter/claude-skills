---
name: kie-image-generate
description: >-
  Generate a new image from a text prompt through the Kie.ai jobs API with Seedream 5.0 Pro
  (text-to-image, or image-to-image when a reference such as a logo must appear). Use whenever
  the task is "make an image of", "generate a picture", "I need artwork for a Slack post, a deck,
  a banner, a hero, a mascot, an illustration", "draw a character wearing our hoodie", or any
  generation on Kie.ai. Also use it when a Kie generation came back with mangled text on a garment,
  the wrong logo, the wrong aspect ratio, or a soft result. Covers the Seedream 5 Pro contract
  (model id, required aspect ratio and quality, the prompt length floor), the one-key auth and
  where the key lives, submit-then-poll with the 200-with-an-error trap, prompt structure for a
  character with a branded garment and legible text, variant fan-out from a JSON pack, and the
  proofreading pass before anything ships. For editing an existing image use kie-image-edit.
---

# Kie.ai image generation (Seedream 5.0 Pro)

Text-to-image through `POST https://api.kie.ai/api/v1/jobs/createTask`, polled on
`GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=`. Same machinery as `kie-image-edit`,
different problem: here most of the work is the prompt, because nothing anchors the model except
the words.

## The contract (docs read 2026-10-09)

| field | value |
|---|---|
| `model` | `seedream/5-pro-text-to-image` (or `seedream/5-pro-image-to-image` with `image_urls`) |
| `input.prompt` | 4 to 5000 characters, required |
| `input.aspect_ratio` | one of `1:1, 4:3, 3:4, 16:9, 9:16, 2:3, 3:2, 21:9`, required, no `auto` |
| `input.quality` | `basic` (1K) or `high` (2K), required |
| `input.output_format` | `png` (default) or `jpeg` |
| `input.nsfw_checker` | boolean, default false |
| `callBackUrl` | optional webhook; the scripts poll instead |

Response: `{"code": 200, "msg": "success", "data": {"taskId": "..."}}`. Poll `data.state`
through `waiting`, `generating`, `success`, `fail`. On success `data.resultJson` is a **JSON
string**; parse it and take `resultUrls[0]`. On fail read `data.failCode` and `data.failMsg`.
Results stay on Kie for 14 days; download at once anyway. Seedream returns about 4 MP at `high`
regardless of ratio (see `kie-image-edit/references/models.md`); there is no resolution control.

**A 200 can carry an error.** Assert `code == 200` in the body and that `taskId` or the URL is
present. A rejected parameter or a billing failure looks like success to a status-code check.

**Auth is one header**, `Authorization: Bearer <key>`. A header named `apikey` is a 401. The key is
`KIE_API_KEY` in the environment (`KIE_AI_API_KEY` also read). In the FDE practice it is
`KIE_AI_API_KEY` in Infisical n8n-FDE prod (added 2026-10-09), so the run is
`infisical run --env prod --projectId <n8n-FDE id> -- bash scripts/run.sh scripts/generate.py`;
elsewhere `scripts/run.sh` falls back to `~/.config/kie/api-key` (mode 600). Never print it,
never paste it in chat.

Kie also publishes its own agent skills (`npx skills add https://kie.ai`: `kie-models` reads the
live model list and parameters). This skill exists because the practice already has the edit
skill, the secret handling and the proofreading rules; install Kie's when a model outside
Seedream is wanted and its parameters are unknown.

## Steps

1. **Write the pack.** A JSON file: `model`, `aspect_ratio`, `quality`, optional
   `reference_urls`, and `variants` (slug to prompt). Start from `scripts/packs/frosty-snowman.json`.
   One pack per job; the pack is the record of what was asked.
2. **Run** `bash scripts/run.sh scripts/generate.py` with `PACK=<file> OUTDIR=<dir>`. It submits
   every variant first, then polls, then downloads, naming files by magic bytes and printing
   dimensions. `KIE_ONLY=<slug>` re-rolls one variant.
3. **Proofread.** Open every output. Read any rendered text letter by letter. Check the logo,
   the count of limbs and fingers, and the thing the brief hinged on. A succeeded task is not a
   usable image.
4. **Re-roll by slug**, not the batch. Change the prompt, not the seed; there is no seed.
5. **Record** what shipped: slug, task id, prompt, where it was posted.

## Prompting a character in a branded garment

Order the prompt the way the model reads it: subject, then garment and logo, then what is held,
then pose and mood, then setting and light, then rendering style, then the negative list, then the
spell-out. Concrete nouns beat adjectives.

- **The logo is text plus a mark; describe both as objects.** "On the chest of the hoodie, the
  n8n logo: the lowercase wordmark n8n in a bold rounded sans-serif, white, beside a small
  coral-pink node symbol of connected circles." Then spell it in words: "three characters, the letter n then
  the digit 8 then the letter n, written together with no hyphen or space". Without a spell-out
  the model writes n8m, nan or 88n about one time in three; with the hyphenated form `n-8-n`
  that the edit skill uses, Seedream printed the hyphen on the hoodie (one of three renders on
  2026-10-09). Hyphens work for editing existing text and leak when the text is being drawn fresh.
- **Name the version of the logo when it matters.** A brand mid-refresh has two marks; the
  model knows neither, so describe the one you want and say "no other logo, no other text
  anywhere". For the mark itself, image-to-image with a hosted PNG of the logo in
  `reference_urls` is the only way to get the exact shape; text can only get the colour and the
  wordmark right.
- **Limbs and props.** A snowman has stick arms; say "holding an open laptop in both stick arms,
  screen facing the viewer" or the laptop floats. Say how many of everything.
- **Mood words need a physical cue.** "Cool" alone does nothing; "dark sunglasses, a relaxed
  lean, one eyebrow raised" does.
- **Setting and light** carry the brand feel more than the garment does. For an internal post:
  "a bright modern office with large windows, soft daylight, a little snow outside".
- **Style line.** "3D rendered character, soft studio lighting, high detail, clean edges" for a
  mascot; "editorial illustration, flat colour, limited palette" for a graphic. Pick one; mixing
  gives you a muddy middle.
- **Negative list** at the end, plain: "no extra logos, no watermark, no text other than the
  wordmark, no distorted hands".

### Slack post sizing

Slack shows 4:3 and 16:9 cleanly in the message body and crops the preview of tall images. For a
reflection post with a character, 4:3 at `high` reads well on desktop and phone. Export PNG;
Slack recompresses anyway.

## Variants

Submit all variants, then poll: they run concurrently server-side. Keep three or four per pack;
the second and third are usually a setting change and a style change, not a rewrite. Name files
`v1_<slug>.png`. Cost is a few cents per image at `high`; a pack with a re-roll is well under a
dollar.

## Reference

- `references/seedream-5-pro.md`: the contract fields verbatim, the polling shape, failure codes.
- `scripts/generate.py`: pack runner (submit, poll, download, dimensions, magic-byte naming).
- `scripts/run.sh`: env wrapper with the key-file fallback.
- `scripts/packs/frosty-snowman.json`: a worked pack (character, branded hoodie, laptop, office).
- `../kie-image-edit`: hosting a reference image, model bench, the resolution finding.
