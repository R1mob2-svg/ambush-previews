# preview-gate.js - founder-locked preview checks

Rob, 2026-11-16: "I see repeated images and the hero image isnt good enough it
should have the focal point on the right hand side and also the company name at
the top of the hero section in bigger font."

Run BEFORE publishing any Digital Ambush preview:

    node scripts/preview-gate.js <index.html> [liveUrl]

Requires a sibling `asset-sources.json` mapping every image filename to the
ORIGIN photo it came from, e.g.

    { "HERO.jpg": "commons:Some_photo.jpg", "CARD1.jpg": "commons:Other.jpg" }

Hard failures:
- any image file used in 2+ slots
- any ORIGIN photo feeding 2+ slots (two crops of one photo == repeated image)
- asset-sources.json missing
- hero wordmark absent or < 0.9x the H1 font size
- hero focal point not right-weighted (luminance must rise L->M->R)
- js errors / http errors / broken images / horizontal overflow at 1440 and 390
