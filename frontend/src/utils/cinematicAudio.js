// Original synthesized tones; no third-party recordings. Never starts without opt-in.
export function createCinematicAudio({ Context = globalThis.AudioContext || globalThis.webkitAudioContext,
  AudioElement = globalThis.Audio, musicUrl = '', now = () => Date.now(), schedule = setInterval, cancel = clearInterval } = {}) {
  let context, master, music, fade, enabled = false, disposed = false, lastTone = -Infinity, musicPlaying = false
  const stopFade = () => { if (fade != null) cancel(fade); fade = null }
  const rampMusic = (target, onEnd) => {
    stopFade()
    if (!music) return
    fade = schedule(() => {
      music.volume = Math.max(0, Math.min(0.12, music.volume + (target > music.volume ? 0.01 : -0.01)))
      if (Math.abs(music.volume - target) < 0.011) { music.volume = target; stopFade(); onEnd?.() }
    }, 40)
  }
  const setEnabled = async (value) => {
    if (disposed) return false
    enabled = !!value
    if (enabled && !Context) { enabled = false; return false }
    if (!enabled) {
      if (master && context) master.gain.setTargetAtTime(0, context.currentTime, 0.08)
      musicPlaying = false; rampMusic(0, () => music?.pause())
      return false
    }
    try {
      if (!context && Context) { context = new Context(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination) }
      await context?.resume()
      if (disposed || !enabled) return false
      master?.gain.setTargetAtTime(0.045, context.currentTime, 0.12)
      return true
    } catch { enabled = false; return false }
  }
  return {
    setEnabled,
    feedback(kind = 'cta') {
      if (!enabled || disposed || !context || context.state !== 'running' || now() - lastTone < 900) return
      lastTone = now()
      const oscillator = context.createOscillator(), gain = context.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = kind === 'cart' ? 660 : kind === 'scene' ? 262 : 440
      gain.gain.setValueAtTime(0, context.currentTime)
      gain.gain.linearRampToValueAtTime(0.4, context.currentTime + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22)
      oscillator.connect(gain); gain.connect(master)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      oscillator.start(); oscillator.stop(context.currentTime + 0.24)
    },
    async toggleMusic() {
      if (!enabled || disposed || !musicUrl || !AudioElement) return false
      try {
        if (!music) { music = new AudioElement(musicUrl); music.loop = true; music.volume = 0; music.preload = 'none' }
        if (musicPlaying) { musicPlaying = false; rampMusic(0, () => music.pause()); return false }
        await music.play()
        if (disposed || !enabled) { music.pause(); return false }
        musicPlaying = true; rampMusic(0.12); return true
      } catch { musicPlaying = false; return false }
    },
    pause() {
      enabled = false; musicPlaying = false; stopFade()
      if (music) { music.volume = 0; music.pause() }
      context?.suspend().catch(() => {})
    },
    dispose() {
      disposed = true; enabled = false; stopFade()
      if (music) { music.pause(); music.removeAttribute('src'); music.load() }
      context?.close().catch(() => {})
    },
  }
}
