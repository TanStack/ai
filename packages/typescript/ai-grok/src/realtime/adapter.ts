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
import type { RealtimeAdapter, RealtimeConnection } from './realtime-contract'
import type { GrokRealtimeOptions } from './types'

const GROK_REALTIME_URL = 'https://api.x.ai/v1/realtime'

/**
 * Runtime-checked field readers for untyped server events. Replace the
 * drive-by `event.X as string` / `event.X as Record<string, unknown>` casts
 * with readers that return `undefined` when the shape doesn't match, so a
 * malformed frame can't throw a TypeError inside `handleServerEvent`.
 */
function readString(
  obj: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = obj[key]
  return typeof value === 'string' ? value : undefined
}

function readObject(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const value = obj[key]
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function readObjectArray(
  obj: Record<string, unknown>,
  key: string,
): Array<Record<string, unknown>> | undefined {
  const value = obj[key]
  if (!Array.isArray(value)) return undefined
  return value.filter(
    (item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item),
  )
}

type RealtimeServerError = Error & {
  code?: string
  type?: string
  param?: string
}

/**
 * Creates a Grok realtime adapter for client-side use.
 *
 * Uses WebRTC for browser connections (default). Mirrors the OpenAI realtime
 * adapter because xAI's Voice Agent API is OpenAI-realtime-compatible — the
 * only differences are the endpoint URL and default model.
 *
 * @example
 * ```typescript
 * import { RealtimeClient } from '@tanstack/ai-client'
 * import { grokRealtime } from '@tanstack/ai-grok'
 *
 * const client = new RealtimeClient({
 *   getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *   adapter: grokRealtime(),
 * })
 * ```
 */
export function grokRealtime(
  options: GrokRealtimeOptions = {},
): RealtimeAdapter {
  const connectionMode = options.connectionMode ?? 'webrtc'
  const logger = resolveDebugOption(options.debug)

  return {
    provider: 'grok',

    async connect(
      token: RealtimeToken,
      _clientTools?: ReadonlyArray<AnyClientTool>,
    ): Promise<RealtimeConnection> {
      const model = token.config.model ?? 'grok-voice-fast-1.0'
      logger.request(`activity=realtime provider=grok model=${model}`, {
        provider: 'grok',
        model,
      })

      if (connectionMode === 'webrtc') {
        return createWebRTCConnection(token, logger)
      }
      const error = new Error('WebSocket connection mode not yet implemented')
      logger.errors('grok.realtime fatal', {
        error,
        source: 'grok.realtime',
      })
      throw error
    },
  }
}

/**
 * Creates a WebRTC connection to xAI's realtime API.
 */
async function createWebRTCConnection(
  token: RealtimeToken,
  logger: InternalLogger,
): Promise<RealtimeConnection> {
  const model = token.config.model ?? 'grok-voice-fast-1.0'
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()

  const pc = new RTCPeerConnection()

  let audioContext: AudioContext | null = null
  let inputAnalyser: AnalyserNode | null = null
  let outputAnalyser: AnalyserNode | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let outputSource: MediaStreamAudioSourceNode | null = null
  let localStream: MediaStream | null = null

  let audioElement: HTMLAudioElement | null = null

  let dataChannel: RTCDataChannel | null = null

  let currentMode: RealtimeMode = 'idle'
  let currentMessageId: string | null = null

  // Flipped by `teardownConnection`. Guards `sendEvent` so post-disconnect
  // calls (e.g. a React `useEffect` cleanup flushing queued events) are
  // logged and skipped instead of silently piling up in `pendingEvents`.
  let isTornDown = false

  // Outbound events queued while the data channel isn't yet open. Declared
  // here (rather than next to `sendEvent`) so `teardownConnection` — which
  // lives higher up and can run from the SDP-path catch before `sendEvent`
  // is defined — can drain it without hitting the TDZ.
  const pendingEvents: Array<Record<string, unknown>> = []

  // Tracks whether we've sent the first session.update. On the first update
  // we attach a default input_audio_transcription so the server will emit
  // user transcripts unless the caller opts out via
  // `providerOptions.inputAudioTranscription = null | false`.
  let hasSentInitialSessionUpdate = false

  // Size hints for the fallback buffers returned when an analyser isn't yet
  // populated. We return a *fresh* `Uint8Array` on each call so a caller
  // that draws into it (e.g. a canvas visualiser zeroing the buffer) can't
  // mutate a shared module-level instance for every other consumer.
  const FALLBACK_FREQUENCY_BIN_COUNT = 1024
  const FALLBACK_TIME_DOMAIN_SIZE = 2048
  const FALLBACK_TIME_DOMAIN_FILL = 128

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

  dataChannel = pc.createDataChannel('oai-events')

  let dataChannelOpened = false
  let rejectDataChannelReady: ((reason: unknown) => void) | null = null
  let dataChannelReadyTimeout: ReturnType<typeof setTimeout> | null = null

  const dataChannelReady = new Promise<void>((resolve, reject) => {
    rejectDataChannelReady = (reason) => {
      if (dataChannelReadyTimeout !== null) {
        clearTimeout(dataChannelReadyTimeout)
        dataChannelReadyTimeout = null
      }
      // One-shot: null out so later state transitions don't reject twice.
      rejectDataChannelReady = null
      reject(reason)
    }

    dataChannelReadyTimeout = setTimeout(() => {
      if (!dataChannelOpened) {
        rejectDataChannelReady?.(
          new Error(
            'Data channel did not open within 15000ms — aborting connection',
          ),
        )
      }
    }, 15000)

    dataChannel!.onopen = () => {
      dataChannelOpened = true
      if (dataChannelReadyTimeout !== null) {
        clearTimeout(dataChannelReadyTimeout)
        dataChannelReadyTimeout = null
      }
      // Once resolved, rejecting is a no-op — null out so teardown paths
      // don't attempt a redundant reject on an already-settled promise.
      rejectDataChannelReady = null
      flushPendingEvents()
      emit('status_change', { status: 'connected' as RealtimeStatus })
      resolve()
    }
  })

  dataChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      const messageRecord: Record<string, unknown> =
        message !== null && typeof message === 'object' ? message : {}
      logger.provider(
        `provider=grok direction=in type=${readString(messageRecord, 'type') ?? '<unknown>'}`,
        { frame: messageRecord },
      )
      handleServerEvent(messageRecord)
    } catch (parseErr) {
      logger.errors('grok.realtime fatal', {
        error: parseErr,
        source: 'grok.realtime',
      })
      emit('error', {
        error:
          parseErr instanceof Error ? parseErr : new Error(String(parseErr)),
      })
    }
  }

  dataChannel.onerror = (error) => {
    // Closing the peer connection cascades into `onerror`/`onclose` on the
    // data channel. Once teardown has started, re-surfacing those as
    // `emit('error')` is noise that confuses consumers (they just called
    // `disconnect()` — they don't want an error toast for it).
    if (isTornDown) return
    logger.errors('grok.realtime fatal', {
      error,
      source: 'grok.realtime',
    })
    // RTCErrorEvent exposes a typed `.error`; fall back to the event type
    // name, then to a string representation, so the emitted error message
    // doesn't end up as "[object Event]".
    // `onerror` always fires with an Event (often an RTCErrorEvent), so we
    // can read it via the untyped helpers without first proving object-ness.
    const errorRecord = error as unknown as Record<string, unknown>
    const rtcError = readObject(errorRecord, 'error')
    const msg =
      (rtcError && readString(rtcError, 'message')) ?? (error.type || 'unknown')
    const dcErr = new Error(`Data channel error: ${msg}`)
    if (!dataChannelOpened) {
      rejectDataChannelReady?.(dcErr)
    }
    emit('error', { error: dcErr })
  }

  dataChannel.onclose = () => {
    // Same rationale as `onerror` above: `pc.close()` during teardown
    // cascades to the data channel's `onclose`. If we've already started
    // teardown, there's nothing to do here.
    if (isTornDown) return
    if (!dataChannelOpened) {
      rejectDataChannelReady?.(new Error('Data channel closed before opening'))
    }
  }

  pc.ontrack = (event) => {
    if (event.track.kind === 'audio' && event.streams[0]) {
      setupOutputAudioAnalysis(event.streams[0])
    }
  }

  // `status_change` has a single source of truth: `onconnectionstatechange`
  // (the higher-level aggregate state). `oniceconnectionstatechange` is
  // responsible only for rejecting `dataChannelReady` on ICE failures so we
  // surface them without waiting for the 15s timeout.
  pc.onconnectionstatechange = () => {
    const state = pc.connectionState
    logger.provider(`provider=grok pc.connectionState=${state}`, {
      state,
    })
    if (state === 'failed' || state === 'disconnected' || state === 'closed') {
      // Suppress the `status_change` emission when teardown is in progress:
      // the user-facing `disconnect()` already emits `status_change: 'idle'`
      // and then calls `teardownConnection()` → `pc.close()`, which fires
      // `onconnectionstatechange` with state === 'closed'. Without this
      // guard listeners would see two `idle` events per disconnect.
      if (!isTornDown) {
        emit('status_change', {
          status:
            state === 'failed'
              ? ('error' as RealtimeStatus)
              : ('idle' as RealtimeStatus),
        })
      }
      if (!dataChannelOpened) {
        // Reject on any terminal-ish pre-open state so callers don't hang
        // for the full 15s timeout. The reject is one-shot — subsequent
        // state changes become no-ops via the null-out in
        // `rejectDataChannelReady`.
        const message =
          state === 'failed'
            ? `PeerConnection failed before data channel opened`
            : `PeerConnection entered state '${state}' before data channel opened`
        rejectDataChannelReady?.(new Error(message))
      }
      // Auto-teardown on `failed`: without this the mic track, pc, and
      // AudioContext stay allocated after a fatal connection failure, so the
      // browser's mic indicator stays on and the user sees a broken
      // "connected mic" state. `closed` already means pc was torn down
      // (usually by teardownConnection itself) so nothing extra to do.
      // `disconnected` is transient per the WebRTC spec and may recover, so
      // we leave resources in place. `teardownConnection` is idempotent so
      // a subsequent consumer `disconnect()` remains safe.
      if (state === 'failed' && !isTornDown) {
        void teardownConnection()
      }
    }
  }

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState
    logger.provider(`provider=grok pc.iceConnectionState=${state}`, {
      state,
    })
    if (
      !dataChannelOpened &&
      (state === 'failed' || state === 'closed' || state === 'disconnected')
    ) {
      const message =
        state === 'failed'
          ? `ICE connection failed before data channel opened`
          : `ICE connection entered state '${state}' before data channel opened`
      rejectDataChannelReady?.(new Error(message))
    }
  }

  /**
   * Tear down every resource we may have allocated so the mic/pc/audio
   * nodes/audio element don't leak on a failed connect. Safe to call from
   * any point after `new RTCPeerConnection()`; each branch null-guards and
   * swallows errors because cascading closes (e.g. `pc.close()` closing the
   * data channel implicitly) are expected.
   *
   * Shared between the SDP-path catch, the post-SDP catch, and (implicitly
   * via idempotency) the `disconnect()` entry point.
   */
  async function teardownConnection() {
    // Flip the teardown flag BEFORE any awaits so handlers that fire during
    // `await audioContext.close()` (or any other async step below) can guard
    // on it — otherwise a late `pc.onconnectionstatechange` or `pc.ontrack`
    // can allocate new resources or re-emit `status_change: idle` after the
    // user-facing `disconnect()` already emitted one.
    isTornDown = true

    // Drop any queued events the caller sent before the data channel opened
    // up front. Without this they'd accumulate across reconnect attempts
    // (each connect allocates a fresh closure, but a caller holding the old
    // `connection` reference could otherwise keep appending forever). Done
    // at the top — before the awaits below — so `sendEvent` calls racing
    // with teardown don't push into a list we're about to drain.
    pendingEvents.length = 0

    // Clear the data-channel-open timeout / reject the readiness promise
    // if it's still pending. `rejectDataChannelReady` is one-shot and nulls
    // itself on first call, so calling it from `disconnect()` after a
    // successful open is a no-op.
    rejectDataChannelReady?.(
      new Error('Connection torn down before data channel opened'),
    )

    if (localStream) {
      for (const track of localStream.getTracks()) {
        track.stop()
      }
      localStream = null
    }

    // Output audio (populated by `pc.ontrack` → setupOutputAudioAnalysis,
    // which may have fired during SDP negotiation before we threw).
    if (audioElement) {
      try {
        audioElement.pause()
      } catch {
        // ignore — element may already be unloaded
      }
      audioElement.srcObject = null
      audioElement = null
    }
    if (outputSource) {
      try {
        outputSource.disconnect()
      } catch {
        // ignore
      }
      outputSource = null
    }
    if (outputAnalyser) {
      try {
        outputAnalyser.disconnect()
      } catch {
        // ignore
      }
      outputAnalyser = null
    }

    // Input audio (populated by setupInputAudioAnalysis after SDP).
    if (inputSource) {
      try {
        inputSource.disconnect()
      } catch {
        // ignore
      }
      inputSource = null
    }
    if (inputAnalyser) {
      try {
        inputAnalyser.disconnect()
      } catch {
        // ignore
      }
      inputAnalyser = null
    }

    if (dataChannel) {
      try {
        dataChannel.close()
      } catch {
        // ignore — channel may already be closed by pc.close()
      }
      dataChannel = null
    }

    try {
      pc.close()
    } catch {
      // ignore — pc may already be closed
    }

    if (audioContext) {
      try {
        await audioContext.close()
      } catch {
        // ignore — context may already be closed
      }
      audioContext = null
    }
  }

  // xAI requires an audio track in the SDP offer, same as OpenAI realtime.
  //
  // This try/catch also covers `getUserMedia` failure (e.g. the user denies
  // microphone permission). `pc` + `dataChannel` are already allocated above
  // and the 15s `dataChannelReady` timeout is already armed, so we MUST
  // teardown on failure here — otherwise they leak until the tab closes.
  // `teardownConnection` is idempotent and null-safe (runs fine even if the
  // mic was never acquired).
  try {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 24000,
        },
      })
    } catch (error) {
      logger.errors('grok.realtime fatal', {
        error,
        source: 'grok.realtime.getUserMedia',
      })
      // Re-throw with the descriptive message callers rely on. Teardown runs
      // in the outer catch below.
      throw new Error(
        `Microphone access required for realtime voice: ${error instanceof Error ? error.message : error}`,
      )
    }

    for (const track of localStream.getAudioTracks()) {
      pc.addTrack(track, localStream)
    }

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    const sdpResponse = await fetch(`${GROK_REALTIME_URL}?model=${model}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token.token}`,
        'Content-Type': 'application/sdp',
      },
      body: offer.sdp,
    })

    if (!sdpResponse.ok) {
      const errorText = await sdpResponse.text()
      const error = new Error(
        `Failed to establish WebRTC connection: ${sdpResponse.status} - ${errorText}`,
      )
      logger.errors('grok.realtime fatal', {
        error,
        source: 'grok.realtime.sdp',
        status: sdpResponse.status,
      })
      throw error
    }

    const answerSdp = await sdpResponse.text()
    await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })
  } catch (err) {
    await teardownConnection()
    throw err
  }

  // Second cleanup scope: after SDP succeeds we still have to set up input
  // audio analysis and wait for the data channel to open. Both can fail
  // (AudioContext allocation, 15s timeout, ICE failure, pc.close from the
  // other end, etc.) and those failures must NOT leave the mic/pc/audio
  // nodes running.
  try {
    setupInputAudioAnalysis(localStream)
    await dataChannelReady
  } catch (err) {
    await teardownConnection()
    throw err
  }

  function handleServerEvent(event: Record<string, unknown>) {
    const type = readString(event, 'type')

    switch (type) {
      case 'session.created':
      case 'session.updated':
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
        break

      case 'conversation.item.input_audio_transcription.completed': {
        const transcript = readString(event, 'transcript')
        if (transcript === undefined) break
        emit('transcript', { role: 'user', transcript, isFinal: true })
        break
      }

      case 'response.created':
        // Reset message id so a tool-only response (which never emits
        // response.output_item.added for a message) can't reuse the previous
        // turn's id when `response.done` later inspects this flag.
        currentMessageId = null
        currentMode = 'thinking'
        emit('mode_change', { mode: 'thinking' })
        break

      case 'response.output_item.added': {
        const item = readObject(event, 'item')
        if (item && readString(item, 'type') === 'message') {
          const id = readString(item, 'id')
          if (id !== undefined) currentMessageId = id
        }
        break
      }

      // xAI realtime per docs uses `response.output_audio_transcript.*`;
      // accept the legacy OpenAI-realtime `response.audio_transcript.*` as
      // an alias so this adapter stays compatible across protocol versions.
      case 'response.output_audio_transcript.delta':
      case 'response.audio_transcript.delta': {
        const delta = readString(event, 'delta')
        if (delta === undefined) break
        emit('transcript', {
          role: 'assistant',
          transcript: delta,
          isFinal: false,
        })
        break
      }

      case 'response.output_audio_transcript.done':
      case 'response.audio_transcript.done': {
        const transcript = readString(event, 'transcript')
        if (transcript === undefined) break
        emit('transcript', { role: 'assistant', transcript, isFinal: true })
        break
      }

      // xAI realtime per docs uses `response.text.*`; accept the legacy
      // OpenAI-realtime `response.output_text.*` as an alias.
      case 'response.text.delta':
      case 'response.output_text.delta': {
        const delta = readString(event, 'delta')
        if (delta === undefined) break
        emit('transcript', {
          role: 'assistant',
          transcript: delta,
          isFinal: false,
        })
        break
      }

      case 'response.text.done':
      case 'response.output_text.done': {
        const text = readString(event, 'text')
        if (text === undefined) break
        emit('transcript', {
          role: 'assistant',
          transcript: text,
          isFinal: true,
        })
        break
      }

      // xAI realtime per docs uses `response.output_audio.*`; accept the
      // legacy OpenAI-realtime `response.audio.*` as an alias.
      case 'response.output_audio.delta':
      case 'response.audio.delta':
        if (currentMode !== 'speaking') {
          currentMode = 'speaking'
          emit('mode_change', { mode: 'speaking' })
        }
        break

      case 'response.output_audio.done':
      case 'response.audio.done':
        break

      case 'response.function_call_arguments.done': {
        // Only `call_id` is valid for `sendToolResult` correlation. Falling
        // back to `item_id` would produce a tool-call id the server doesn't
        // recognise when the result is posted back, silently dropping the
        // tool execution. If `call_id` is missing we surface an error event
        // so the UI can react instead of pretending the tool call succeeded.
        const callId = readString(event, 'call_id')
        const name = readString(event, 'name') ?? ''
        const args = readString(event, 'arguments') ?? ''
        if (!callId) {
          logger.errors(
            'grok.realtime tool_call missing call_id — dropping tool_call',
            {
              source: 'grok.realtime',
              event_type: 'response.function_call_arguments.done',
              item_id: event.item_id,
            },
          )
          emit('error', {
            error: new Error(
              'Realtime tool call missing call_id; tool will not execute',
            ),
          })
          break
        }
        try {
          const input = JSON.parse(args)
          emit('tool_call', { toolCallId: callId, toolName: name, input })
        } catch {
          emit('tool_call', { toolCallId: callId, toolName: name, input: args })
        }
        break
      }

      case 'response.done': {
        const response = readObject(event, 'response') ?? {}
        const output = readObjectArray(response, 'output')

        // Only transition back to `listening` if the user hasn't already
        // stopped capture — otherwise we'd override their explicit `idle`
        // state and re-arm the mic visualisation.
        if (currentMode !== 'idle') {
          currentMode = 'listening'
          emit('mode_change', { mode: 'listening' })
        }

        if (currentMessageId) {
          const message: RealtimeMessage = {
            id: currentMessageId,
            role: 'assistant',
            timestamp: Date.now(),
            parts: [],
          }

          for (const item of output ?? []) {
            if (readString(item, 'type') !== 'message') continue
            const content = readObjectArray(item, 'content')
            if (!content) continue
            for (const part of content) {
              const partType = readString(part, 'type')
              if (partType === 'audio') {
                const transcript = readString(part, 'transcript')
                if (transcript) {
                  message.parts.push({ type: 'audio', transcript })
                }
              } else if (partType === 'text') {
                const content = readString(part, 'text')
                if (content) {
                  message.parts.push({ type: 'text', content })
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
        // Assistant playback was interrupted — flip mode back to `listening`
        // unless the user already called `stopAudioCapture()` (idle). Without
        // this the visualisation would stay stuck on `speaking` even though
        // no audio is playing.
        if (currentMode !== 'idle') {
          currentMode = 'listening'
          emit('mode_change', { mode: 'listening' })
        }
        emit('interrupted', { messageId: currentMessageId ?? undefined })
        break

      case 'error': {
        // The realtime server's `error` envelope isn't guaranteed to carry
        // an `error` object at all (network-layer corruption, protocol
        // drift, etc.). Validate shape before dereferencing so a malformed
        // payload can't throw a TypeError inside this handler and stop the
        // switch from running for the rest of the session.
        const errorObj = readObject(event, 'error') ?? {}
        const message =
          readString(errorObj, 'message') ?? 'Unknown realtime server error'
        const err: RealtimeServerError = new Error(message)
        // Preserve `code` / `type` / `param` on the Error as extra props so
        // consumers can branch on them without re-parsing the raw event.
        const code = readString(errorObj, 'code')
        if (code !== undefined) err.code = code
        const errType = readString(errorObj, 'type')
        if (errType !== undefined) err.type = errType
        const param = readString(errorObj, 'param')
        if (param !== undefined) err.param = param
        logger.errors('grok.realtime server error', {
          ...errorObj,
          source: 'grok.realtime server',
        })
        emit('error', { error: err })
        break
      }

      default:
        // The xAI realtime protocol is a moving target; log unhandled event
        // types at provider level so they're visible during debugging without
        // emitting a user-visible error.
        logger.provider('grok.realtime unhandled server event', {
          type: event.type,
        })
        break
    }
  }

  function setupOutputAudioAnalysis(stream: MediaStream) {
    // Bail out if teardown has already started. `pc.ontrack` can fire
    // asynchronously after `teardownConnection()` has flipped `isTornDown`
    // (e.g. a remote track arriving mid-close); without this guard we'd
    // allocate a fresh AudioContext / audio element that nothing would ever
    // clean up.
    if (isTornDown) return

    // Tear down any prior output audio before allocating new resources.
    // `pc.ontrack` can fire multiple times over the lifetime of a session
    // (e.g. after renegotiation), and without this we'd leak audio elements
    // and analyser nodes.
    if (audioElement) {
      try {
        audioElement.pause()
      } catch {
        // ignore — element may already be unloaded
      }
      audioElement.srcObject = null
      audioElement = null
    }
    if (outputSource) {
      try {
        outputSource.disconnect()
      } catch {
        // ignore — may already be disconnected
      }
      outputSource = null
    }
    if (outputAnalyser) {
      try {
        outputAnalyser.disconnect()
      } catch {
        // ignore
      }
      outputAnalyser = null
    }

    audioElement = new Audio()
    audioElement.srcObject = stream
    audioElement.autoplay = true
    audioElement.play().catch((e) => {
      // Autoplay is commonly blocked until the user interacts with the page
      // (browser gesture requirement). Surfacing this as a fatal `error`
      // event makes the UI render a red/error state even though the
      // connection is healthy — the page just needs a click. Log at a
      // dedicated source tag so it's debuggable, but don't emit `error`.
      logger.errors('grok.realtime audio autoplay blocked', {
        error: e,
        source: 'grok.realtime.audio_permission_required',
      })
    })

    if (!audioContext) {
      audioContext = new AudioContext()
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        // Same rationale as the autoplay catch: `resume()` failure usually
        // means the user hasn't interacted yet. Logging only — no error
        // emit — so the UI doesn't go into a fatal state for a recoverable
        // condition.
        logger.errors('grok.realtime audioContext.resume failed', {
          error: err,
          source: 'grok.realtime',
        })
      })
    }

    outputAnalyser = audioContext.createAnalyser()
    outputAnalyser.fftSize = 2048
    outputAnalyser.smoothingTimeConstant = 0.3

    outputSource = audioContext.createMediaStreamSource(stream)
    outputSource.connect(outputAnalyser)
  }

  function setupInputAudioAnalysis(stream: MediaStream) {
    // Defensive symmetry with `setupOutputAudioAnalysis`. Today this is
    // only called inline after SDP negotiation, but keeping the guard
    // means any future caller path (e.g. renegotiation) won't leak a fresh
    // AudioContext after teardown.
    if (isTornDown) return

    if (!audioContext) {
      audioContext = new AudioContext()
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        // Same rationale as in setupOutputAudioAnalysis: a suspended
        // AudioContext usually resumes after a user gesture. Log only —
        // surfacing this as a fatal error makes the UI look broken for a
        // recoverable condition.
        logger.errors('grok.realtime audioContext.resume failed', {
          error: err,
          source: 'grok.realtime',
        })
      })
    }

    inputAnalyser = audioContext.createAnalyser()
    inputAnalyser.fftSize = 2048
    inputAnalyser.smoothingTimeConstant = 0.3

    inputSource = audioContext.createMediaStreamSource(stream)
    inputSource.connect(inputAnalyser)
  }

  function sendEvent(event: Record<string, unknown>) {
    if (isTornDown) {
      // The caller is holding onto a `connection` object after `disconnect()`
      // (or a failed connect). Silently queueing would leak memory and the
      // events would never flush. Log + drop so the misuse is visible in
      // debug mode without escalating to a throw — throwing from a React
      // useEffect cleanup path can break teardown ordering in the UI.
      logger.errors('grok.realtime sendEvent after disconnect', {
        eventType: readString(event, 'type') ?? '<unknown>',
        source: 'grok.realtime',
      })
      return
    }
    if (dataChannel?.readyState === 'open') {
      logger.provider(
        `provider=grok direction=out type=${readString(event, 'type') ?? '<unknown>'}`,
        { frame: event },
      )
      // Mirror the try/catch in `flushPendingEvents` — `dataChannel.send`
      // can synchronously throw if the channel flipped to `closing` between
      // our readyState check and this call, or if `JSON.stringify` chokes
      // on a caller-supplied payload. Log + emit error instead of letting
      // the exception propagate up through public `sendText` / `sendImage`
      // / `updateSession` call sites.
      try {
        dataChannel.send(JSON.stringify(event))
      } catch (error) {
        logger.errors('grok.realtime sendEvent failed', {
          error,
          eventType: readString(event, 'type') ?? '<unknown>',
          source: 'grok.realtime',
        })
        emit('error', {
          error: error instanceof Error ? error : new Error(String(error)),
        })
      }
    } else {
      pendingEvents.push(event)
    }
  }

  function flushPendingEvents() {
    try {
      for (const event of pendingEvents) {
        logger.provider(
          `provider=grok direction=out type=${readString(event, 'type') ?? '<unknown>'}`,
          { frame: event },
        )
        dataChannel!.send(JSON.stringify(event))
      }
      pendingEvents.length = 0
    } catch (error) {
      // A send failure here (e.g. dataChannel went from 'open' back to
      // 'closing' mid-flush, or JSON.stringify on a caller-provided event
      // threw) would otherwise be silently swallowed. By the time we're
      // called, `onopen` has already resolved `dataChannelReady`, so the
      // consumer-facing signal is `emit('error')` — try rejectDataChannelReady
      // as a defensive belt-and-braces in case this ever runs pre-resolve.
      logger.errors('grok.realtime flushPendingEvents failed', {
        error,
        source: 'grok.realtime',
      })
      const err = error instanceof Error ? error : new Error(String(error))
      rejectDataChannelReady?.(err)
      emit('error', { error: err })
    }
  }

  const connection: RealtimeConnection = {
    async disconnect() {
      // Reuse the same teardown path as the failed-connect branches so
      // every cleanup site stays in sync (input analyser, output analyser,
      // output source, audio element, etc.).
      await teardownConnection()
      emit('status_change', { status: 'idle' as RealtimeStatus })
    },

    async startAudioCapture() {
      if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          track.enabled = true
        }
      }
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          track.enabled = false
        }
      }
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
      sendEvent({ type: 'response.create' })
    },

    sendImage(imageData: string, mimeType: string) {
      // Accept:
      //  - http(s):// URLs → forward as-is
      //  - data: URIs (e.g. from FileReader.readAsDataURL) → forward as-is
      //    so we don't double-wrap into `data:image/png;base64,data:image/png;base64,…`
      //  - bare base64 → wrap in `data:${mimeType};base64,…`
      const isAlreadyUrlOrDataUri =
        imageData.startsWith('http://') ||
        imageData.startsWith('https://') ||
        imageData.startsWith('data:')
      const imageContent = {
        type: 'input_image',
        // The OpenAI-realtime content part (which this adapter mirrors) nests
        // the URL under an `image_url: { url: ... }` object, not a bare
        // string.
        image_url: {
          url: isAlreadyUrlOrDataUri
            ? imageData
            : `data:${mimeType};base64,${imageData}`,
        },
      }

      sendEvent({
        type: 'conversation.item.create',
        item: {
          type: 'message',
          role: 'user',
          content: [imageContent],
        },
      })
      sendEvent({ type: 'response.create' })
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
      const sessionUpdate: Record<string, unknown> = {}

      if (config.instructions) {
        sessionUpdate.instructions = config.instructions
      }

      if (config.voice) {
        sessionUpdate.voice = config.voice
      }

      if (config.vadMode) {
        if (config.vadMode === 'semantic') {
          sessionUpdate.turn_detection = {
            type: 'semantic_vad',
            eagerness: config.semanticEagerness ?? 'medium',
          }
        } else if (config.vadMode === 'server') {
          sessionUpdate.turn_detection = {
            type: 'server_vad',
            threshold: config.vadConfig?.threshold ?? 0.5,
            prefix_padding_ms: config.vadConfig?.prefixPaddingMs ?? 300,
            silence_duration_ms: config.vadConfig?.silenceDurationMs ?? 500,
          }
        } else {
          sessionUpdate.turn_detection = null
        }
      }

      if (config.tools !== undefined) {
        sessionUpdate.tools = config.tools.map((t) => ({
          type: 'function',
          name: t.name,
          description: t.description,
          parameters: t.inputSchema ?? { type: 'object', properties: {} },
        }))
        sessionUpdate.tool_choice = 'auto'
      }

      if (config.outputModalities) {
        sessionUpdate.modalities = config.outputModalities
      }

      if (config.temperature !== undefined) {
        sessionUpdate.temperature = config.temperature
      }

      if (config.maxOutputTokens !== undefined) {
        sessionUpdate.max_response_output_tokens = config.maxOutputTokens
      }

      // Let callers forward an explicit `input_audio_transcription` value
      // through `providerOptions` — including `null` / `false` to disable
      // the feature. Only apply our `grok-stt` default on the first
      // session.update and only if the caller hasn't set it themselves.
      const providerOptions: Record<string, unknown> =
        config.providerOptions ?? {}
      const callerTranscription =
        'inputAudioTranscription' in providerOptions
          ? providerOptions.inputAudioTranscription
          : 'input_audio_transcription' in providerOptions
            ? providerOptions.input_audio_transcription
            : undefined
      if (callerTranscription !== undefined) {
        sessionUpdate.input_audio_transcription =
          callerTranscription === false ? null : callerTranscription
      } else if (!hasSentInitialSessionUpdate) {
        sessionUpdate.input_audio_transcription = { model: 'grok-stt' }
      }

      if (Object.keys(sessionUpdate).length > 0) {
        sendEvent({
          type: 'session.update',
          session: sessionUpdate,
        })
        hasSentInitialSessionUpdate = true
      }
    },

    interrupt() {
      sendEvent({ type: 'response.cancel' })
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
      emit('interrupted', { messageId: currentMessageId ?? undefined })
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
      function calculateLevel(analyser: AnalyserNode): number {
        const data = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)

        let maxDeviation = 0
        for (const sample of data) {
          const deviation = Math.abs(sample - 128)
          if (deviation > maxDeviation) {
            maxDeviation = deviation
          }
        }

        const normalized = maxDeviation / 128
        return Math.min(1, normalized * 1.5)
      }

      return {
        get inputLevel() {
          if (!inputAnalyser) return 0
          return calculateLevel(inputAnalyser)
        },

        get outputLevel() {
          if (!outputAnalyser) return 0
          return calculateLevel(outputAnalyser)
        },

        getInputFrequencyData() {
          if (!inputAnalyser)
            return new Uint8Array(FALLBACK_FREQUENCY_BIN_COUNT)
          const data = new Uint8Array(inputAnalyser.frequencyBinCount)
          inputAnalyser.getByteFrequencyData(data)
          return data
        },

        getOutputFrequencyData() {
          if (!outputAnalyser)
            return new Uint8Array(FALLBACK_FREQUENCY_BIN_COUNT)
          const data = new Uint8Array(outputAnalyser.frequencyBinCount)
          outputAnalyser.getByteFrequencyData(data)
          return data
        },

        getInputTimeDomainData() {
          if (!inputAnalyser)
            return new Uint8Array(FALLBACK_TIME_DOMAIN_SIZE).fill(
              FALLBACK_TIME_DOMAIN_FILL,
            )
          const data = new Uint8Array(inputAnalyser.fftSize)
          inputAnalyser.getByteTimeDomainData(data)
          return data
        },

        getOutputTimeDomainData() {
          if (!outputAnalyser)
            return new Uint8Array(FALLBACK_TIME_DOMAIN_SIZE).fill(
              FALLBACK_TIME_DOMAIN_FILL,
            )
          const data = new Uint8Array(outputAnalyser.fftSize)
          outputAnalyser.getByteTimeDomainData(data)
          return data
        },

        get inputSampleRate() {
          return 24000
        },

        get outputSampleRate() {
          return 24000
        },
      }
    },
  }

  // `dataChannelReady` was already awaited inside the post-SDP try/catch
  // above so we can short-circuit on failures with full teardown.
  return connection
}
