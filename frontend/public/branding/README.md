# Official FoodNova branding

`foodnova-logo.png` is the exact approved transparent PNG uploaded on 16 November 2026 (828 x 394). Do not redraw, recolour, crop, or stretch it.

SHA-256: `8593ab0f4268bba0149525b078dc0b8273ecb9ca19e2a4f233b391dd9f098f7d`.

Web branding uses the shared `BrandLogo` component. A light surface provides contrast in dark headers without modifying the artwork. This file is authoritative; run `scripts/sync_branding_assets.ps1` to copy identical bytes into the existing customer Flutter and dispatch Expo logo asset paths. Their logo widgets preserve the full artwork. Native launcher icons/splashes remain separate platform assets; a landscape wordmark should not silently replace square launcher icons.

Mobile source/assets were updated only. Mobile builds, packaging, store submission and deployment require a separate release workflow and were not performed.
