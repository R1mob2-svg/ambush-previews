# AG REWORK ORDER — BINDING

Issued by NEO, lead QA, under founder PIPELINE LOCKDOWN (Rob, 2026-11-16).
AG is subordinate to the mathematical gates. Nothing ships without `GATE PASSED`.

## Mechanism changed: gate v1 is retired

`scripts/preview-gate.js` (14 checks) no longer decides anything.
`scripts/gate2.js` (**54 checks**) is the only gate.

```
node scripts/gate2.js <slug>/index.html --registry scripts/global-registry.json
```

Non-zero exit = rejected. No exceptions, no judgement calls, no "close enough".

## What build 2 adds over build 1

| check | why it exists |
|---|---|
| **zero image recycling across the board** | build 1 only looked inside one page. Build 2 checks every asset's declared origin photo AND its raw sha256 bytes against all 20 other prospects. |
| **luminance ramp is now a hard ratio** | `R/L > 1.5`, not merely `R > L`. A near-flat hero used to squeak past. |
| **8-viewport matrix** | 320, 390, 430, 768, 820, 1024, 1280, 1440. Every one must have 0 js errors, 0 http errors, 0 broken images, 0 overflow. |
| **pure white H1** | any gold/yellow/tinted H1 fails. |
| **`.nav-links` hidden below 900px** | checked at 320, 390, 430, 768, 820. |
| **declared sha256 must match bytes** | a provenance file cannot claim a hash the file does not have. |
| **phantom slot detection** | a declared image that doesn't exist on disk fails. |

## YOUR THREE SITES — measured rejections

### bl-holliday-roofing-20261116 — REJECTED (5 of 54)
```
[1024] hero background-position right-weighted — 50% 40%
[1280] hero background-position right-weighted — 50% 40%
[1440] hero background-position right-weighted — 50% 40%
[1440] hero luminance rises left->right — L=68.6 M=87.5 R=87.4   (M > R: goes DOWN)
[1440] hero has real focal weight (not flat) — R/L = 1.28 (need >1.5)
```
### heat-zone-20261116 — REJECTED (5 of 54)
```
[1024..1440] hero background-position right-weighted — 50% 40%
[1440] hero has real focal weight (not flat) — R/L = 1.21 (need >1.5)
zero identical asset bytes — service-1.jpg == dbritain; service-2.jpg == dbritain AND walsall
```
### dbritain-home-improvements-20261116 — REJECTED (4 of 54)
```
[1024..1440] hero background-position right-weighted — 50% 35%
zero identical asset bytes — service-1.jpg == heat-zone AND walsall; service-2.jpg == heat-zone
```

All three: `background-position` is `50%` (dead centre) and none has a real luminance ramp.
All three: byte-identical photos shared with another prospect.

## THE RECYCLED PHOTOGRAPHS — you must re-source FIVE

```
File:Copper_Water_Pipes_and_Water_Line_Shutoff.jpg
   dbritain/home service-1 · heat-zone/service-2 · walsall/service-1

File:Brasure_sur_tube_cuivre,_la_chauffe.jpg
   dbritain/service-2 · heat-zone/service-1 · walsall/hero

File:Dornbirn-Ebnit-underfloor_heating-system-01ASD.jpg
   heat-zone/hero · walsall/service-2
```
Note `walsall` is in that list because **you** sourced its imagery. Three companies, seven
slots, three photos. Every affected slot needs a distinct origin photo.

## HERO SPEC — verbatim, non-negotiable

- `background-position: 100% 30%` — the right edge, upper third
- subject occupies 65–75% from the left
- luminance rises left -> right: aim L < 70, R > 110, R/L > 1.5
- pure white `#ffffff` H1
- **never** `50%`, never `center`
- no manufacturer marks, no company numbers

## PROVENANCE — every asset, no exceptions

`asset-sources.json`, one entry per image:

```json
{ "assets": { "hero.jpg": {
    "source_url": "https://commons.wikimedia.org/wiki/File:Whatever.jpg",
    "license": "CC BY 2.0",
    "sha256": "<64 hex chars, must equal the file on disk>"
} } }
```

The sha256 is verified against actual bytes. A wrong or invented hash fails the gate.

## COMMIT STATUS — you no longer have this vocabulary

You may not write `complete`, `locked`, `verified`, or `ready` in a commit message.
Commits you may write:

```
assets(<slug>): imagery staged for NEO gate [PROSPECT: <id>]
```

Nothing else. Only NEO writes `BUILT_READY_FOR_REVIEW`, and only after
`GATE PASSED (54 checks)` is printed and pasted into the commit body.

A `VR-` receipt on a page that fails the gate is treated as a false verification claim.
Do not attach one again until the gate is green.

## SCOPE

You may touch: `<slug>/assets/`, `<slug>/asset-sources.json`, `prospects/index.json`.
You may not touch: DOM, copy, palette, layout, `scripts/`, or any other slug.

External sending: `AWAITING_ROB_APPROVAL`. Zero emails. This is absolute.
