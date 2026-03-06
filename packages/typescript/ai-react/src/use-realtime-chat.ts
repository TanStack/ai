import { useCallback, useEffect, useRef, useState } from 'react'
import { RealtimeClient } from '@tanstack/ai-client'
import type {
  RealtimeMessage,
  RealtimeMode,
  RealtimeStatus,
} from '@tanstack/ai'
import type {
  UseRealtimeChatOptions,
  UseRealtimeChatReturn,
} from './realtime-types'

// Empty frequency data for when client is not connected
const emptyFrequencyData = new Uint8Array(128)
const emptyTimeDomainData = new Uint8Array(128).fill(128)

/**
 * React hook for realtime voice conversations.
 *
 * Provides a simple interface for voice-to-voice AI interactions
 * with support for multiple providers (OpenAI, ElevenLabs, etc.).
 *
 * @param options - Configuration options including adapter and callbacks
 * @returns Hook return value with state and control methods
 *
 * @example
 * ```typescript
 * import { useRealtimeChat } from '@tanstack/ai-react'
 * import { openaiRealtime } from '@tanstack/ai-openai'
 *
 * function VoiceChat() {
 *   const {
 *     status,
 *     mode,
 *     messages,
 *     connect,
 *     disconnect,
 *     inputLevel,
 *     outputLevel,
 *   } = useRealtimeChat({
 *     getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *     adapter: openaiRealtime(),
 *   })
 *
 *   return (
 *     <div>
 *       <p>Status: {status}</p>
 *       <p>Mode: {mode}</p>
 *       <button onClick={status === 'idle' ? connect : disconnect}>
 *         {status === 'idle' ? 'Start' : 'Stop'}
 *       </button>
 *     </div>
 *   )
 * }
 * ```
 */
export function useRealtimeChat(
  options: UseRealtimeChatOptions,
): UseRealtimeChatReturn {
  // State
  const [status, setStatus] = useState<RealtimeStatus>('idle')
  const [mode, setMode] = useState<RealtimeMode>('idle')
  const [messages, setMessages] = useState<Array<RealtimeMessage>>([])
  const [pendingUserTranscript, setPendingUserTranscript] = useState<
    string | null
  >(null)
  const [pendingAssistantTranscript, setPendingAssistantTranscript] = useState<
    string | null
  >(null)
  const [error, setError] = useState<Error | null>(null)
  const [inputLevel, setInputLevel] = useState(0)
  const [outputLevel, setOutputLevel] = useState(0)
  const [vadMode, setVADModeState] = useState<'server' | 'semantic' | 'manual'>(
    options.vadMode ?? 'server',
  )

  // Refs
  const clientRef = useRef<RealtimeClient | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = options
  const animationFrameRef = useRef<number | null>(null)

  // Create client instance - use ref to ensure we reuse the same instance
  // This handles React StrictMode double-rendering
  if (!clientRef.current) {
    clientRef.current = new RealtimeClient({
      getToken: optionsRef.current.getToken,
      adapter: optionsRef.current.adapter,
      tools: optionsRef.current.tools,
      instructions: optionsRef.current.instructions,
      voice: optionsRef.current.voice,
      autoPlayback: optionsRef.current.autoPlayback,
      autoCapture: optionsRef.current.autoCapture,
      vadMode: optionsRef.current.vadMode,
      outputModalities: optionsRef.current.outputModalities,
      temperature: optionsRef.current.temperature,
      maxOutputTokens: optionsRef.current.maxOutputTokens,
      semanticEagerness: optionsRef.current.semanticEagerness,
      onStatusChange: (newStatus) => {
        setStatus(newStatus)
      },
      onModeChange: (newMode) => {
        setMode(newMode)
        optionsRef.current.onModeChange?.(newMode)
      },
      onMessage: (message) => {
        setMessages((prev) => [...prev, message])
        optionsRef.current.onMessage?.(message)
      },
      onError: (err) => {
        setError(err)
        optionsRef.current.onError?.(err)
      },
      onConnect: () => {
        setError(null)
        optionsRef.current.onConnect?.()
      },
      onDisconnect: () => {
        optionsRef.current.onDisconnect?.()
      },
      onInterrupted: () => {
        setPendingAssistantTranscript(null)
        optionsRef.current.onInterrupted?.()
      },
    })

    // Subscribe to state changes for transcripts
    clientRef.current.onStateChange((state) => {
      setPendingUserTranscript(state.pendingUserTranscript)
      setPendingAssistantTranscript(state.pendingAssistantTranscript)
    })
  }

  const client = clientRef.current

  // Audio level animation loop
  useEffect(() => {
    function updateLevels() {
      if (clientRef.current?.audio) {
        setInputLevel(clientRef.current.audio.inputLevel)
        setOutputLevel(clientRef.current.audio.outputLevel)
      }
      animationFrameRef.current = requestAnimationFrame(updateLevels)
    }

    if (status === 'connected') {
      updateLevels()
    }

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
    }
  }, [status])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.destroy()
    }
  }, [])

  // Connection methods
  const connect = useCallback(async () => {
    setError(null)
    setMessages([])
    setPendingUserTranscript(null)
    setPendingAssistantTranscript(null)
    await client.connect()
  }, [client])

  const disconnect = useCallback(async () => {
    await client.disconnect()
  }, [client])

  // Voice control methods
  const startListening = useCallback(() => {
    client.startListening()
  }, [client])

  const stopListening = useCallback(() => {
    client.stopListening()
  }, [client])

  const interrupt = useCallback(() => {
    client.interrupt()
  }, [client])

  // Text input
  const sendText = useCallback(
    (text: string) => {
      client.sendText(text)
    },
    [client],
  )

  // Image input
  const sendImage = useCallback(
    (imageData: string, mimeType: string) => {
      client.sendImage(imageData, mimeType)
    },
    [client],
  )

  // Audio visualization
  const getInputFrequencyData = useCallback(() => {
    return (
      clientRef.current?.audio?.getInputFrequencyData() ?? emptyFrequencyData
    )
  }, [])

  const getOutputFrequencyData = useCallback(() => {
    return (
      clientRef.current?.audio?.getOutputFrequencyData() ?? emptyFrequencyData
    )
  }, [])

  const getInputTimeDomainData = useCallback(() => {
    return (
      clientRef.current?.audio?.getInputTimeDomainData() ?? emptyTimeDomainData
    )
  }, [])

  const getOutputTimeDomainData = useCallback(() => {
    return (
      clientRef.current?.audio?.getOutputTimeDomainData() ?? emptyTimeDomainData
    )
  }, [])

  // VAD mode control
  const setVADMode = useCallback(
    (newMode: 'server' | 'semantic' | 'manual') => {
      setVADModeState(newMode)
      // TODO: Update session config if connected
    },
    [],
  )

  return {
    // Connection state
    status,
    error,
    connect,
    disconnect,

    // Conversation state
    mode,
    messages,
    pendingUserTranscript,
    pendingAssistantTranscript,

    // Voice control
    startListening,
    stopListening,
    interrupt,

    // Text input
    sendText,

    // Image input
    sendImage,

    // Audio visualization
    inputLevel,
    outputLevel,
    getInputFrequencyData,
    getOutputFrequencyData,
    getInputTimeDomainData,
    getOutputTimeDomainData,

    // VAD control
    vadMode,
    setVADMode,
  }
}
