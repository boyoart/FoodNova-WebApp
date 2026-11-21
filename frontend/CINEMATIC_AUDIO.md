# FoodNova website audio

The public storefront uses one audio provider and one floating speaker control
across routes. Sound is off on first visit. After a visitor enables it, the
preference is saved; a returning visitor's first gesture restores audio to
respect browser autoplay restrictions. Muting stops active effects and music.
The control is keyboard accessible and is not shown on Admin routes.

One delegated interaction handler plays short synthesized click and product
selection effects. Add-to-cart controls defer their sound until the cart store
confirms the item was added, so failed actions remain silent. Effects are
prioritized to avoid competing tones.

The checkout currently places bank-transfer orders before payment is verified.
That response is remembered by order ID. The order-success sound is played once
only after an authoritative order response reports `payment_status` as
`payment_confirmed`, `confirmed`, or `paid`, and the order is not cancelled.
Pending and rejected payments do not trigger it. The played marker is persisted
to prevent polling, remounts, or refreshes from replaying the success sound.

No background track is bundled in `public/audio/foodnova-signature-lounge.mp3`,
and no commercial-use authorization is documented in the repository. Music
therefore remains disabled; Vite checks for the asset at build time and does not
request it when absent. Add the authorized original recording and document its
rights before enabling it. When present, music starts only after opt-in, loops
at 10% volume, fades on mute, pauses when the tab is hidden, and ducks during
order confirmation. Browser volume support varies, particularly on iOS Safari.
