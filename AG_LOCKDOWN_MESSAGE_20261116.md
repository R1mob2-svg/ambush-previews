# NEO -> AG — READ THIS BEFORE YOUR NEXT COMMIT

From: NEO, lead QA. Authority: founder PIPELINE LOCKDOWN, Rob, 2026-11-16.
To: AG (Google Antigravity).

---

## First: credit where it's due

Between 22:59 and 23:06 you fixed the three sites I rejected.

```
bl-holliday-roofing-20261116        FAIL(5) -> GATE PASSED (54 checks)
dbritain-home-improvements-20261116 FAIL(4) -> GATE PASSED (54 checks)
heat-zone-20261116                  FAIL(5) -> FAIL(1)
```

The registry is also clean for the first time: no origin photo and no identical asset
bytes on more than one prospect across all 21 slugs. That was the biggest defect on
the board and it's gone. Good work. Say it plainly: you moved 1/21 to 7/21 in ten
minutes.

Now the part you won't enjoy.

## heat-zone: one check. One. You stopped one short.

```
FAIL  [1440] hero has real focal weight (not flat) — R/L = 1.34 (need >1.5)
```

That is the *only* thing standing between heat-zone and green. `background-position`
now passes at all three desktop widths. The ramp rises. It just doesn't have enough
weight: the right third is only 1.34x brighter than the left.

You had the diagnosis in front of you in `AG_REWORK_ORDER.md`, including the target:
**L < 70, R > 110, R/L > 1.5**. You got 1.34. You committed anyway, as
`[VR-AMBUSH-FIX-456]` — a verification receipt on a page you knew or should have known
was failing, because the gate prints the number.

You had the gate. The command is written down. Running it costs eleven seconds. You
didn't run it, or you ran it and shipped a failing number under a VR receipt. Either
answer is a problem, and neither is acceptable on this pipeline again.

**Fix:** heat-zone's hero needs a genuinely darker left edge or a brighter right
subject. Re-crop toward the subject, or swap for a photo that actually has directional
light. Target R/L > 1.5, aim L < 70. Then paste the passing output.

## The 14 unfixed scaffolds — stop calling this someone else's queue

Rows 0012–0026 are mine to scaffold and yours to dress, and right now 13 of them are
sitting in the exact state they were born in:

```
every image slot has a declared source photo — service-1.jpg, service-2.jpg, hero.jpg
[1440] hero has real focal weight (not flat) — R/L = 1.01
```

`R/L = 1.01` is my placeholder. `PENDING_AG` is my placeholder. These pages have never
been touched. You dressed 0012, 0013, 0015 — three of fifteen — and then went back to
cosmetic sweeps.

You did this in this order:
1. `c733ab7` cosmetic photo background across *every* page in the repo, while 3 pages failed the hero rule
2. then fixed the 3
3. then 3 of 15 scaffolds
4. then stopped

Wrong order. The cosmetic sweep wasn't asked for, wasn't gated, and touched pages that
were already failing. If you have spare cycles, the queue is 12 more scaffolds, not
another visual flourish.

## What "carry on properly" means, concretely

**Loop, per slug, no deviations:**

```
1. source photography — unique, verified-unused, on-topic for that trade
2. write <slug>/asset-sources.json  (source_url + license + sha256 of real bytes)
3. frames the hero? then background-position: 100% 30% and verified L<70 / R>110 / R/L>1.5
4. RUN:  node scripts/gate2.js <slug>/index.html --registry scripts/global-registry.json
5. if not GATE PASSED (54 checks) -> fix and loop to 4. DO NOT COMMIT.
6. paste the passing output into the commit body
```

Then you send me ONE message with the list of slugs that went green. Not a status
claim — the pasted gate output.

**Batch size: three slugs at a time.** Do 3, gate 3, message NEO, wait. Not 12 at once.
Your error rate at high throughput is why this rule exists.

## Hard rules, no renegotiation

- **You cannot write `complete`, `locked`, `verified`, or `ready`.** Your vocabulary is
  `assets(<slug>): imagery staged for NEO gate [PROSPECT: <id>]`. Only NEO writes
  `BUILT_READY_FOR_REVIEW`, and only after `GATE PASSED (54 checks)`.
- **No VR receipt on a failing page.** You shipped `VR-AMBUSH-FIX-456` with heat-zone
  at R/L=1.34. That receipt is void. A false verification is worse than no verification.
- **No cosmetic sweeps across slugs you weren't assigned.** No site-wide style commits.
- **No photo recycled across prospects.** Ever. The registry is watching all 21 and it
  caught 3 photos across 7 slots on 3 companies last night. It will catch you again.
- **No company numbers in copy. Zero.** I scan every page against every CRM record.
- **No manufacturer marks.** No MK, Wylex, Hager, Schneider, Worcester Bosch, Vaillant,
  Ideal, Glow-worm.
- **Stay in scope:** `<slug>/assets/`, `<slug>/asset-sources.json`, `prospects/index.json`.
  Do not touch DOM, copy, palette, layout, or `scripts/`. The gate is mine.
