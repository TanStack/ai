import { createRealtimeEventEmitter } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { toResponsesSettings } from './live-session'
import { createOpenAIWebRTCTransport } from './webrtc-transport'
import type {
  RealtimeConnection,
  RealtimeMode,
  RealtimeRelayAdapter,
  RealtimeRelayCreateSession,
  RealtimeSessionConfig,
} from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { OpenAILiveOptions } from './live-types'

const SOURCE = 'openai.live'

/** The fields that this adapter reads from the Live server events. */
type LiveServerEvent = {
  type: string
  delta?: string
  delegation_id?: string
  event?: {
    type: string
    item?: { type: string; call_id: string; name: string; arguments: string }
  }
  usage?: { seconds?: number }
  reason?: string
  error?: { message?: string }
}

/** Tool calls of one delegated response. */
interface DelegationCalls {
  pending: Set<string>
  /** True when the delegated response sent `response.completed`. */
  done: boolean
}

/**
 * Creates an OpenAI GPT-Live adapter for the browser.
 *
 * GPT-Live has no browser token. The adapter makes a WebRTC offer and gives
 * it to `createSession`, which sends it to your server. Your server calls
 * `realtimeSession()` with `openaiLiveSession()` and returns the answer.
 *
 * GPT-Live has no text input and no image input. `sendText` and `sendImage`
 * log an error. `updateSession` can only change the delegation settings
 * (`providerOptions.delegation`).
 *
 * @param options - Optional configuration, for example `debug`
 * @returns A RealtimeRelayAdapter for use with `RealtimeClient`
 *
 * @example
 * ```typescript
 * import { RealtimeClient } from '@tanstack/ai-client'
 * import { openaiLive } from '@tanstack/ai-openai'
 *
 * const client = new RealtimeClient({
 *   adapter: openaiLive(),
 *   createSession: (request) =>
 *     fetch('/api/live-session', {
 *       method: 'POST',
 *       body: JSON.stringify(request),
 *     }).then((r) => r.json()),
 * })
 * ```
 */
export function openaiLive(
  options: OpenAILiveOptions = {},
): RealtimeRelayAdapter {
  const logger = resolveDebugOption(options.debug)

  return {
    provider: 'openai',
    kind: 'relay',
    connect(createSession, _clientTools, connectOptions) {
      return createLiveConnection(
        createSession,
        logger,
        connectOptions?.abortSignal,
      )
    },
  }
}

