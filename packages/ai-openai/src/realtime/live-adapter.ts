import { createRealtimeEventEmitter } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { toResponsesSettings } from './live-session'
import {
  createOpenAIWebRTCTransport,
  waitUnlessAborted,
} from './webrtc-transport'
import type {
  RealtimeConnectOptions,
  RealtimeConnection,
  RealtimeMode,
  RealtimeRelayAdapter,
  RealtimeRelayCreateSession,
  RealtimeSessionConfig,
} from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { OpenAILiveOptions } from './live-types'

const SOURCE = 'openai.live'
// ponytail: connect() waits at most 15 s for `session.started`. The server
// sends it right after the data channel opens. Make it an option if a slow
// network needs more time.
const START_TIMEOUT_MS = 15_000
// ponytail: disconnect() waits at most 1 s for `session.closed`. Then it
// closes the connection locally anyway.
const CLOSE_TIMEOUT_MS = 1_000

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
 * (`providerOptions.delegation`). It cannot change the delegated `model`:
 * only the server sets it.
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
      return createLiveConnection(createSession, logger, connectOptions)
    },
  }
}

async function createLiveConnection(
  createSession: RealtimeRelayCreateSession,
  logger: InternalLogger,
  connectOptions?: RealtimeConnectOptions,
) {
  const abortSignal = connectOptions?.abortSignal
  const { emit, on } = createRealtimeEventEmitter()

  let currentMode: RealtimeMode = 'idle'
  let messageIdCounter = 0
  // The transcript of the person who speaks now
  let turn: { role: 'user' | 'assistant'; text: string } | null = null
  const delegations = new Map<string, DelegationCalls>()
  // The transport closes only once. A second `audioContext.close()` rejects.
  let closing: Promise<void> | null = null
  // Set before the transport starts, because its onClose can run early.
  let hasEnded = false
  let isDisconnecting = false

  // connect() returns the connection only after `session.started`. Before
  // that, the server must not get `session.input_audio.unmute`.
  let markStarted = () => {}
  let failStart: (error: Error) => void = () => {}
  const sessionStarted = new Promise<void>((resolve, reject) => {
    markStarted = () => resolve()
    failStart = reject
  })
  // A start failure after connect() returned has no reader. Mark it handled.
  void sessionStarted.catch(() => {})
  // disconnect() waits for this after it sends `session.close`.
  let markClosed = () => {}
  const sessionClosed = new Promise<void>((resolve) => {
    markClosed = () => resolve()
  })

  function setMode(mode: RealtimeMode) {
    if (currentMode === mode) return
    currentMode = mode
    emit('mode_change', { mode })
  }

  async function exchangeSdp(offerSdp: string, signal?: AbortSignal) {
    // `createSession` takes no signal. Stop the wait when the signal aborts,
    // so the transport releases the microphone at once.
    signal?.throwIfAborted()
    const answer = await waitUnlessAborted(
      createSession({ sdp: offerSdp }),
      signal,
    )
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
    // The data channel closed without `session.closed`.
    // During disconnect(), a closed channel only ends the wait for
    // `session.closed`. It is not a lost connection.
    onClose: () =>
      isDisconnecting ? markClosed() : endSession('connection_lost'),
    abortSignal,
    autoCapture: connectOptions?.autoCapture,
  })
  const { sendEvent } = transport

  function closeTransport() {
    closing ??= transport.close().catch((error: unknown) => {
      logger.errors(`${SOURCE} close failed`, { error, source: SOURCE })
    })
    return closing
  }

  // The session ended on the server or the connection was lost: release the
  // mic and the peer, and report idle once.
  function endSession(reason: string | undefined) {
    if (hasEnded) return
    hasEnded = true
    const error = new Error(
      `GPT-Live session closed: ${reason ?? 'unknown reason'}`,
    )
    failStart(error)
    markClosed()
    finishTurn()
    void closeTransport()
    if (reason !== 'close_requested') emit('error', { error })
    setMode('idle')
    emit('status_change', { status: 'idle' })
  }

  const startTimeout = startTimer(START_TIMEOUT_MS)
  try {
    abortSignal?.throwIfAborted()
    const result = await waitUnlessAborted(
      Promise.race([sessionStarted, startTimeout.promise]),
      abortSignal,
    )
    if (result === 'timeout') {
      throw new Error(
        `GPT-Live session did not start in ${START_TIMEOUT_MS / 1000} s`,
      )
    }
  } catch (error) {
    await closeTransport()
    throw error
  } finally {
    startTimeout.clear()
  }

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
        input: parseArguments(item, logger),
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
        markStarted()
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
        endSession(event.reason)
        break

      case 'error': {
        const error = new Error(event.error?.message || 'Unknown error')
        failStart(error)
        emit('error', { error })
        break
      }
    }
  }

  const connection: RealtimeConnection = {
    async disconnect() {
      isDisconnecting = true
      const closeTimeout = startTimer(CLOSE_TIMEOUT_MS)
      sendEvent({ type: 'session.close' })
      await Promise.race([sessionClosed, closeTimeout.promise])
      closeTimeout.clear()
      hasEnded = true
      await closeTransport()
      setMode('idle')
      emit('status_change', { status: 'idle' })
    },

    async startAudioCapture() {
      const wantsCapture = await transport.startAudioCapture()
      if (!wantsCapture) return
      sendEvent({ type: 'session.input_audio.unmute' })
      setMode('listening')
    },

    stopAudioCapture() {
      transport.stopAudioCapture()
      sendEvent({ type: 'session.input_audio.mute' })
      setMode('idle')
    },

    sendText() {
      const error = new Error(`${SOURCE} sendText not supported`)
      logger.errors(error.message, { source: SOURCE })
      emit('error', { error })
    },

    sendImage() {
      const error = new Error(`${SOURCE} sendImage not supported`)
      logger.errors(error.message, { source: SOURCE })
      emit('error', { error })
    },

    sendToolResult(callId: string, result: string) {
      const entries = [...delegations]
      const owner = entries.find(([, calls]) => calls.pending.has(callId))
      if (!owner) {
        // Do not log `result`. It can hold user data.
        logger.errors(`${SOURCE} sendToolResult for an unknown tool call`, {
          source: SOURCE,
          callId,
        })
        return
      }
      const [delegationId, calls] = owner
      sendEvent({
        type: 'response.item.create',
        item: { type: 'function_call_output', call_id: callId, output: result },
      })
      calls.pending.delete(callId)
      resumeIfReady(delegationId, calls)
    },

    updateSession(config: Partial<RealtimeSessionConfig>) {
      const { providerOptions, ...rest } = config
      const { delegation, ...otherProviderOptions } = providerOptions ?? {}
      // Only the server sets the delegated model.
      const { model, ...delegationSettings } = delegation ?? {}
      const ignored = [
        ...Object.keys(rest),
        ...Object.keys(otherProviderOptions).map(
          (key) => `providerOptions.${key}`,
        ),
        ...(model === undefined ? [] : ['providerOptions.delegation.model']),
      ]
      if (ignored.length > 0) {
        logger.errors(
          `${SOURCE} updateSession can only change providerOptions.delegation, without model`,
          { source: SOURCE, ignored },
        )
      }
      const responses = toResponsesSettings(delegationSettings)
      if (Object.keys(responses).length === 0) return
      sendEvent({
        type: 'session.update',
        session: { delegation: { responses } },
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

/** A promise that resolves with `'timeout'` after `ms`. `clear` stops the timer. */
function startTimer(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined
  const promise = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms)
  })
  return { promise, clear: () => clearTimeout(timer) }
}

/** Parse tool arguments. Bad JSON goes to the tool as the raw string. */
function parseArguments(
  item: { call_id: string; name: string; arguments: string },
  logger: InternalLogger,
): unknown {
  try {
    return JSON.parse(item.arguments)
  } catch {
    // Do not log the arguments or the parser error. They can hold user data.
    logger.errors(`${SOURCE} tool arguments are not valid JSON`, {
      source: SOURCE,
      toolName: item.name,
      toolCallId: item.call_id,
    })
    return item.arguments
  }
}
