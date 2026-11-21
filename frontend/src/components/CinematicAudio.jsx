import { useEffect, useState } from 'react'
import { Music, Volume2, VolumeX } from 'lucide-react'
import { createCinematicAudio } from '../utils/cinematicAudio'

// Music stays unconfigured until an approved asset and licence are committed.
export function useCinematicAudio(root) {
  const [controller, setController] = useState(null)
  const [enabled, setEnabled] = useState(false)
  useEffect(() => {
    const audio = createCinematicAudio()
    setController(audio)
    const hide = () => { if (document.hidden) { audio.pause(); setEnabled(false) } }
    document.addEventListener('visibilitychange', hide)
    const scene = root.current?.querySelector('.cinema-story-intro')
    let reached = false
    const observer = scene && typeof IntersectionObserver === 'function' ? new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !reached) { reached = true; audio.feedback('scene') }
    }, { threshold: 0.3 }) : null
    if (observer) observer.observe(scene)
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', hide); audio.dispose() }
  }, [root])
  return { feedback: (kind) => controller?.feedback(kind), enabled,
    toggle: async () => { if (controller) setEnabled(await controller.setEnabled(!enabled)) } }
}

export default function CinematicAudio({ audio }) {
  return <div className="cinema-audio-controls" aria-label="Optional homepage audio">
    <button type="button" onClick={audio.toggle} aria-pressed={audio.enabled} aria-label={audio.enabled ? 'Disable sound effects' : 'Enable sound effects'}>{audio.enabled ? <Volume2 size={17} /> : <VolumeX size={17} />}<span>Sound {audio.enabled ? 'on' : 'off'}</span></button>
    <button type="button" disabled aria-describedby="cinema-music-note"><Music size={17} />Music unavailable</button>
    <span id="cinema-music-note">Music awaits an approved audio asset.</span>
  </div>
}
