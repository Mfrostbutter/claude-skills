# Kie.ai edit models

Everything here was probed live against `api.kie.ai/api/v1/jobs/createTask` on 2026-09-06 with one
1400x350 (4:1) source banner and one headline swap. Kie changes its catalog; re-probe before
trusting a row that surprises you.

## Bench

Same source, same prompt, one variant each.

| slug | model id | params | output | file | latency |
|---|---|---|---|---|---|
| nano_banana_edit | `google/nano-banana-edit` | `image_size=auto` | 2048x512 (4:1, source aspect) | 1320 KB PNG | 17s |
| seedream5_21x9_4k | `seedream/5-pro-image-to-image` | `aspect_ratio=21:9, quality=high, resolution=4K` | 3120x1344 (21:9, reframed) | 4844 KB PNG | 114s |
| seedream5_21x9_2k | `seedream/5-pro-image-to-image` | `aspect_ratio=21:9, quality=high, resolution=2K` | 3120x1344 (identical) | 3523 KB PNG | 124s |
| grok_imagine2_edit | `grok-imagine-image-2-0/image-edit` | `aspect_ratio=auto` | 2816x704 (4:1, source aspect) | 307 KB JPEG | 132s |

### 3:2 source (6240x4160 photo, downscaled to 3000x2000 before upload, one grade prompt)

| model | params | output | vs input | file | latency |
|---|---|---|---|---|---|
| `grok-imagine-image-2-0/image-edit` | `aspect_ratio=auto` | 1728x1152 (2.0 MP) | **downgrade** | 671 KB JPEG | ~25s |
| `seedream/5-pro-image-to-image` | `aspect_ratio=3:2, quality=high` | 2496x1664 (4.2 MP) | downgrade, 2x grok | 6440 KB PNG | ~130s |

This is the row that keeps you honest. grok's 2816x704 on the 4:1 source was **not** a general
"~2 Mpx or better" guarantee; on 3:2 it returns 2.0 MP and on a real 26 MP photo that is a heavy
loss. seedream accepted `3:2` and held the framing with no outpainting, which is the direct
confirmation that it only reframes when the source ratio is off its enum.

### 2:3 source (4160x6240 portrait, downscaled to 2000x3000 before upload, seven look prompts each)

| model | params | output | file | latency |
|---|---|---|---|---|
| `grok-imagine-image-2-0/image-edit` | `aspect_ratio=auto` | 1152x1728 (2.0 MP) | ~600 KB JPEG | ~30s |
| `seedream/5-pro-image-to-image` | `aspect_ratio=2:3, quality=high` | 1664x2496 (4.2 MP) | 4.7 to 6.9 MB PNG | ~130s |

Five aspect ratios tested now (4:1, 3:2, 2:3, 3:4 and the banner source), and each model returns the
same pixel count every time: grok ~2.0 MP, seedream ~4.2 MP (3:4 lands at 1776x2352). **Output size is a fixed per-model budget.** Aspect ratio only decides how those
pixels are shaped.

**Editing a real photograph through Kie always loses resolution.** The only question is how much.
If the original matters, keep it and treat the Kie output as a look reference or a web-size deliverable.

Reading it:

- **grok** is the default. Only model that both holds the source aspect and renders crisp
  letterforms; 2x nano-banana-edit linearly. Costs ~2 minutes.
- **seedream** is the sharpest and largest, but has no `auto`, so it always reframes. On a 4:1
  source it outpaints to 21:9 and needs a crop back. Use it when you want maximum resolution and a
  crop is acceptable.
- **nano-banana-edit** is the fast cheap check: 17s vs ~2min. Good for iterating on copy before
  committing to a slow model. Noticeably softer.

## Model ids

| id | status |
|---|---|
| `google/nano-banana-edit` | valid, edit |
| `grok-imagine-image-2-0/image-edit` | valid, edit |
| `seedream/5-pro-image-to-image` | valid, image-to-image + multi-reference composition |
| `nano-banana-2` | valid, but a **generation** model: reframes and redraws. Text-to-image only. |
| `google/nano-banana-2` | 422 |
| `nano-banana-2-edit` | 422 |
| `bytedance/seedream-4-edit` | 422 |
| `qwen3-pro/image-to-image` | 422 |
| `grok-imagine-image-2-0/image-to-image` | 422 |

