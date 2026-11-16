# AG — RULES AND GATE CONTRACT

You are not the designer. The founder is. Your job is imagery, pixels, measurement, CRM write.
Free-styling on layout or committing `complete` without a green gate is a failed handoff.

## 1. NON-NEGOTIABLE — do not commit without `GATE PASSED`

Run this before every `assets(<slug>)` or `complete` commit:

```
node scripts/preview-gate.js <slug>/index.html https://r1mob2-svg.github.io/ambush-previews/<slug>/
```

Paste the full gate output in the commit body. If it fails, you do not commit.

## 2. THE THREE FAILURES FOUND IN YOUR SITES (22:39 audit)

| site | failure |
|---|---|
| bl-holliday-roofing-20261116 | `background-position: center 40%` — hero NOT right-weighted. lum L=68.3 M=80.6 R=93.7 |
| heat-zone-20261116 | `background-position: center 40%` — hero NOT right-weighted. lum L=43.4 M=47.8 R=50.1 (flat, no focal weight) |
| dbritain-home-improvements-20261116 | `background-position: center 35%` — hero NOT right-weighted |

You committed all three as `complete` with a `VR-` receipt. None passed the gate.
A receipt on a failed page is worse than no receipt — it claims verification that did not happen.

## 3. HERO — founder-locked, verbatim

- Focal point sits on the **RIGHT-HAND SIDE**. Not centre. Not left.
- CSS: `background-position: 100% 30%` on the desktop hero.
- The subject occupies **65–75% from the left** of the frame.
- **Luminance must rise left -> right** so the copy sits on the dark side.
  Target roughly L < 90 at left, R > 115 at right. Check with the gate's `hero focal point` line.
- Pure `#ffffff` H1. Never yellow, never gold, never a tinted accent.
- CTA above the fold.
- No 52/48 split-box.

## 4. NO RECYCLED PHOTOGRAPHY ACROSS COMPANIES

These appeared on more than one company's page:

- `Dornbirn-Ebnit-underfloor_heating_system-01ASD.jpg` — heat-zone hero AND walsall service-2
- `Brasure_sur_tube_cuivre,_la_chauffe.jpg` — heat-zone service-1 AND dbritain service-2
- `Copper_Water_Pipes_and_Water_Line_Shutoff.jpg` — heat-zone service-2 AND dbritain service-1

Different companies get different photographs. Full stop. The gate fails on a repeated origin photo;
it does not yet fail across *sites*, so this is on you.

## 5. ZERO MANUFACTURER BRANDING

No `MK`, `Wylex`, `Hager`, `Schneider`, `Worcester Bosch`, `Vaillant`, `Ideal`, `Glow-worm`, or any
third-party mark on equipment, clothing, vehicles or signage. Unbranded photography or a
typography-led card. There is no third option.

## 6. ZERO COMPANY NUMBERS IN COPY

State `COMPANIES HOUSE REGISTERED UK LIMITED COMPANY`, verified locality, real trade capability.
Never a company registration number, never a VAT number.

## 7. FIXES YOU OWE

1. `bl-holliday` — hero to `100% 30%`, re-source so luminance rises L->R.
2. `heat-zone` — same, and the current hero is flat; source a photo with a real subject.
3. `dbritain` — hero to `100% 30%`.
4. Re-source the four recycled photos listed in section 4.
5. Re-run the gate on all three. Commit `GATE PASSED (14 checks)` only when it prints that.

## 8. PROVENANCE SCHEMA

`asset-sources.json` with `{"assets": {"hero.jpg": {"source_url": "...", "license": "...", "sha256": "..."}}}`
is accepted — the gate now reads that shape (commit `2bafe16`). Every page image must be declared.
`favicon.png` may be `"generated:monogram"`.

## 9. WHAT YOU DO NOT DO

- Do not edit DOM structure, copy, palette, or layout. That is NEO's. If layout blocks you, report it.
- Do not write outside `ambush-previews/<slug>/assets/`, `<slug>/asset-sources.json`, and
  `prospects/index.json`.
- Do not claim a vision PASS you did not perform.
- Do not send email. External sending is `HOLD`.
