# Founder V3 — preview-visual release receipt, 2026-11-20

## Scope
Changes pushed **directly to main**, without a review PR or external outreach sends. Existing 89 published `*/index.html` preview pages received the V3 full-bleed hero and service-card treatment. This does **not** mean 89 prospects qualify for email; CRM eligibility remains a separate sender lock. An independent inspection of 2026-11-20 canonical `cloudmaker-prospect-crm/prospects/index.json` found 191 records, 21 with a valid public email and phone using the queried fields, but authoritative eligibility and DNC gates still control dispatch.

## Source fixes
- `founder-visual-v3.css`: responsive, continuous full-bleed subject-weighted hero with soft left gradient; company name larger than subheading; accent-to-white gradient from each business's configured colour. Mobile/tablet do NOT detach the photograph into a separate full-width image above the H1. Service images retain cover-crop, reduced brightness and card text over a bottom scrim. Focal image remains legible.
- `scripts/founder-visual-v3.cjs`: idempotent, zero-network, deterministic transformation of generated pages; generic service headings are replaced by specific trade names only when evidence exists in the page's own headings. False generic architectural/steel claims corrected where source evidence supports it. It does not fabricate company reviews, credentials or external customer sends.
- `scripts/compile-golden.js`: now applies the same V3 transformation to *future* site builds BEFORE writing output; fails closed if the required V3 hero/image asset is missing. Locked Golden Master template hash remains unchanged.
- `scripts/gate2.js`: checks the PHOTO layer of the computed `background-position` when a gradient overlay is the first background layer. It still requires a right-weighted focal X between 68% and 100%; all other image/contrast/viewport/source QA gates retained.
- Site-specific repairs: A.B Plastering mobile hero and claims, RSO Developments dark hero plus truthful interior refurbishment photo and corrected footer phone number, Visionary Builders and SAB Builders landscaping card descriptions/images.
- SAB paving/decking already used Wikimedia Commons photos and retained source and license credits. RSO interior renovation photo is attributed in the page footer.

## Independent checks performed
- GitHub `compare_commits` confirmed **89/89** distinct published `*/index.html` files changed during rollout.
- Fetched **8 sample site pages** and verified V3 stylesheet, per-page actual hero asset, source-specific headline and no generic H1 carry-over.
- Executed the **actual committed V3 transformer function**: it recompiled a stripped original fixture and was idempotent against the already-corrected page. No network/provider calls.
- Executed the **actual committed Gate 2 photo focal check** with 6 cases: dual-layer 74% true, right true, 60% false, centre false, 95% true, 120% false; **6/6 pass**.
- Verified RSO visible footer number and tel URI match, the two SAB service-image source URLs are service-relevant, and V3 CSS includes phone/tablet/desktop rules.
- Verified source and authors/licenses of replaced RSO interior renovation and the two SAB landscaping photographs against Wikimedia Commons.

## Unverified / not claimed
- The GitHub Pages published URL was not accessible through the model's web/browser tools. **No full live Chromium screenshot run or final full visual QA of all 89 pages was possible from this connector environment**.
- No per-prospect image-semantic vision audit of every card has been performed; a source/metadata check does not prove photograph content for all cards.
- Not a proof of email deliverability, screenshot availability in Zoho, or Gate2 55/55 (or other total) on every published preview.

## Outbound & CRM
External prospect sending remains HOLD; nothing sent or drafted as part of this repair. The separate GeminX backend email screen now explicitly disables a non-verified prospect's HTML preview instead of silently returning; it retains the actual sender HTML, snapshot image load checks, digest checks, Desktop/Tablet/Mobile frame widths, Founder approval and sent-folder receipts. No synthetic customer email.

## Final status
**[IMPLEMENTED + MECHANICALLY PROVEN SOURCE CHECKS]. Full live visual/render certification remains unverified.** Keep email send disabled pending exact CRM and QA records, real snapshot and Founder approval.
