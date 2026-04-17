import { Conversation } from '@11labs/client'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import type {
  AnyClientTool,
  AudioVisualization,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
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
  const logger = resolveDebugOption(options.debug)

  return {
    provider: 'elevenlabs',

    async connect(
      token: RealtimeToken,
      clientToolDefs?: ReadonlyArray<AnyClientTool>,
    ): Promise<RealtimeConnection> {
      logger.request(`activity=realtime provider=elevenlabs`, {
        provider: 'elevenlabs',
      })
      return createElevenLabsConnection(token, options, logger, clientToolDefs)
    },
  }
}

/**
 * Creates a connection to ElevenLabs conversational AI
 */
async function createElevenLabsConnection(
  token: RealtimeToken,
  _options: ElevenLabsRealtimeOptions,
  logger: InternalLogger,
  clientToolDefs?: ReadonlyArray<AnyClientTool>,
): Promise<RealtimeConnection> {
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()
  let conversation: Awaited<
    ReturnType<typeof Conversation.startSession>
  > | null = null
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

  // Convert TanStack tool definitions to ElevenLabs clientTools format.
  // @11labs/client@0.2.0 expects plain async functions, not objects.
  const elevenLabsClientTools: Record<
    string,
    (params: unknown) => Promise<string>
  > = {}

  if (clientToolDefs) {
    for (const tool of clientToolDefs) {
      elevenLabsClientTools[tool.name] = async (params: unknown) => {
        if (tool.execute) {
          const result = await tool.execute(params)
          return typeof result === 'string' ? result : JSON.stringify(result)
        }
        return JSON.stringify({
          error: `No execute function for tool ${tool.name}`,
        })
      }
    }
  }

  // Build session options
  const sessionOptions: Record<string, unknown> = {
    signedUrl: token.token,

    onConnect: () => {
      logger.provider(`provider=elevenlabs direction=in type=connect`, {
        frame: { type: 'connect' },
      })
      emit('status_change', { status: 'connected' as RealtimeStatus })
      emit('mode_change', { mode: 'listening' })
    },

    onDisconnect: () => {
      logger.provider(`provider=elevenlabs direction=in type=disconnect`, {
        frame: { type: 'disconnect' },
      })
      emit('status_change', { status: 'idle' as RealtimeStatus })
      emit('mode_change', { mode: 'idle' })
    },

    onModeChange: ({ mode }: { mode: string }) => {
      logger.provider(`provider=elevenlabs direction=in type=mode_change`, {
        frame: { type: 'mode_change', mode },
      })
      const mappedMode: RealtimeMode =
        mode === 'speaking' ? 'speaking' : 'listening'
      emit('mode_change', { mode: mappedMode })
    },

    onMessage: ({ message, source }: { message: string; source: string }) => {
      logger.provider(`provider=elevenlabs direction=in type=message`, {
        frame: { type: 'message', source, message },
      })
      const role = source === 'user' ? 'user' : 'assistant'

      if (role === 'user') {
        // User transcripts: only emit transcript — the RealtimeClient
        // creates the user message when it receives a final transcript
        emit('transcript', {
          role,
          transcript: message,
          isFinal: true,
        })
      } else {
        // Assistant messages: only emit message_complete — the canonical
        // event for finalized assistant messages
        const realtimeMessage: RealtimeMessage = {
          id: generateMessageId(),
          role,
          timestamp: Date.now(),
          parts: [{ type: 'audio', transcript: message }],
        }
        emit('message_complete', { message: realtimeMessage })
      }
    },

    onError: (error: string | Error) => {
      logger.errors('elevenlabs.realtime fatal', {
        error,
        source: 'elevenlabs.realtime',
      })
      emit('error', {
        error: new Error(
          typeof error === 'string' ? error : error.message || 'Unknown error',
        ),
      })
    },
  }

  // Only add clientTools if we have any
  if (Object.keys(elevenLabsClientTools).length > 0) {
    sessionOptions.clientTools = elevenLabsClientTools
  }

  // Start the conversation session
  try {
    conversation = await Conversation.startSession(
      sessionOptions as Parameters<typeof Conversation.startSession>[0],
    )
  } catch (error) {
    logger.errors('elevenlabs.realtime fatal', {
      error,
      source: 'elevenlabs.realtime',
    })
    throw error
  }

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

    sendText(text: string) {
      if (!conversation) return
      logger.provider(`provider=elevenlabs direction=out type=user_message`, {
        frame: { type: 'user_message', text },
      })
      conversation.sendUserMessage(text)
    },

    sendImage(_imageData: string, _mimeType: string) {
      // ElevenLabs does not support direct image input in the conversation API
      logger.errors('elevenlabs.realtime sendImage not supported', {
        source: 'elevenlabs.realtime',
      })
    },

    sendToolResult(_callId: string, _result: string) {
      // ElevenLabs client tools are handled via the clientTools handlers
      // registered at session start — results are returned automatically
    },

    updateSession(_config: Partial<RealtimeSessionConfig>) {
      // ElevenLabs session config is set at creation time
      logger.errors('elevenlabs.realtime updateSession not supported', {
        source: 'elevenlabs.realtime',
      })
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
