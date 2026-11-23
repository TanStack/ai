import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { buildSessionUpdate } from './session-update'
import { createOpenAIWebRTCTransport } from './webrtc-transport'
import type {
  AnyClientTool,
  RealtimeAdapter,
  RealtimeConnection,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeToken,
} from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { OpenAIRealtimeOptions } from './types'

const OPENAI_REALTIME_URL = 'https://api.openai.com/v1/realtime'

/**
 * Creates an OpenAI realtime adapter for client-side use.
 *
 * Uses WebRTC for browser connections (default) or WebSocket for Node.js.
 *
 * @param options - Optional configuration
 * @returns A RealtimeAdapter for use with RealtimeClient
 *
 * @example
 * ```typescript
 * import { RealtimeClient } from '@tanstack/ai-client'
 * import { openaiRealtime } from '@tanstack/ai-openai'
 *
 * const client = new RealtimeClient({
 *   getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *   adapter: openaiRealtime(),
 * })
 * ```
 */
export function openaiRealtime(
  options: OpenAIRealtimeOptions = {},
): RealtimeAdapter {
  const connectionMode = options.connectionMode ?? 'webrtc'
  const logger = resolveDebugOption(options.debug)

  return {
    provider: 'openai',

    async connect(
      token: RealtimeToken,
      _clientTools?: ReadonlyArray<AnyClientTool>,
      options?: { abortSignal?: AbortSignal },
    ): Promise<RealtimeConnection> {
      const model = token.config.model ?? 'gpt-realtime-2.1'
      logger.request(`activity=realtime provider=openai model=${model}`, {
        provider: 'openai',
        model,
      })

      if (connectionMode === 'webrtc') {
        return createWebRTCConnection(token, logger, options?.abortSignal)
      }
      const error = new Error('WebSocket connection mode not yet implemented')
      logger.errors('openai.realtime fatal', {
        error,
        source: 'openai.realtime',
      })
      throw error
    },
  }
}

/**
 * Sends the SDP offer to OpenAI's GA `/calls` endpoint and returns the answer.
 */
