---
name: kie-image-edit
description: >-
  Edit an existing image with the Kie.ai jobs API instead of regenerating it: swap
  headline text on a banner, change a colour, remove or add an element, grade a
  photograph, or restyle a graphic while the rest of the artwork stays intact. Use
  whenever the task is "change the text on this image", "make a version that says X",
  "edit this photo", "give me a cinematic / black and white / golden hour version",
  "clean up the background", "restyle this graphic", or any other image-to-image pass
  through Kie.ai. Also use it when a Kie edit came back cropped, letterboxed, soft, at
  the wrong aspect ratio, or with a dropped letter in the rendered text. Covers the
  workaround for Kie's dead uploader, which model ids actually accept an edit, the
  per-model size parameters, why there is no resolution control, prompt structure for
  a surgical edit, and the A/B variant loop.
---

# Kie.ai image edit

Image-to-image editing through the Kie.ai jobs API. Changing one thing in a source image and
leaving the rest alone is a different problem from generating a new image: most of the work is
stopping the model from redrawing the parts you wanted kept, and picking a model whose output is
usable at the size the source needs.

For text-to-image generation from a prompt, this is the wrong tool.

## The five things that go wrong

1. **Kie's own uploader is dead.** `kieai.redpandaai.co/api/file-base64-upload` 401s against a
   stale IP allowlist. Host the source yourself and pass a public URL.
2. **A wrong model id is a 422, and a right-looking id can still be a generation model** that
   reframes and redraws instead of editing.
3. **Output is soft.** The obvious default (`google/nano-banana-edit`) returns 2048x512 from a 4:1
   source and reads blurry at full size. Model choice is the fix, not prompting.
4. **The size parameter is named differently per model** and only some accept `auto`.
5. **The model drops letters.** A clean-looking render came back as "Enteprise". Always read the
   output text before shipping it.

## Steps

### 1. Host the source image

Kie fetches the source over HTTP, so it needs a publicly reachable URL. Anything works: an S3 or R2
object with public read, a static site directory, a GitHub raw URL, a temporary tunnel, or your own
small upload API. A typical self-hosted upload endpoint looks like this:

```
POST https://<your-image-host>/api/upload
Authorization: Bearer <IMAGE_HOST_TOKEN>
Content-Type: application/octet-stream
X-Filename: <name>.<ext>
X-Directory: <folder>
body: raw file bytes
```

Use the `url` the host hands back rather than rebuilding the path yourself. Servers rewrite
filenames (HEIC and HEIF commonly get transcoded to `.jpg` on upload), and a path you assembled
from the request will 404.

Upload once and reuse that URL for every variant and every re-roll.

**Reverse proxies 413 on a large file.** A 15 MB camera JPEG is rejected outright by a default
nginx `client_max_body_size`. Downscale first, and lose nothing real by doing it, since every model
returns 2-4 MP anyway:

```bash
ffmpeg -y -i big.jpg -vf scale=3000:-2 -q:v 3 small.jpg   # 26 MP / 15 MB -> 6 MP / 0.7 MB
```

ffmpeg is the dependency-free resize tool here; the reference scripts deliberately avoid Pillow so
they run on a bare Python. (On Windows, note that `convert` on PATH is the filesystem utility, not
ImageMagick.)

**Bake in rotation and strip EXIF before uploading.** Kie reads raw pixels and ignores the EXIF
orientation tag, so a phone photo that looks upright in your viewer gets edited sideways and comes
back sideways. Correct it in the pixels:

```bash
ffmpeg -y -noautorotate -i in.jpg -vf "transpose=1,scale=2016:2688" -map_metadata -1 -q:v 3 out.jpg
```

`-noautorotate` goes **before** `-i` and is not optional: ffmpeg already applies EXIF rotation to
JPEG input on its own, so an explicit `transpose` on top of that rotates twice and lands 180 degrees
out. `transpose=1` is 90 clockwise, `transpose=2` is 90 counter-clockwise. Look at the exported file
before you upload it.

