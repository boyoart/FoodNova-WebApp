import { useEffect, useRef, useState } from 'react'
import { Volume2, VolumeX } from 'lucide-react'
import { createCinematicAudio } from '../utils/cinematicAudio'

const musicUrl = import.meta.env.VITE_SIGNATURE_MUSIC_PRESENT
  ? `${import.meta.env.BASE_URL}audio/foodnova-signature-lounge.mp3` : ''

export function useCinematicAudio() {
  const controller = useRef(null)
  const enabledRef = useRef(false)
  const toggleRequest = useRef(0)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const audio = createCinematicAudio({ musicUrl })
    controller.current = audio
    const visibility = () => audio.setHidden(document.hidden)
    document.addEventListener('visibilitychange', visibility)
    return () => { document.removeEventListener('visibilitychange', visibility); controller.current = null; enabledRef.current = false; audio.dispose() }
  }, [])
  return {
    feedback: (kind) => controller.current?.feedback(kind),
    enabled,
    toggle: async () => {
      const audio = controller.current
      if (!audio) return
      const next = !enabledRef.current
      const request = ++toggleRequest.current
      enabledRef.current = next
      setEnabled(next)
      const actual = await audio.setEnabled(next)
      if (controller.current === audio && toggleRequest.current === request) { enabledRef.current = actual; setEnabled(actual) }
    },
  }
}

export default function CinematicAudio({ audio }) {
  const label = audio.enabled ? 'Mute Sound' : 'Enable Sound'
  return <button className="cinema-audio-control" type="button" onClick={audio.toggle}
    aria-pressed={audio.enabled} aria-label={label} title={label}>
    {audio.enabled ? <Volume2 size={20} aria-hidden="true" /> : <VolumeX size={20} aria-hidden="true" />}
  </button>
}
