import { Conversation } from '@11labs/client'
import type {
  AudioVisualization,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai'
import type { RealtimeAdapter, RealtimeConnection } from '@tanstack/ai-client'
import type { ElevenLabsRealtimeOptions } from './types'

/**
 * Creates an ElevenLabs realtime adapter for client-side use.
 *
 * Wraps the @11labs/client SDK for voice conversations.
 *
 * @param options - Optional configuration
 * @returns A RealtimeAdapter for use with RealtimeClient
 *
 * @example
 * ```typescript
 * import { RealtimeClient } from '@tanstack/ai-client'
 * import { elevenlabsRealtime } from '@tanstack/ai-elevenlabs'
 *
 * const client = new RealtimeClient({
 *   getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *   adapter: elevenlabsRealtime(),
 * })
 * ```
 */
export function elevenlabsRealtime(
  options: ElevenLabsRealtimeOptions = {},
): RealtimeAdapter {
  return {
    provider: 'elevenlabs',

    async connect(token: RealtimeToken): Promise<RealtimeConnection> {
      return createElevenLabsConnection(token, options)
    },
  }
}

/**
 * Creates a connection to ElevenLabs conversational AI
 */
async function createElevenLabsConnection(
  token: RealtimeToken,
  _options: ElevenLabsRealtimeOptions,
): Promise<RealtimeConnection> {
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()
  let conversation: Awaited<ReturnType<typeof Conversation.startSession>> | null = null
  let messageIdCounter = 0

  // Empty arrays for when visualization isn't available
  const emptyFrequencyData = new Uint8Array(128)
  const emptyTimeDomainData = new Uint8Array(128).fill(128)

  // Helper to emit events
  function emit<TEvent extends RealtimeEvent>(
    event: TEvent,
    payload: Parameters<RealtimeEventHandler<TEvent>>[0],
  ) {
    const handlers = eventHandlers.get(event)
    if (handlers) {
      for (const handler of handlers) {
        handler(payload)
      }
    }
  }

  function generateMessageId(): string {
    return `el-msg-${Date.now()}-${++messageIdCounter}`
  }

  // Start the conversation session
  conversation = await Conversation.startSession({
    signedUrl: token.token,

    onConnect: () => {
      emit('status_change', { status: 'connected' as RealtimeStatus })
      emit('mode_change', { mode: 'listening' })
    },

    onDisconnect: () => {
      emit('status_change', { status: 'idle' as RealtimeStatus })
      emit('mode_change', { mode: 'idle' })
    },

    onModeChange: ({ mode }) => {
      const mappedMode: RealtimeMode =
        mode === 'speaking' ? 'speaking' : 'listening'
      emit('mode_change', { mode: mappedMode })
    },

    onMessage: ({ message, source }) => {
      const role = source === 'user' ? 'user' : 'assistant'

      // Emit transcript update
      emit('transcript', {
        role,
        transcript: message,
        isFinal: true,
      })

      // Create and emit message
      const realtimeMessage: RealtimeMessage = {
        id: generateMessageId(),
        role,
        timestamp: Date.now(),
        parts: [{ type: 'audio', transcript: message }],
      }
      emit('message_complete', { message: realtimeMessage })
    },

    onError: (error: string | Error) => {
      emit('error', {
        error: new Error(
          typeof error === 'string' ? error : error.message || 'Unknown error',
        ),
      })
    },
  })

  // Connection implementation
  const connection: RealtimeConnection = {
    async disconnect() {
      if (conversation) {
        await conversation.endSession()
        conversation = null
      }
      emit('status_change', { status: 'idle' as RealtimeStatus })
    },

    async startAudioCapture() {
      // ElevenLabs SDK handles audio capture automatically
      // This is called when the session starts
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      // ElevenLabs SDK handles this
      emit('mode_change', { mode: 'idle' })
    },

    sendText(_text: string) {
      // ElevenLabs doesn't support direct text input in the same way
      // The SDK is voice-first. Log a warning.
      console.warn(
        'ElevenLabs realtime adapter does not support sendText. Use voice input.',
      )
    },

    sendToolResult(_callId: string, _result: string) {
      // ElevenLabs handles client tools differently - they're registered at session start
      console.warn(
        'ElevenLabs tool results are handled via clientTools option during session creation.',
      )
    },

    updateSession(_config: Partial<RealtimeSessionConfig>) {
      // ElevenLabs session config is set at creation time
      console.warn(
        'ElevenLabs does not support runtime session updates. Configure at connection time.',
      )
    },

    interrupt() {
      // ElevenLabs handles interruption automatically via barge-in
      // No explicit API to call
      emit('mode_change', { mode: 'listening' })
      emit('interrupted', {})
    },

    on<TEvent extends RealtimeEvent>(
      event: TEvent,
      handler: RealtimeEventHandler<TEvent>,
    ): () => void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(handler)

      return () => {
        eventHandlers.get(event)?.delete(handler)
      }
    },

    getAudioVisualization(): AudioVisualization {
      return {
        get inputLevel() {
          if (!conversation) return 0
          try {
            return conversation.getInputVolume()
          } catch {
            return 0
          }
        },

        get outputLevel() {
          if (!conversation) return 0
          try {
            return conversation.getOutputVolume()
          } catch {
            return 0
          }
        },

        getInputFrequencyData() {
          if (!conversation) return emptyFrequencyData
          try {
            return conversation.getInputByteFrequencyData()
          } catch {
            return emptyFrequencyData
          }
        },

        getOutputFrequencyData() {
          if (!conversation) return emptyFrequencyData
          try {
            return conversation.getOutputByteFrequencyData()
          } catch {
            return emptyFrequencyData
          }
        },

        getInputTimeDomainData() {
          // ElevenLabs SDK doesn't expose time domain data
          return emptyTimeDomainData
        },

        getOutputTimeDomainData() {
          // ElevenLabs SDK doesn't expose time domain data
          return emptyTimeDomainData
        },

        get inputSampleRate() {
          return 16000
        },

        get outputSampleRate() {
          return 16000
        },
      }
    },
  }

  return connection
}
