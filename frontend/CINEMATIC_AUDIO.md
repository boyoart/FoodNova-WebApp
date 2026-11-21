# Cinematic homepage audio

The homepage starts muted and creates an audio context only when the visitor
selects **Enable Sound**. Original synthesized tones accompany selected
homepage actions. The control is not shown on checkout or other routes.
Audio is muted when leaving the homepage or refreshing; a new gesture is
required to enable it again. Hiding the tab suspends audio and returning
resumes only a previously enabled session, subject to browser restrictions.

**FoodNova Signature Lounge has not been supplied.** No music is included in
this release. When the original, authorized recording is ready, add it as
`public/audio/foodnova-signature-lounge.mp3`, document its ownership and
permissions, and rebuild or restart Vite. At build/start time Vite detects
whether that file exists; without it the page does not request music. Adding
the file to an already built deployment alone does not enable it.

The existing audio controller creates the music element only on the enable
gesture, sets looping and fades to a 10% volume, subject to browser support
(notably iOS Safari can ignore programmatic media volume). It pauses when the
tab is hidden, resumes only after a prior opt-in, and skips music on Save-Data
connections. A failed or unsupported recording leaves interaction effects
available. Loop quality and actual playback must be tested with the supplied
recording, including real mobile Safari; setting `loop` does not guarantee a
gapless or seamless track.
