# Worked example: Discovery (n8n brand)

https://www.figma.com/design/OWCUEkb18MVSqNFX6Rrbbg (file key
`OWCUEkb18MVSqNFX6Rrbbg`, n8n GmbH org). Built 2026-10-19 from the three
Discovery FigJam boards (proposal 26K7xWgyrWrOCEsWc73Itk, how it works
EATlRMf71H7f5622mlTNv5, step by step hzxVBGhBs58TJCmP9YVkCE). Content and
decisions live in `n8n-fde-harness/discovery/`; this file is the branded print.

## Pages and boards

| Page | Id | Boards |
|---|---|---|
| Cover | 0:1 | 00 Cover 9:2 (Dark mode) |
| Foundations | 2:2 | Foundations 11:8 (swatches, token pairs, type specimen, font note) |
| Components | 2:3 | Card set 3:11 (Customer 3:2, Us 3:5, Discovery 3:8), Capsule set 3:18 (Light 3:12, Dark 3:14, Pink 3:16), Logo/Lockup black 3:24, light 3:30, dark 3:36, white 3:42, Symbol pink 3:45 |
| One page | 14:8 | Discovery, one page 14:9: nine sections (Hero 14:10, Short version 14:23, Today 14:36, Journey 15:20, Steps 15:74, Sixty days 16:79, Ask and return 16:121, Teams 17:112, Decide 17:148), 1440 x 7890, no connectors |
| Discovery | 2:4 | 01 Step by step 4:2, 02 One discovery 5:40, 03 Same journey 6:58, 04 Ask and return 7:92, 05 First 60 days 8:118 |

Boards are 1920x1080 at x 0, 2020, 4040, 6060, 8080.

## Component properties

Card: `Title#3:0` (text), `Subtitle#3:4` (text), `Show subtitle#3:8` (boolean).
Capsule: `Label#3:12` (text).

## Variables

Collections: n8n Primitives `VariableCollectionId:2:5`, n8n Color
`VariableCollectionId:2:30` (Light mode `2:1`, Dark mode `2:2`), n8n Shape
`VariableCollectionId:2:46`.

n8n Color: bg/primary 2:31, bg/secondary 2:32, bg/tertiary 2:33, bg/accent 2:34,
bg/accent-soft 2:35, bg/inverse 2:36, type/primary 2:37, type/secondary 2:38,
type/on-accent 2:39, type/on-inverse 2:40, type/accent 2:41, border/default 2:42,
border/strong 2:43, line/path 2:44, line/accent 2:45 (all `VariableID:` prefixed).

n8n Shape: radius/card 2:47 (16), radius/badge 2:48 (8), radius/pill 2:49,
radius/none 2:50, space/xs 2:51 (8), space/sm 2:52 (16), space/md 2:53 (24),
space/lg 2:54 (40), space/xl 2:55 (64), space/margin 2:56 (96).

## Text styles

| Style | Font | Size / line height |
|---|---|---|
| n8n/Display | Inter Medium | 72 / 100% |
| n8n/Title | Inter Medium | 44 / 110% |
| n8n/Heading | Inter Medium | 30 / 115% |
| n8n/Label | Inter Medium | 22 / 125% |
| n8n/Body | Inter Regular | 20 / 135% |
| n8n/Body small | Inter Regular | 17 / 135% |
| n8n/Caption | Inter Regular | 14 / 130% |
| n8n/Mono caps | Geist Mono Medium | 14 / 120%, 6% tracking |
| n8n/Mono caps large | Geist Mono Medium | 18 / 120%, 6% tracking |

Ids are in the ledger returned by `assets/foundations.js`; re-read them with
`getLocalTextStylesAsync()` rather than copying from here.

## What each board says

- 01 Step by step: ten steps in two columns, before and from signature, each a
  Card with who and when beside it; pink rail for the living brief from step 2.
- 02 One discovery: two Customer cards in, one Discovery hero card, three Us
  cards out, curved arrows.
- 03 Same journey: six stages, a Today row and a With early discovery row, dashed
  pink arrow for the brief travelling with the deal.
- 04 Ask and return: three Us asks, six Discovery returns, dashed arrows with a
  "makes possible" capsule.
- 05 First 60 days: timeline Day 0, 25, 39, 60, 90 with the platform track (Day 0
  to 39) and the people track (Day 39 to 60) above it.
