import { useCallback, useRef, useState } from 'react'

/**
 * Hook for text-to-speech playback via the TTS API.
 */
export function useTTS() {
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const speak = useCallback(async (text: string, id: string) => {
    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }

    setPlayingId(id)

    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          voice: 'nova',
          model: 'tts-1',
          format: 'mp3',
        }),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'TTS failed')
      }

      const result = await response.json()

      // Convert base64 to audio and play
      const audioData = atob(result.audio)
      const bytes = new Uint8Array(audioData.length)
      for (let i = 0; i < audioData.length; i++) {
        bytes[i] = audioData.charCodeAt(i)
      }
      const blob = new Blob([bytes], { type: result.contentType })
      const url = URL.createObjectURL(blob)

      const audio = new Audio(url)
      audioRef.current = audio

      audio.onended = () => {
        URL.revokeObjectURL(url)
        setPlayingId(null)
        audioRef.current = null
      }

      audio.onerror = () => {
        URL.revokeObjectURL(url)
        setPlayingId(null)
        audioRef.current = null
      }

      await audio.play()
    } catch (error) {
      console.error('TTS error:', error)
      setPlayingId(null)
    }
  }, [])

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause()
      audioRef.current = null
    }
    setPlayingId(null)
  }, [])

  return { playingId, speak, stop }
}
