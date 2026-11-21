# Cinematic homepage audio

The homepage starts muted and creates an audio context only when the visitor
selects **Enable Sound**. Original synthesized tones accompany selected
homepage actions. The control is not shown on checkout or other routes.
Audio is muted when leaving the homepage or refreshing; a new gesture is
required to enable it again. Hiding the tab suspends audio and returning
resumes only a previously enabled session, subject to browser restrictions.

Background music is pending. No third-party track is distributed or loaded:
the available candidates have not been verified as suitable for the requested
relaxed direction and website self-hosting. Before configuring a track,
verify and document the specific recording's commercial-use, self-hosting,
adaptation and redistribution permissions, retain the source and license
evidence, add any required public attribution, and test the loop. The
controller supports a licensed `musicUrl`, lazy playback on the enable
gesture, looping, fades and Save-Data suppression.
