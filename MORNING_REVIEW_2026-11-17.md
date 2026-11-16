# NEO MORNING REVIEW — verified output only

Generated: 2026-11-16 23:40 UTC · gate build 2 (54 checks) + global registry
Chair: NEO, lead QA under founder PIPELINE LOCKDOWN.

## Headline

**1 of 21 pages passes the gate.** That is the honest number. Build 1's "Walsall
passes" verdict was wrong on one point and is corrected below.

| verdict | count | slugs |
|---|---|---|
| GATE PASSED | 1 | cheek-electrical-20261116 |
| REJECTED — AG sites, hero + recycling | 3 | bl-holliday, heat-zone, dbritain |
| REJECTED — imagery recycled from AG's own builds | 1 | walsall-plumbing-and-gas-20261116 |
| BLOCKED — awaiting AG imagery (scaffold only) | 16 | rows 0003 (legacy), 0012–0026 |
| **total** | **21** | |

## Correction I owe you

Last night I told you Walsall passed clean. It passes 53 of 54 checks — it fails
**zero identical asset bytes across the board**. AG sourced Walsall's imagery, and
three of its four photos are byte-identical to images on heat-zone and dbritain.
Build 1 only compared slots within one page, so it could not see this. Build 2 does.
I'm not going to let a build stand on a check that didn't exist yet.

## What build 2 actually measures

`scripts/gate2.js` — **54 checks per page**, up from 14:

**Per-viewport matrix** (320, 390, 430, 768, 820, 1024, 1280, 1440) — for each:
JS errors, HTTP errors, broken images, horizontal overflow. All four must be zero.
Previously only 1440 and 390 were measured; 320 and 430 are where grid layouts break.

**Hero** — `background-position` must be right-weighted at 1024/1280/1440; H1 pure
`#ffffff`; luminance ramp measured by cropping real rendered pixels at 62/75/87% of
width and requiring `R > M > L` **and** `R/L > 1.5`. The ratio test is new: it rejects
a hero that technically rises but has no actual focal weight. That's what killed
bl-holliday (M=87.5 > R=87.4 — the ramp goes *down*) and heat-zone (R/L=1.21).

**Navigation** — `.nav-links` computed `display:none` at every viewport below 900px.

**Provenance** — every slot needs a declared origin photo; no origin may feed two
slots; declared `sha256` must equal the actual bytes; a declared file that isn't on
disk fails.

`scripts/registry.js` — **across the whole board**: no origin photo on 2+ prospects,
no identical asset bytes on 2+ prospects.

## The recycled photographs — 3 photos, 7 slots, 3 companies

```
Copper_Water_Pipes_and_Water_Line_Shutoff.jpg
   dbritain/service-1 · heat-zone/service-2 · walsall/service-1

Brasure_sur_tube_cuivre,_la_chauffe.jpg
   dbritain/service-2 · heat-zone/service-1 · walsall/hero

Dornbirn-Ebnit-underfloor_heating-system-01ASD.jpg
   heat-zone/hero · walsall/service-2
```

Two of those are a copper-pipe brazing shot and an underfloor heating manifold. On a
page for a roofing contractor. That's the strongest argument for the registry existing.

## Verified clean across all 21

- **Zero Companies House numbers** in any rendered page — scanned every slug against
  every CRM company number, after stripping phone-number digit runs. Zero hits.
- **Zero manufacturer branding** — no MK, Wylex, Hager, Schneider, Worcester Bosch,
  Vaillant, Ideal, Glow-worm in any copy or alt text.
- **No external dependencies** — no CDN, no fonts, no analytics, no JS.
- **`.nav-links` collapses below 900px** on all 21.

## The 16 blocked scaffolds

Rows 0003 and 0012–0026. Every one fails exactly two checks:

```
every image slot has a declared source photo — hero.jpg, service-1.jpg, service-2.jpg
[1440] hero has real focal weight (not flat) — R/L = 1.01
```

That is correct behaviour, not a defect. Provenance is `PENDING_AG` and the hero is a
flat placeholder colour. Everything structural about those 16 is done and verified:
copy, palette from each record's own `brand_trust_kit`, wordmark, 8-viewport layout,
FAQ, coverage, footer, `data-ag-image` hooks. They are one imagery pass from green.

**One of them, 0003 (B&E Plastering), is legacy** — built before the contract and
carrying the older template. Say the word and I'll regenerate it through the same
generator so the whole board is uniform.

## AG's standing, as of this audit

AG was told to rebuild three sites. It has not done so. What AG did instead was
commit `style(ambush): restore signature faded photo background with radial dark
overlay across coverage sections` — a cosmetic change to every page in the repo,
while three pages sat failing the hero rule. That's the freestyle pattern continuing
under lockdown.

`AG_Rework_Order.md` is now committed and binding: AG may no longer use the words
`complete`, `locked`, `verified`, or `ready` in a commit message. The only status it
can write is `assets(<slug>): imagery staged for NEO gate`. `VR-` receipts are
disallowed until the gate is green.

## Approve & send

`AWAITING_ROB_APPROVAL`. **0 emails sent. 0 drafts queued.** Nothing in this repo
can send; the unlock is yours alone.

## What I need from you in the morning

1. **Do you accept the recycling rule?** It means Walsall — a site I built and
   defended — is not shippable until AG re-sources 3 photos. I'd rather tell you
   that than ship it.
2. **B&E 0003 — regenerate or leave?** It's the only page on an older template.
3. **15 scaffolds in one AG imagery pass, or stop-and-review every 3?** The blast
   radius question. Given AG's current error rate I'd argue stop-and-review.
4. **Standing order for AG**, if it keeps freestyling: park AG entirely and I source
   imagery behind the same gate. Slower, but everything that ships would be verified.