async function exchangeRealtimeSdp(
  offerSdp: string,
  token: RealtimeToken,
  logger: InternalLogger,
  abortSignal?: AbortSignal,
) {
  // The model is bound to the ephemeral token (minted via
  // `/v1/realtime/client_secrets`), so it must NOT be passed as a query
  // param. GA rejects `?model=` with a 400.
  const sdpResponse = await fetch(`${OPENAI_REALTIME_URL}/calls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/sdp',
    },
    body: offerSdp,
    ...(abortSignal && { signal: abortSignal }),
  })

  if (!sdpResponse.ok) {
    const errorText = await sdpResponse.text()
    const error = new Error(
      `Failed to establish WebRTC connection: ${sdpResponse.status} - ${errorText}`,
    )
    logger.errors('openai.realtime fatal', {
      error,
      source: 'openai.realtime',
    })
    throw error
  }

  return sdpResponse.text()
}

/**
 * Creates a WebRTC connection to OpenAI's realtime API
 */
async function createWebRTCConnection(
  token: RealtimeToken,
  logger: InternalLogger,
  abortSignal?: AbortSignal,
): Promise<RealtimeConnection> {
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()

  // Current state
  let currentMode: RealtimeMode = 'idle'
  let currentMessageId: string | null = null

  // Helper to emit events (defined early so it can be used during setup)
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

  // Resolves when the data channel is open. A failed or aborted setup
  // releases the microphone and the peer connection, then rejects.
  const transport = await createOpenAIWebRTCTransport({
    logger,
    source: 'openai.realtime',
    exchangeSdp: (offerSdp, signal) =>
      exchangeRealtimeSdp(offerSdp, token, logger, signal),
    onServerEvent: handleServerEvent,
    onOpen: () => emit('status_change', { status: 'connected' }),
    onError: (error) => emit('error', { error }),
    abortSignal,
  })
  const { sendEvent } = transport

  // Handle server events
  function handleServerEvent(event: Record<string, unknown>) {
    const type = event.type as string

    switch (type) {
      case 'session.created':
      case 'session.updated':
        // Session ready
        break

      case 'input_audio_buffer.speech_started':
        currentMode = 'listening'
        emit('mode_change', { mode: 'listening' })
        break

      case 'input_audio_buffer.speech_stopped':
        currentMode = 'thinking'
        emit('mode_change', { mode: 'thinking' })
        break

      case 'input_audio_buffer.committed':
        // Audio buffer committed for processing
        break

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = event.transcript as string
        emit('transcript', { role: 'user', transcript, isFinal: true })
        break
      }

      case 'response.created':
        currentMode = 'thinking'
        emit('mode_change', { mode: 'thinking' })
        break

      case 'response.output_item.added': {
        const item = event.item as Record<string, unknown>
        if (item.type === 'message') {
          currentMessageId = item.id as string
        }
        break
      }

      case 'response.output_audio_transcript.delta': {
        const delta = event.delta as string
        emit('transcript', {
          role: 'assistant',
          transcript: delta,
          isFinal: false,
        })
        break
      }

      case 'response.output_audio_transcript.done': {
        const transcript = event.transcript as string
        emit('transcript', { role: 'assistant', transcript, isFinal: true })
        break
      }

      case 'response.output_text.delta': {
        const delta = event.delta as string
        emit('transcript', {
          role: 'assistant',
          transcript: delta,
          isFinal: false,
        })
        break
      }

      case 'response.output_text.done': {
        const text = event.text as string
        emit('transcript', {
          role: 'assistant',
          transcript: text,
          isFinal: true,
        })
        break
      }

      case 'response.output_audio.delta':
        if (currentMode !== 'speaking') {
          currentMode = 'speaking'
          emit('mode_change', { mode: 'speaking' })
        }
        break

      case 'response.output_audio.done':
        break

      case 'response.function_call_arguments.done': {
        // Realtime payloads include both call_id and item_id; some sessions omit one.
        const callId = (event['call_id'] ?? event['item_id']) as
          | string
          | undefined
        const name = event['name'] as string
        const args = event['arguments'] as string
        if (!callId) {
          logger.errors(
            'openai.realtime function_call_arguments.done missing ids',
            {
              event,
              source: 'openai.realtime',
            },
          )
          break
        }
        try {
          const input = JSON.parse(args)
          emit('tool_call', { toolCallId: callId, toolName: name, input })
        } catch {
          emit('tool_call', {
            toolCallId: callId,
            toolName: name,
            input: args,
          })
        }
        break
      }

      case 'response.done': {
        const response = event.response as Record<string, unknown>
        const output = response.output as
          | Array<Record<string, unknown>>
          | undefined

        currentMode = 'listening'
        emit('mode_change', { mode: 'listening' })

        // Emit message complete if we have a current message
        if (currentMessageId) {
          const message: RealtimeMessage = {
            id: currentMessageId,
            role: 'assistant',
            timestamp: Date.now(),
            parts: [],
          }

          // Extract content from output items
          for (const item of output || []) {
            if (item.type === 'message' && item.content) {
              const content = item.content as Array<Record<string, unknown>>
              for (const part of content) {
                // GA renamed assistant content types: `audio` -> `output_audio`,
                // `text` -> `output_text`
                if (part.type === 'output_audio' && part.transcript) {
                  message.parts.push({
                    type: 'audio',
                    transcript: part.transcript as string,
                  })
                } else if (part.type === 'output_text' && part.text) {
                  message.parts.push({
                    type: 'text',
                    content: part.text as string,
                  })
                }
              }
            }
          }

          emit('message_complete', { message })
          currentMessageId = null
        }
        break
      }

      case 'conversation.item.truncated':
        emit(
          'interrupted',
          currentMessageId ? { messageId: currentMessageId } : {},
        )
        break

      case 'error': {
        const error = event.error as Record<string, unknown>
        emit('error', {
          error: new Error((error.message as string) || 'Unknown error'),
        })
        break
      }
    }
  }

  // Connection implementation
  const connection: RealtimeConnection = {
    async disconnect() {
      await transport.close()
      emit('status_change', { status: 'idle' })
    },

    async startAudioCapture() {
      // Audio capture is established during connection setup
      // This method enables the tracks and signals listening mode
      transport.startAudioCapture()
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      transport.stopAudioCapture()
      currentMode = 'idle'
      emit('mode_change', { mode: 'idle' })
    },

    sendText(text: string) {
      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text }],
        },
      })
      sendEvent({
        type: 'response.create',
      })
    },

    sendImage(imageData: string, mimeType: string) {
      // Determine if imageData is a URL or base64 data
      const isUrl =
        imageData.startsWith('http://') || imageData.startsWith('https://')
      const imageContent = isUrl
        ? { type: 'input_image', image_url: imageData }
        : {
            type: 'input_image',
            image_url: `data:${mimeType};base64,${imageData}`,
          }

      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [imageContent],
        },
      })
      sendEvent({
        type: 'response.create',
      })
    },

    sendToolResult(callId: string, result: string) {
      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'function_call_output',
          call_id: callId,
          output: result,
        },
      })
      sendEvent({ type: 'response.create' })
    },

    updateSession(config: Partial<RealtimeSessionConfig>) {
      if (config.temperature !== undefined) {
        // The GA API removed `temperature` from session config; sending it
        // would get the whole update rejected with `unknown_parameter`.
        logger.provider(
          'provider=openai direction=out type=session.update dropped `temperature` (removed in the GA realtime API)',
          { frame: { temperature: config.temperature } },
        )
      }

      sendEvent({
        type: 'session.update',
        session: buildSessionUpdate(config),
      })
    },

    interrupt() {
      sendEvent({ type: 'response.cancel' })
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
      emit(
        'interrupted',
        currentMessageId ? { messageId: currentMessageId } : {},
      )
    },

    on<TEvent extends RealtimeEvent>(
      event: TEvent,
      handler: RealtimeEventHandler<TEvent>,
    ): () => void {
      let handlers = eventHandlers.get(event)
      if (!handlers) {
        handlers = new Set()
        eventHandlers.set(event, handlers)
      }
      handlers.add(handler)

      return () => {
        eventHandlers.get(event)?.delete(handler)
      }
    },

    getAudioVisualization: transport.getAudioVisualization,
  }

  return connection
}