**Secrets.** The scripts read `KIE_AI_API_KEY` and, if you use a token-authenticated image host,
`IMAGE_HOST_TOKEN` from the environment. Inject them from whatever secret store you use and never
print them. `scripts/run.sh` is a thin wrapper showing the shape.

**Whatever you upload is public until you delete it.** Plan the cleanup before the upload, not
after, and do not upload anything you would not publish. Many small upload APIs have a delete
endpoint that is fussier than the upload one (different token, a trailing slash that a proxy 301s
without, a path format that is not the one the upload response gave you), so verify deletion
actually works on a throwaway file before you rely on it.

### 2. Pick the model

Read `references/models.md` for the bench, the full id list, and the per-model parameter table.
The short version:

| want | model | size param |
|---|---|---|
| default: any source ratio, sharp | `grok-imagine-image-2-0/image-edit` | `aspect_ratio: auto` |
| max resolution, source ratio is on seedream's enum | `seedream/5-pro-image-to-image` | `aspect_ratio: <exact ratio>` + `quality: high` |
| fast cheap copy iteration | `google/nano-banana-edit` | `image_size: auto` |

Grok returns 2816x704 from a 1400x350 source and holds 4:1; nano-banana-edit returns a softer
2048x512 in 17s; seedream returns 3120x1344, the sharpest and biggest of the three. Iterate copy on
nano-banana-edit, render the keeper on grok or seedream.

Seedream has no `auto`, but it does take `16:9, 9:16, 4:3, 3:4, 3:2, 2:3, 1:1, 21:9`. If your
source is one of those, seedream keeps the framing and is the best answer; it only reframes when
the source ratio is off its list, which is why a 4:1 banner comes back outpainted to 21:9.

**There is no way to ask for a resolution.** Output size is a fixed per-model budget: `auto`
follows the source *ratio*, not its pixel count, and seedream's `resolution` key is accepted and
ignored. Model choice is the only lever. Measured across five aspect ratios, grok lands at ~2.0 MP
every time and seedream at ~4.2 MP every time. Editing a real photograph through Kie is therefore
always a loss against the original: keep the original and treat the output as a look reference or a
web-size deliverable.

### 3. Create the task

```
POST https://api.kie.ai/api/v1/jobs/createTask
Authorization: Bearer <KIE_AI_API_KEY>

{"model": "grok-imagine-image-2-0/image-edit",
 "input": {"prompt": "...", "image_urls": ["https://..."],
           "output_format": "png", "aspect_ratio": "auto"}}
```

`image_urls` is always the plural array, even for one image. Adding a model means probing its
required fields off the error messages; `references/models.md` has that procedure, including how to
read an enum out of Kie for free.

### 4. Poll and download

```
GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>
```

`data.state` is `waiting` -> `generating` -> `success` | `fail`. On success, `data.resultJson` is a
**JSON string**; parse it, then take `resultUrls[0]`. Latency runs 15s (nano-banana-edit) to ~2min
(grok, seedream). Result URLs live on `tempfile.aiquickdraw.com` and expire, so download immediately.

Name the saved file by sniffing magic bytes. grok ignores `output_format` and returns JPEG, so
writing it as `.png` produces a misnamed file.

**A 200 can still carry an error.** Kie returns HTTP 200 with the real status in the body, so a
billing failure or a rejected parameter looks like a successful request to anything that only checks
the status code. Always assert `code == 200` in the body and that the id or url you expect is
actually present.

### 5. Measure, then proofread

Two checks, both on the file, neither optional:

- **Dimensions.** Parse the output header and confirm the aspect matches the source and the pixel
  count is what you expected. Both reference scripts print this. If resolution was the point of the
  job and the first render did not gain any, change model before spending on the rest.
- **Text.** Open every output and read the rendered copy character by character. Do not trust that a
  variant is correct because the task succeeded. Digits and unusual tokens ("FY26") are the highest
  risk.

Re-roll individual variants rather than the whole batch.

Then clean up the hosted source.

## Prompting for a surgical edit

Name what changes, then enumerate what must not. Vague preservation language ("keep the style") gets
the whole image redrawn.