async function createLiveConnection(
  createSession: RealtimeRelayCreateSession,
  logger: InternalLogger,
  abortSignal?: AbortSignal,
) {
  const { emit, on } = createRealtimeEventEmitter()

  let currentMode: RealtimeMode = 'idle'
  let messageIdCounter = 0
  // The transcript of the person who speaks now
  let turn: { role: 'user' | 'assistant'; text: string } | null = null
  const delegations = new Map<string, DelegationCalls>()

  function setMode(mode: RealtimeMode) {
    if (currentMode === mode) return
    currentMode = mode
    emit('mode_change', { mode })
  }

  async function exchangeSdp(offerSdp: string, signal?: AbortSignal) {
    // `createSession` takes no signal. Stop the wait when the signal aborts,
    // so the transport releases the microphone at once.
    signal?.throwIfAborted()
    const answer = await Promise.race([
      createSession({ sdp: offerSdp }),
      rejectOnAbort(signal),
    ])
    logger.request(
      `activity=realtime provider=openai model=${answer.config.model ?? '<unknown>'}`,
      {
        provider: 'openai',
        model: answer.config.model,
        sessionId: answer.sessionId,
      },
    )
    return answer.sdp
  }

  const transport = await createOpenAIWebRTCTransport({
    logger,
    source: SOURCE,
    exchangeSdp,
    onServerEvent: handleServerEvent,
    // `session.started` tells us that the session is ready.
    onOpen: () => {},
    onError: (error) => emit('error', { error }),
    abortSignal,
  })
  const { sendEvent } = transport

  function appendTranscript(role: 'user' | 'assistant', delta: string) {
    if (turn?.role !== role) finishTurn()
    turn ??= { role, text: '' }
    turn.text += delta
    emit('transcript', { role, transcript: turn.text, isFinal: false })
  }

  // ponytail: Live has no transcript-done event. A turn ends when the other
  // person starts to speak, a delegation starts, or the session closes. A
  // barge-in that mixes the two speakers makes short turns. Use a done event
  // here if Live adds one.
  function finishTurn() {
    if (!turn) return
    const { role, text } = turn
    turn = null
    // RealtimeClient adds the user message from the final transcript.
    emit('transcript', { role, transcript: text, isFinal: true })
    if (role === 'user') return
    emit('message_complete', {
      message: {
        id: `openai-live-msg-${Date.now()}-${++messageIdCounter}`,
        role,
        timestamp: Date.now(),
        parts: [{ type: 'audio', transcript: text }],
      },
    })
  }

  // The delegated response continues only after it has a result for each
  // call. Wait for `response.completed` too: a fast tool can finish before
  // the next parallel call arrives.
  function resumeIfReady(delegationId: string, calls: DelegationCalls) {
    if (!calls.done || calls.pending.size > 0) return
    delegations.delete(delegationId)
    sendEvent({ type: 'response.create' })
  }

  function handleResponseEvent(
    delegationId: string,
    event: NonNullable<LiveServerEvent['event']>,
  ) {
    const item = event.item
    const isFunctionCall =
      event.type === 'response.output_item.done' &&
      item?.type === 'function_call'
    if (isFunctionCall) {
      const calls = delegations.get(delegationId) ?? {
        pending: new Set<string>(),
        done: false,
      }
      delegations.set(delegationId, calls)
      calls.pending.add(item.call_id)
      emit('tool_call', {
        toolCallId: item.call_id,
        toolName: item.name,
        input: parseArguments(item.arguments, logger),
      })
      return
    }
    if (event.type !== 'response.completed') return
    const calls = delegations.get(delegationId)
    if (!calls) return
    calls.done = true
    resumeIfReady(delegationId, calls)
  }

  function handleServerEvent(raw: Record<string, unknown>) {
    // ponytail: no runtime check of the server events. The fields follow the
    // OpenAI Live API docs.
    const event = raw as LiveServerEvent
    switch (event.type) {
      case 'session.started':
        emit('status_change', { status: 'connected' })
        setMode('listening')
        break

      case 'session.input_transcript.delta':
        setMode('listening')
        appendTranscript('user', event.delta ?? '')
        break

      case 'session.output_transcript.delta':
        setMode('speaking')
        appendTranscript('assistant', event.delta ?? '')
        break

      case 'session.delegation.created':
        finishTurn()
        setMode('thinking')
        break

      case 'response.event':
        if (event.delegation_id && event.event) {
          handleResponseEvent(event.delegation_id, event.event)
        }
        break

      case 'session.usage.updated':
        // ponytail: Live reports seconds of audio, not tokens. The token
        // fields stay 0 and `billed` has the seconds.
        emit('usage', {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          billed: { quantity: event.usage?.seconds ?? 0, unit: 'seconds' },
        })
        break

      case 'session.closed':
        finishTurn()
        // The server ended the session: release the mic and the peer.
        transport.close().catch((error: unknown) => {
          logger.errors(`${SOURCE} close failed`, { error, source: SOURCE })
        })
        if (event.reason !== 'close_requested') {
          emit('error', {
            error: new Error(
              `GPT-Live session closed: ${event.reason ?? 'unknown reason'}`,
            ),
          })
        }
        setMode('idle')
        emit('status_change', { status: 'idle' })
        break

      case 'error':
        emit('error', {
          error: new Error(event.error?.message || 'Unknown error'),
        })
        break
    }
  }

  const connection: RealtimeConnection = {
    async disconnect() {
      sendEvent({ type: 'session.close' })
      await transport.close()
      setMode('idle')
      emit('status_change', { status: 'idle' })
    },

    async startAudioCapture() {
      transport.startAudioCapture()
      sendEvent({ type: 'session.input_audio.unmute' })
      setMode('listening')
    },

    stopAudioCapture() {
      transport.stopAudioCapture()
      sendEvent({ type: 'session.input_audio.mute' })
      setMode('idle')
    },

    sendText() {
      logger.errors(`${SOURCE} sendText not supported`, { source: SOURCE })
    },

    sendImage() {
      logger.errors(`${SOURCE} sendImage not supported`, { source: SOURCE })
    },

    sendToolResult(callId: string, result: string) {
      sendEvent({
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: callId, output: result },
      })
      for (const [delegationId, calls] of delegations) {
        if (!calls.pending.delete(callId)) continue
        resumeIfReady(delegationId, calls)
        return
      }
    },

    updateSession(config: Partial<RealtimeSessionConfig>) {
      const { providerOptions, ...rest } = config
      const { delegation, ...otherProviderOptions } = providerOptions ?? {}
      const ignored = [
        ...Object.keys(rest),
        ...Object.keys(otherProviderOptions).map(
          (key) => `providerOptions.${key}`,
        ),
      ]
      if (ignored.length > 0) {
        logger.errors(
          `${SOURCE} updateSession can only change providerOptions.delegation`,
          { source: SOURCE, ignored },
        )
      }
      if (!delegation) return
      sendEvent({
        type: 'session.update',
        session: { delegation: { responses: toResponsesSettings(delegation) } },
      })
    },

    interrupt() {
      // GPT-Live is full duplex and handles barge-in itself. There is no
      // cancel event.
      setMode('listening')
      emit('interrupted', {})
    },

    on,
    getAudioVisualization: transport.getAudioVisualization,
  }

  return connection
}

/** Rejects with the abort reason when `signal` aborts. Never settles without a signal. */
function rejectOnAbort(signal?: AbortSignal) {
  return new Promise<never>((_, reject) => {
    signal?.addEventListener('abort', () => reject(signal.reason), {
      once: true,
    })
  })
}

/** Parse tool arguments. Bad JSON goes to the tool as the raw string. */
function parseArguments(args: string, logger: InternalLogger): unknown {
  try {
    return JSON.parse(args)
  } catch (error) {
    logger.errors(`${SOURCE} tool arguments are not valid JSON`, {
      source: SOURCE,
      error,
      arguments: args,
    })
    return args
  }
}
