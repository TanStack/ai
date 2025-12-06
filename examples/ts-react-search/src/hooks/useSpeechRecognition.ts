// This one is vibe-coded for a quick demo purpose - use it at your own risk :)
import { useEffect, useRef, useState } from 'react'

type UseSpeechRecognitionOptions = {
  lang?: string
  continuous?: boolean
  interimResults?: boolean
}

export const useSpeechRecognition = (options?: UseSpeechRecognitionOptions) => {
  const [listening, setListening] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [error, setError] = useState<string | null>(null)

  const recognitionRef = useRef<SpeechRecognition | null>(null)

  useEffect(() => {
    const SpeechRecognitionCtor =
      window.SpeechRecognition || window.webkitSpeechRecognition

    if (!SpeechRecognitionCtor) {
      setError('SpeechRecognition is not supported in this browser.')
      return
    }

    const recognition = new SpeechRecognitionCtor()
    recognition.lang = options?.lang ?? 'en-US'
    recognition.continuous = options?.continuous ?? false
    recognition.interimResults = options?.interimResults ?? false

    recognition.onstart = () => {
      setListening(true)
      setError(null)
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognition.onerror = (event) => {
      setError(event.error)
      setListening(false)
    }

    recognition.onresult = (event) => {
      let finalTranscript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i]
        if (res.isFinal) {
          finalTranscript += res[0].transcript
        }
      }

      if (finalTranscript) {
        setTranscript((prev) =>
          prev
            ? `${prev.trim()} ${finalTranscript.trim()}`
            : finalTranscript.trim(),
        )
      }
    }

    recognitionRef.current = recognition

    return () => {
      recognition.onstart = null
      recognition.onend = null
      recognition.onerror = null
      recognition.onresult = null
      recognitionRef.current?.abort()
      recognitionRef.current = null
    }
  }, [options?.lang, options?.continuous, options?.interimResults])

  const startListening = () => {
    setTranscript('')
    setError(null)
    recognitionRef.current?.start()
  }

  const stopListening = () => {
    recognitionRef.current?.stop()
  }

  return {
    listening,
    transcript,
    error,
    startListening,
    stopListening,
  }
}