```
Edit this wide banner image. Replace only the words 'OLD TEXT' with 'NEW TEXT'.
Keep every other pixel unchanged: same background, same glow, same lightning bolt
artwork, same logo in the same place. Same font, size, color gradient and position
for the headline. Output the full original wide banner, do not crop, do not
letterbox, do not change the aspect ratio. Render at maximum sharpness with crisp
anti-aliased letterforms and no blur.
Spell the headline exactly, letter by letter: N-E-W T-E-X-T. Proofread the
rendered text before finishing; every letter must be present and in order.
```

What each part is doing:

- **"Replace only"** plus a literal quote of the old string anchors the edit to one region.
- **Enumerating the keeps by name** (background, glow, the specific art element, the logo) is what
  stops the redraw. Listing them individually beats "keep everything else".
- **"do not crop, do not letterbox, do not change the aspect ratio"** backs up `auto`.
- **The hyphenated spellout** is the fix for dropped letters. Add it whenever the new text contains
  a long or uncommon word.

Prompting cannot rescue resolution; that is a model choice. Output detail is bounded by the source
plus whatever the model invents, so a small source enlarged has fabricated detail, not recovered
detail. If a crisp result matters more than reproducing the source art exactly, rebuild the graphic
in a vector tool instead of editing a bitmap.

### Grading a photo rather than swapping text

Same shape, different anchors. A grade prompt with only a look in it drifts to a generic scene, and
one without named keeps redesigns the buildings. Use three parts:

1. **Subject** - restate what the photo actually shows, in one sentence. "This photograph shows a
   wide river between forested mountains, with a ruined brick castle on a small island at the right,
   bare winter trees in the foreground..."
