// Music is loaded only after an explicit gesture and only when an approved URL is supplied.
export function createCinematicAudio({ Context = globalThis.AudioContext || globalThis.webkitAudioContext,
  AudioElement = globalThis.Audio, musicUrl = '', saveData = globalThis.navigator?.connection?.saveData,
  now = () => Date.now(), schedule = setInterval, cancel = clearInterval } = {}) {
  let context, master, music, fade, enabled = false, hidden = false, disposed = false, lastTone = -Infinity, generation = 0, enableGeneration = 0
  const stopFade = () => { if (fade != null) cancel(fade); fade = null }
  const rampMusic = (target, onEnd) => {
    stopFade()
    if (!music) return
    fade = schedule(() => {
      const step = 0.01
      music.volume = Math.max(0, Math.min(0.1, music.volume + (target > music.volume ? step : -step)))
      if (Math.abs(music.volume - target) < 0.001) { music.volume = target; stopFade(); onEnd?.() }
    }, 40)
  }
  const startMusic = () => {
    if (!musicUrl || !AudioElement || hidden || saveData) return
    if (!music) { music = new AudioElement(musicUrl); music.loop = true; music.volume = 0; music.preload = 'none' }
    const request = generation
    Promise.resolve(music.play()).then(() => {
      if (disposed || !enabled || hidden) { music.pause(); return }
      if (request !== generation) return
      rampMusic(0.1)
    }).catch((error) => console.warn('FoodNova background music could not play:', error))
  }
  const setEnabled = async (value) => {
    if (disposed) return false
    ++generation
    const request = ++enableGeneration
    enabled = !!value
    if (!enabled) {
      if (master && context) master.gain.setTargetAtTime(0, context.currentTime, 0.03)
      rampMusic(0, () => music?.pause())
      return false
    }
    if (!Context) { enabled = false; return false }
    try {
      if (!context) { context = new Context(); master = context.createGain(); master.gain.value = 0; master.connect(context.destination) }
      const resumed = context.resume()
      startMusic()
      await resumed
      if (disposed || !enabled || request !== enableGeneration) return false
      master.gain.setTargetAtTime(0.15, context.currentTime, 0.08)
      return true
    } catch (error) {
      if (request === enableGeneration) { enabled = false; music?.pause() }
      console.warn('FoodNova audio could not be enabled:', error)
      return false
    }
  }
  return {
    setEnabled,
    feedback(kind = 'cta') {
      if (!enabled || hidden || disposed || !context || context.state !== 'running' || now() - lastTone < 900) return
      lastTone = now()
      const oscillator = context.createOscillator(), gain = context.createGain()
      oscillator.type = 'sine'; oscillator.frequency.value = kind === 'cart' ? 660 : kind === 'scene' ? 262 : 440
      gain.gain.setValueAtTime(0, context.currentTime)
      gain.gain.linearRampToValueAtTime(kind === 'scene' ? 0.08 : 0.2, context.currentTime + 0.025)
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.18)
      oscillator.connect(gain); gain.connect(master)
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect() }
      oscillator.start(); oscillator.stop(context.currentTime + 0.2)
    },
    setHidden(value) {
      hidden = value
      ++generation
      if (hidden) {
        stopFade()
        if (music) { music.pause(); music.volume = 0 }
        context?.suspend().catch((error) => console.warn('FoodNova audio could not be suspended:', error))
      } else if (enabled && !disposed) {
        context?.resume().catch((error) => console.warn('FoodNova audio could not resume:', error))
        startMusic()
      }
    },
    dispose() {
      disposed = true; enabled = false; ++generation; ++enableGeneration; stopFade()
      if (music) { music.pause(); music.removeAttribute('src'); music.load() }
      context?.close().catch((error) => console.warn('FoodNova audio could not close:', error))
    },
  }
}
