const soundProfiles = {
  click: { priority: 1, cooldown: 55, notes: [{ frequency: 880, duration: 0.06, volume: 0.075 }] },
  select: { priority: 2, cooldown: 90, notes: [{ frequency: 740, duration: 0.105, volume: 0.09 }] },
  cart: {
    priority: 3,
    cooldown: 180,
    notes: [
      { frequency: 659.25, offset: 0, duration: 0.15, volume: 0.11 },
      { frequency: 880, offset: 0.095, duration: 0.18, volume: 0.105 },
    ],
  },
  order: {
    priority: 4,
    cooldown: 1200,
    notes: [
      { frequency: 523.25, offset: 0, duration: 0.37, volume: 0.15 },
      { frequency: 659.25, offset: 0.22, duration: 0.37, volume: 0.15 },
      { frequency: 783.99, offset: 0.44, duration: 0.37, volume: 0.15 },
      { frequency: 1046.5, offset: 0.66, duration: 0.4, volume: 0.16 },
      { frequency: 1567.98, offset: 0.91, duration: 0.32, volume: 0.035, type: 'triangle' },
    ],
  },
}

export function createCinematicAudio({
  Context = globalThis.AudioContext || globalThis.webkitAudioContext,
  AudioElement = globalThis.Audio,
  musicUrl = '',
  saveData = globalThis.navigator?.connection?.saveData,
  now = () => Date.now(),
  schedule = setInterval,
  cancel = clearInterval,
} = {}) {
  let context
  let master
  let music
  let fade
  let enabled = false
  let hidden = false
  let disposed = false
  let generation = 0
  let enableGeneration = 0
  const activeGroups = new Set()
  const lastPlayed = new Map()

  const stopFade = () => {
    if (fade != null) cancel(fade)
    fade = null
  }

  const rampMusic = (target, onEnd) => {
    stopFade()
    if (!music) return
    const destination = Math.max(0, Math.min(0.1, target))
    fade = schedule(() => {
      const difference = destination - music.volume
      if (Math.abs(difference) <= 0.005) {
        music.volume = destination
        stopFade()
        onEnd?.()
        return
      }
      music.volume = Math.max(0, Math.min(0.1, music.volume + Math.sign(difference) * 0.005))
    }, 25)
  }

  const startMusic = () => {
    if (!musicUrl || !AudioElement || hidden || saveData) return
    try {
      if (!music) {
        music = new AudioElement(musicUrl)
        music.loop = true
        music.volume = 0
        music.preload = 'none'
      }
      const request = generation
      Promise.resolve(music.play()).then(() => {
        if (disposed || !enabled || hidden) {
          music.pause()
          return
        }
        if (request !== generation) return
        rampMusic(0.1)
      }).catch((error) => console.warn('FoodNova background music could not play:', error))
    } catch (error) {
      console.warn('FoodNova background music could not play:', error)
    }
  }

  const stopGroup = (group) => {
    if (group.stopped) return
    group.stopped = true
    activeGroups.delete(group)
    for (const oscillator of group.oscillators) {
      try {
        oscillator.stop()
      } catch {
        // An oscillator may already have ended.
      }
    }
  }

  const stopVoices = () => {
    for (const group of activeGroups) stopGroup(group)
  }

  const setEnabled = async (value) => {
    if (disposed) return false
    ++generation
    const request = ++enableGeneration
    enabled = Boolean(value)
    if (!enabled) {
      stopVoices()
      if (master && context) master.gain.setTargetAtTime(0, context.currentTime, 0.02)
      rampMusic(0, () => music?.pause())
      return false
    }
    if (!Context) {
      enabled = false
      return false
    }
    try {
      if (!context) {
        context = new Context()
        master = context.createGain()
        master.gain.value = 0
        master.connect(context.destination)
      }
      const resumed = context.resume()
      startMusic()
      await resumed
      if (disposed || !enabled || request !== enableGeneration) return false
      master.gain.setTargetAtTime(1, context.currentTime, 0.04)
      return true
    } catch (error) {
      if (request === enableGeneration) {
        enabled = false
        stopVoices()
        music?.pause()
      }
      console.warn('FoodNova audio could not be enabled:', error)
      return false
    }
  }

  const feedback = (kind = 'click') => {
    const profile = soundProfiles[kind] || soundProfiles.click
    if (!enabled || hidden || disposed || !context || context.state !== 'running') return false
    if (now() - (lastPlayed.get(kind) ?? -Infinity) < profile.cooldown) return false
    if ([...activeGroups].some((group) => group.priority > profile.priority)) return false

    lastPlayed.set(kind, now())
    for (const group of [...activeGroups]) stopGroup(group)

    try {
      const start = context.currentTime
      const group = { priority: profile.priority, oscillators: [], remaining: profile.notes.length, stopped: false }
      activeGroups.add(group)
      if (kind === 'order') rampMusic(0.025)
      profile.notes.forEach((note, index) => {
        const oscillator = context.createOscillator()
        const envelope = context.createGain()
        const noteStart = start + (note.offset || 0)
        const noteEnd = noteStart + note.duration
        oscillator.type = note.type || 'sine'
        oscillator.frequency.setValueAtTime(note.frequency, noteStart)
        envelope.gain.setValueAtTime(0, noteStart)
        envelope.gain.linearRampToValueAtTime(note.volume, noteStart + 0.012)
        envelope.gain.exponentialRampToValueAtTime(0.0001, noteEnd)
        oscillator.connect(envelope)
        envelope.connect(master)
        oscillator.onended = () => {
          oscillator.disconnect()
          envelope.disconnect()
          group.remaining -= 1
          if (group.remaining === 0) {
            activeGroups.delete(group)
            if (kind === 'order' && enabled && !hidden && !disposed) rampMusic(0.1)
          }
        }
        group.oscillators.push(oscillator)
        oscillator.start(noteStart)
        oscillator.stop(noteEnd)
        if (index === profile.notes.length - 1) group.lastOscillator = oscillator
      })
      return true
    } catch (error) {
      console.warn('FoodNova interaction sound could not play:', error)
      return false
    }
  }

  return {
    setEnabled,
    feedback,
    setHidden(value) {
      hidden = Boolean(value)
      ++generation
      if (hidden) {
        stopFade()
        stopVoices()
        if (music) {
          music.pause()
          music.volume = 0
        }
        context?.suspend().catch((error) => console.warn('FoodNova audio could not be suspended:', error))
      } else if (enabled && !disposed) {
        context?.resume().catch((error) => console.warn('FoodNova audio could not resume:', error))
        startMusic()
      }
    },
    dispose() {
      disposed = true
      enabled = false
      ++generation
      ++enableGeneration
      stopFade()
      stopVoices()
      if (music) {
        music.pause()
        music.removeAttribute('src')
        music.load()
      }
      context?.close().catch((error) => console.warn('FoodNova audio could not close:', error))
    },
  }
}