2. **Look** - the grade, in cinematographer terms: time of day, direction and quality of light,
   palette, contrast, atmosphere. Concrete beats adjectival ("warm low sun raking in from the left,
   long soft shadows, a warm specular glitter path on the water").
3. **Keep** - composition, camera position, framing, horizon, then every structure by name, then
   "do not add people" and "this is a colour, light and atmosphere grade of a real photograph, not a
   reimagining."

Model character matters more here than on a text swap. grok is interpretive and will invent elements
to sell the look (it added a sun disc that was not in frame); seedream is conservative and
photographic, staying closer to the source frame. Pick grok for a stylized look, seedream for a
believable regrade.

**Fidelity falls off as the look moves away from the captured conditions**, and the keep block does
not stop it. Measured on one frame across five looks:

| ask | what survived |
|---|---|
| recover the colour already in the frame | everything; reads as a develop of the same file |
| black and white conversion | everything |
| time of day change (blue hour) | everything |
| time of day change (golden sunrise) | geometry mostly held, but it enlarged and redrew a building |
| season change (autumn + fog) | rewrote background ridgelines and invented hills |

So when someone asks to "bring out the colours that are already there", write a restrained brief and
say so explicitly ("this should look like a careful raw develop of this exact frame, nothing
pushed"). That one lands near-perfect. Sell a season change as a new picture, not an edit.

`scripts/gen_photo_looks.py` implements this: one source, a dict of named looks, fan out and
download with dimensions printed. Point `LOOK_PACK` at a JSON file
(`{"subject": ..., "keep": ..., "looks": {slug: prompt}}`) and `OUTDIR` at a destination to run a new
shoot without forking the script. `scripts/packs/example-landscape.json` is a worked example.

### Portraits need a fourth block: the identity lock

A person is not a landscape. Ask for a colour grade and these models will also quietly slim, smooth,
de-age and prettify the subject, and within one pass the face drifts into a generic model. Add an
identity block naming what must survive:

> Keep the same person: their exact face, facial structure, eyes, nose, mouth, jawline, expression
> and gaze direction, their hair colour, length and how it falls, their skin tone, and their body
> proportions. Keep the same pose, the same hands and their placement, and the same garment exactly
> as worn. They must be immediately recognisable as the same person in the same moment. Do not slim,
> reshape, age or beautify them, do not change the neckline or coverage of the garment, and do not
> add or remove people.

The anti-beautify sentence carries as much weight as the identity sentence. For a retouch brief, say
what "retouch" means in photographic terms - even skin tone *while keeping visible pores and
texture*, reduce shine, tidy stray hairs, no smoothing that removes texture, no reshaping - or you
get a plastic result.

`scripts/gen_portrait_looks.py` implements this, with grade / set-change / retouch treated as
separate prompt kinds.

**People are not landscapes for consent either.** Uploading puts an identifiable person's photo on a
public URL and sends it to a third-party model. Ask the owner before the upload, not after, and
treat the answer as scoped to that one image.

**NSFW:** Kie takes an `nsfw_checker` boolean. A rejection surfaces at the `recordInfo` `fail`
state, not at `createTask`, so print `failCode`/`failMsg` in the poller or a rejection looks like a
timeout. Fourteen renders of a lingerie portrait across both models, covering grade, set change and
retouch, came back with zero rejections, so on that kind of frame the filter is not a practical
constraint. Build the poller to report the failure anyway.

**Changing an expression** is its own prompt kind, not a grade. Two traps:

1. The identity block locks expression, so drop that one word for this edit and keep everything else
   locked. Leave it in and the model splits the difference into a smirk.
2. "Smile" carries "smile at the camera" with it, and the model will rotate the head to match even
   when you name gaze direction twice. Beating it takes five things together: scope the edit to one
   body part ("change only the shape of their mouth"), state that the head does not move as its own
   sentence, describe the existing head pose positively and concretely, state the social frame (they
   are not smiling at the viewer, they are smiling at what they are already looking at), and close
   with "compare the head angle against the source and match it."

Never ask for a smile that "reaches the eyes" or for "natural crinkling at the corners" on a real
person. You get crow's feet and laugh lines that were not in the source. Enumerate the wrinkles you
do not want instead: no nasolabial folds, no crow's feet, no under-eye wrinkles, no forehead lines,
no squinting.

**Which model for a portrait.** seedream is the more faithful of the two: it returns the source
framing, scale and background objects essentially untouched, at 2x the pixels. grok drifts the frame
slightly on every look. Both hold identity when the lock block is present. The one place grok wins is
**structural object removal** - asked to delete a foreground object, seedream tends to pull the
camera back and reconstruct a wider scene, which changes the composition as a side effect, while
grok removes the object in place.

## Variants

Submit every variant's `createTask` first, then poll them in a second pass. They run concurrently
server-side and the whole batch lands in about the time of the slowest one.

Gate re-runs on a slug filter (`KIE_ONLY` in the reference scripts) so a single bad variant costs
one task, not the batch.

Naming: `v1_<slug>.<ext>`, `v2_<slug>.<ext>`, where the slug is the actual copy. Someone choosing
between headline options is comparing filenames as much as images.

## Reference implementation

- `scripts/gen_banner_text.py` - upload, fan out three text variants, poll, download. Copy and edit
  `VARIANTS` + `PROMPT` for a new job rather than writing a new script.
- `scripts/gen_photo_looks.py` - grade a photo through several named looks; takes a `LOOK_PACK` JSON
  so a new shoot is a data file, not a fork.
- `scripts/gen_portrait_looks.py` - the same for portraits, with the identity lock and the
  grade / set / retouch / expression prompt kinds.
- `scripts/bench_models.py` - same source and prompt through several models, printing a markdown row
  per model with dimensions, file size and latency. Run this when output quality is the complaint, or
  when Kie ships a model worth testing.
- `scripts/run.sh` - env-var wrapper; adapt it to your secret store.

All of them read image dimensions straight from the PNG/JPEG header, so there is no Pillow
dependency. If you patch these scripts from another Python process, pass `encoding="utf-8"`
explicitly: on a Windows default of cp1252 a `write_text` that raises mid-encode has *already*
truncated the file, and one of these scripts was lost to exactly that.

## Cost

Roughly $0.02 per image at 1K, more at higher resolutions. Three variants plus a re-roll is a dime
or so. Model and field probing each cost a task, so probe with one variant, never the batch. Reading
an enum out of the validator is free; see `references/models.md`.
