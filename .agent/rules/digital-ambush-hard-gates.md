# Digital Ambush Hard Execution Rules

- **Rule 1 — Pre-Flight Hero Vetting (`vet-hero.js` / `source-hero.js`):** Never place a hero image into `<slug>/assets/` until it passes directional luminance (`R > M > L`, `R/L > 1.5`). If a strong trade shot has light running left-to-right (`MIRR`), mirror it (`-flop`) before cropping.
- **Rule 2 — Zero Image Recycling (`global-registry.json`):** Never reuse the same photo or SHA-256 hash across two different prospects. Every prospect must have unique, trade-matched photography.
- **Rule 3 — Hard Rendered-DOM Gate (`gate2.js`):** Before every commit, run `node scripts/gate2.js <slug>/index.html --registry scripts/global-registry.json` against the rendered DOM. If exit code != `0`, you are **strictly forbidden** from committing or stamping a `VR-` receipt.
- **Rule 4 — Strict Batching & Scope Lock (3 at a Time):** Process strictly **3 sites per batch**. Never run repo-wide cosmetic sweeps or modify files outside `<slug>/assets/`, `<slug>/asset-sources.json`, and `prospects/index.json` unless explicitly ordered.
- **Rule 5 — Outbound Hold:** Never send or draft outbound prospect emails without explicit Founder approval.
