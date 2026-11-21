import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { createCinematicAudio } from '../utils/cinematicAudio'

const AudioContext = createContext(null)
const preferenceKey = 'foodnova_sound_preference'
const musicUrl = import.meta.env.VITE_SIGNATURE_MUSIC_PRESENT
  ? `${import.meta.env.BASE_URL}audio/foodnova-signature-lounge.mp3` : ''

const getInteractionKind = (event) => {
  const element = event.target instanceof Element ? event.target : event.target?.parentElement
  if (!element) return ''
  const interactive = element.closest('a[href], button, [role="button"], [tabindex="0"]')
  if (!interactive || interactive.closest('[aria-disabled="true"]') || interactive.matches(':disabled')) return ''
  const soundTarget = element.closest('[data-sound]') || interactive
  const behavior = soundTarget.dataset.sound
  if (behavior === 'silent' || behavior === 'defer') return ''
  return behavior === 'select' ? 'select' : 'click'
}

export function CinematicAudioProvider({ children }) {
  const controller = useRef(null)
  const enabledRef = useRef(false)
  const preferenceRef = useRef(false)
  const restoredRef = useRef(false)
  const toggleRequest = useRef(0)
  const [enabled, setEnabled] = useState(false)

  const changeEnabled = useCallback(async (value, persist = true) => {
    const audio = controller.current
    if (!audio) return false
    const next = Boolean(value)
    const request = ++toggleRequest.current
    enabledRef.current = next
    setEnabled(next)
    if (persist) {
      preferenceRef.current = next
      try {
        localStorage.setItem(preferenceKey, String(next))
      } catch {
        // Audio can still be enabled when preferences are unavailable.
      }
    }
    const actual = await audio.setEnabled(next)
    if (controller.current === audio && toggleRequest.current === request) {
      enabledRef.current = actual
      setEnabled(actual)
      if (!actual) {
        preferenceRef.current = false
        try {
          localStorage.setItem(preferenceKey, 'false')
        } catch {
          // Keep the current session usable when storage is unavailable.
        }
      }
    }
    return actual
  }, [])

  const toggle = useCallback(() => changeEnabled(!enabledRef.current), [changeEnabled])

  useEffect(() => {
    const audio = createCinematicAudio({ musicUrl })
    controller.current = audio
    try {
      preferenceRef.current = localStorage.getItem(preferenceKey) === 'true'
    } catch {
      preferenceRef.current = false
    }

    const restorePreference = (event) => {
      if (restoredRef.current) return
      restoredRef.current = true
      window.removeEventListener('pointerdown', restorePreference, true)
      window.removeEventListener('keydown', restorePreference, true)
      if (preferenceRef.current && !event.target?.closest?.('[data-sound-control]')) {
        void changeEnabled(true, false)
      }
    }
    const handleClick = (event) => {
      if (!window.location.pathname.startsWith('/admin')) {
        const kind = getInteractionKind(event)
        if (kind) audio.feedback(kind)
      }
    }
    const handleKeydown = (event) => {
      if (!['Enter', ' '].includes(event.key) || window.location.pathname.startsWith('/admin')) return
      const target = event.target
      if (!(target instanceof Element) || !target.matches('[data-sound="select"][tabindex="0"]')) return
      if (target.matches('a, button, input, select, textarea')) return
      audio.feedback('select')
    }
    const visibility = () => audio.setHidden(document.hidden)
    window.addEventListener('pointerdown', restorePreference, true)
    window.addEventListener('keydown', restorePreference, true)
    document.addEventListener('click', handleClick, true)
    document.addEventListener('keydown', handleKeydown)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      window.removeEventListener('pointerdown', restorePreference, true)
      window.removeEventListener('keydown', restorePreference, true)
      document.removeEventListener('click', handleClick, true)
      document.removeEventListener('keydown', handleKeydown)
      document.removeEventListener('visibilitychange', visibility)
      controller.current = null
      enabledRef.current = false
      audio.dispose()
    }
  }, [changeEnabled])

  const value = {
    enabled,
    toggle,
    feedback: (kind) => controller.current?.feedback(kind),
  }
  return <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
}

export function useCinematicAudio() {
  const audio = useContext(AudioContext)
  if (!audio) throw new Error('useCinematicAudio must be used within CinematicAudioProvider')
  return audio
}

export default function CinematicAudio({ audio }) {
  const label = audio.enabled ? 'Mute Sound' : 'Enable Sound'
  return <button className="cinema-audio-control" type="button" onClick={audio.toggle}
    data-sound-control="true" data-sound="silent" aria-pressed={audio.enabled} aria-label={label} title={label}>
    {audio.enabled ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
  </button>
}