The kie.ai market page slug is **not** reliably the API model id. Two of the four slugs taken
straight off market canonical URLs 422'd. Probe before building on one.

## Per-model parameters

The size parameter is named differently per model and there is no shared default.

| model | size key | accepts `auto`? | enum | also required |
|---|---|---|---|---|
| `google/nano-banana-edit` | `image_size` | yes | `1:1, 9:16, 16:9, 3:4, 4:3, 3:2, 2:3, 5:4, 4:5, 21:9, auto` | - |
| `grok-imagine-image-2-0/image-edit` | `aspect_ratio` | yes | at least `auto`; rejects `99:1` | - |
| `seedream/5-pro-image-to-image` | `aspect_ratio` | **no** | `1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 21:9` | `quality` |

Send the wrong key and you get a paid failed task or a silent default, so `gen_banner_text.py`
derives it from the model name in `size_params()` and refuses to run seedream without a valid
`KIE_ASPECT`.

`image_urls` is always the plural array, even for one image. Singular `image_url` returns
"This field is required".

`auto` matches the source aspect even when the source ratio is not in the enum: 1400x350 in gives
2048x512 (nano-banana-edit) or 2816x704 (grok) out.

**seedream has no `auto`, but it does accept `16:9`** and the other common ratios. Its reputation
for reframing is an artifact of a 4:1 test source, which is not in any enum. Give it a source
whose ratio is on its list and it keeps the framing. It only outpaints when you have to round the
source to a nearby ratio.

`resolution` on seedream is accepted and then **ignored**: 2K and 4K both returned 3120x1344. Do
not reach for it expecting a size change.

## There is no resolution control

Say this out loud before promising anyone a "higher resolution version". Output size is a **fixed
per-model budget**, not something you request:

- `auto` follows the source *ratio*, not its pixel count.
- seedream's `resolution` key is ignored.
- Nothing accepts a target width or height.

Your only lever is which model you send it to, and every number in the bench above came from **one
4:1 source**. A 16:9 source will land at that model's own 16:9 size, which may be at or below your
input. Do not assume grok's 2816x704 means "always ~2 Mpx and always a gain". Treat the first
render as the measurement: parse the output header, compare against the source, and only then fan
out the rest of the variants.

The deeper limit: output detail is bounded by the source plus whatever the model invents. A small
source enlarged has fabricated detail, not recovered detail. When crispness matters more than
reproducing the exact source art, rebuild the graphic in Figma instead of editing a bitmap.

`output_format: png` is honored by nano-banana-edit and seedream. grok ignores it and returns JPEG
regardless, with a C2PA-style provenance `Signature` in EXIF. Name the downloaded file by sniffing
magic bytes, not by what you asked for.

## Discovering a new model's required fields

Kie has no per-model schema endpoint you can read from here, so the errors are the documentation.

1. POST with just `prompt` + `image_urls`. `"This field is required"` (HTTP 500 body, code 500)
   means a required param is missing but does not say which.
2. Add the likely one (`aspect_ratio` first, it is required on both new models) and re-POST.
3. Enum errors name the field: `"This aspect_ratio is not within the range of allowed options"`.
   nano-banana-edit's `image_size` error goes further and prints the whole enum.

One trap: **seedream enforces a prompt minimum length**. A one-word probe returns
`"The text length cannot be less than the minimum limit"`, which masks every other parameter error.
Probe seedream with a real sentence when you want it to actually run.

**Probing an enum is free if you keep the prompt short.** Validation runs before task creation, so
a rejected request costs nothing. Better, the checks are ordered: with a short prompt like
`"probe"`, an invalid ratio returns the aspect error while a *valid* one falls through to the next
complaint (`"The text length cannot be less than the minimum limit"` or `"This field is required"`).
Two different errors, neither one a task. That is how seedream's enum above was read out:

```bash
for ar in auto 1:1 16:9 9:16 4:3 3:4 3:2 2:3 21:9 5:4 4:5 2:1 4:1; do
  # "aspect_ratio ... not within the range" = invalid; any other error = valid
  curl -s -X POST https://api.kie.ai/api/v1/jobs/createTask -H "Authorization: Bearer $K" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$MODEL\",\"input\":{\"prompt\":\"probe\",\"image_urls\":[\"$U\"],\"aspect_ratio\":\"$ar\"}}"
done
```

Probing whether a full valid payload *renders* does cost a task. Do that with one variant, never
the batch.
