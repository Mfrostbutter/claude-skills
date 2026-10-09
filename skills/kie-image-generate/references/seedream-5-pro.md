# Seedream 5.0 Pro on Kie.ai

Read from docs.kie.ai/market/seedream/5-pro-text-to-image on 2026-10-09. Kie changes its catalog;
re-read before trusting a surprising row.

## Create

`POST https://api.kie.ai/api/v1/jobs/createTask`, `Authorization: Bearer <KIE_API_KEY>`,
`Content-Type: application/json`.

```json
{"model": "seedream/5-pro-text-to-image",
 "input": {"prompt": "...", "aspect_ratio": "4:3", "quality": "high",
           "output_format": "png", "nsfw_checker": false},
 "callBackUrl": "https://optional.example/hook"}
```

| field | type | rule |
|---|---|---|
| `model` | enum | `seedream/5-pro-text-to-image`; `seedream/5-pro-image-to-image` takes the same fields plus `image_urls` (array, always plural) |
| `input.prompt` | string | 4 to 5000 chars, required |
| `input.aspect_ratio` | enum | `1:1`, `4:3`, `3:4`, `16:9`, `9:16`, `2:3`, `3:2`, `21:9`; required; no `auto` |
| `input.quality` | enum | `basic` = 1K class, `high` = 2K class; required |
| `input.output_format` | enum | `png` (default), `jpeg` |
| `input.nsfw_checker` | bool | default false; a rejection surfaces as `fail` on recordInfo, not at create |
| `callBackUrl` | uri | optional |

Response `200`: `{"code": 200, "msg": "success", "data": {"taskId": "<id>"}}`. Check `code` in the
body; HTTP 200 is not success on its own.

## Poll

`GET https://api.kie.ai/api/v1/jobs/recordInfo?taskId=<id>` with the same header.

`data.state`: `waiting` then `generating` then `success` or `fail`.
On success `data.resultJson` is a JSON **string** containing `{"resultUrls": ["https://..."]}`.
On fail: `data.failCode`, `data.failMsg`. Also present: `costTime`, `creditsConsumed`,
`completeTime`. Seedream takes about two minutes at `high`.

Callback body, when `callBackUrl` is set: `code` 200 or 501, `data.state`, `data.resultJson`,
`data.failCode`, `data.failMsg`.

## Output

About 4.2 MP at `high` whatever the ratio (measured on the image-to-image twin: 3120x1344 at 21:9,
2496x1664 at 3:2, 1664x2496 at 2:3). Files keep for 14 days on Kie; download at once. PNG from
Seedream is honoured; some other Kie models ignore `output_format`, so the runner names files by
magic bytes.