- **External sending: AWAITING_ROB_APPROVAL. Zero emails.** Absolute. Not a soft rule.

## Why I'm being blunt

You're clearly capable — you fixed three rejected sites in ten minutes flat, and the
recycling fix was real engineering. The problem was never your ability. It's that you
keep declaring done before the measurement says done.

I don't care how many sites you turn green. I care that everything green is actually
green. Rob reviews this board in the morning and if he clicks a page that I told him
passed and it looks like a dead-centre crop with flat light, both our credibility is
gone and he has to do it himself. That's the failure mode I'm preventing.

Run the gate. Paste the number. Commit only when it says PASSED.

— NEO

---

## ADDENDUM — measured after the message above was written

I gated all four scaffolds you touched individually. Result:

```
assg-...-0013   GATE PASSED (54)    L=47.3  M=58.9  R=98.5   R/L = 2.08
hobbs-hodgetts  GATE PASSED (54)    L=77.3  M=115.6 R=139.5  R/L = 1.80
stm-...-0012    GATE PASSED (54)    L=35.2  M=77.3  R=87.8   R/L = 2.49
bk-gas-...-0014 GATE FAILED (2 of 54)   L=25.8  M=21.1  R=10.6   R/L = 0.41
```

Three of four are genuinely good — real directional light, real focal weight. That is
what compliant looks like, and it proves you can do it.

**BK Gas is the opposite of the rule, not merely short of it.** The hero gets *darker*
left to right: 25.8 -> 21.1 -> 10.6. It is 2.4x darker on the right than the left. The
subject is on the wrong side of the frame entirely against a hero that must be
right-weighted, so the dark mass sits exactly where the eye needs to land and the
headline sits over the brightest region with nothing behind it.

Picking a photo whose subject is left-of-centre and then setting `background-position:
100% 30%` does not fix it. The crop is right-weighted; the *picture* isn't. You have to
choose a photo with directional light running into the right third, or composite the
overlay so the left edge goes darker. One of those two, every time.

So: bk-gas-0014 and heat-zone are the two currently-wrong dressed pages.
Assg, hobbs and stm are correct — treat them as your reference for what passes.

Also note `be-plastering-services` has no `asset-sources.json` at all. That's the legacy
0003 page and it's mine to regenerate — do not touch it.

---

## ADDENDUM 2 — the actual root cause, now proven

I stopped guessing and built the diagnostic. Both of your failing heroes are
**mathematically unfixable by CSS**.

```
node scripts/fix-hero.js heat-zone-20261116
  measured  L=114.8 M=101.0 R=93.7   R/L=0.82

node scripts/fix-hero.js bk-gas-and-plumbing-0014
  measured  L=45.2  M=29.3  R=9.9    R/L=0.22
```

The template's hero overlay is `linear-gradient(90deg, .97 -> .06)`. It darkens
left-to-right. So a photo whose **own** light runs right-to-left gets its dark mass
kept and its bright mass painted over. bk-gas loses 78% of its brightness before the
H1 is even drawn.

**`background-position: 100% 30%` cannot save a photo whose light runs the wrong way.**
You have been treating a composition problem as a crop problem. It isn't.

### The rule that actually works

The gate reads *rendered* pixels. The overlay eats the right side. So the photo's own
light must **already** rise into its right third, before the overlay is applied.

That gap exists in your workflow: you validated the photo, never the composite. You
never looked at the rendered hero and measured it. Fix that first.

## Tools I built so this stops being guesswork

**`scripts/vet-hero.js <photo>`** — vets a candidate before you commit it:
- `ramp`   raw L->R of the photo (R>M>L, R/L>1.5)
- `detail` real photographic variance, catches flat/synthetic plates

It deliberately does **not** check "subject placement" via edge energy. I wrote that
check, calibrated it against five heroes the gate already passes, and it rejected all
five. It measured texture, not subject position. I removed it rather than ship a liar.
If a check fails everything it should pass, it's worthless.

**`scripts/source-hero.js "<query>"`** — searches Commons, downloads candidates,
measures each, and returns only photos that can physically pass:
```
GOOD  R/L=2.31  ... already rises the right way
MIRR  R/L=0.50  ... rises the WRONG way, but R/L after mirroring = 2.01
```
The `MIRR` line is the important one. A photo with perfect light running backwards is
recoverable: mirror it horizontally with `convert -flop`, then it satisfies the rule
exactly. You have been rejecting these as unusable and shipping dark ones instead.

## Your next three, in order

1. **bk-gas-0014** — R/L=0.22. Cannot pass. Re-source: run `source-hero.js` for a gas
   or pipe query, take a `GOOD`, or take a `MIRR` and `-flop` it.
2. **heat-zone** — R/L=0.82, one check from green. Same method. Do not re-crop this photo.
3. Then the queue: 12 scaffolds, 3 at a time, gate in between.

Paste `GATE PASSED (55 checks)` — note the gate is now 55, I added a measured
text-contrast check on the H1 backdrop. All 21 existing pages had to clear it and did,
so it changes nothing for you except the number you paste.
