import { useCallback, useRef, useState } from 'react'

/**
 * Hook for recording audio and transcribing it via the transcription API.
 */
export function useAudioRecorder() {
  const [isRecording, setIsRecording] = useState(false)
  const [isTranscribing, setIsTranscribing] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus',
      })
      mediaRecorderRef.current = mediaRecorder
      chunksRef.current = []

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data)
        }
      }

      mediaRecorder.start()
      setIsRecording(true)
    } catch (error) {
      console.error('Failed to start recording:', error)
      alert('Could not access microphone. Please check permissions.')
    }
  }, [])

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current
      if (!mediaRecorder) {
        resolve(null)
        return
      }

      mediaRecorder.onstop = async () => {
        setIsRecording(false)
        setIsTranscribing(true)

        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' })

        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach((track) => track.stop())

        try {
          const formData = new FormData()
          formData.append(
            'audio',
            new File([audioBlob], 'recording.webm', { type: 'audio/webm' }),
          )
          formData.append('model', 'whisper-1')

          const response = await fetch('/api/transcription', {
            method: 'POST',
            body: formData,
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.error || 'Transcription failed')
          }

          const result = await response.json()
          setIsTranscribing(false)
          resolve(result.text || null)
        } catch (error) {
          console.error('Transcription error:', error)
          setIsTranscribing(false)
          resolve(null)
        }
      }

      mediaRecorder.stop()
    })
  }, [])

  return { isRecording, isTranscribing, startRecording, stopRecording }
}
