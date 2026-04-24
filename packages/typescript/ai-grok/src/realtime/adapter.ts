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
import type { GrokRealtimeOptions } from './types'

const GROK_REALTIME_URL = 'https://api.x.ai/v1/realtime'

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

  // Tracks whether we've sent the first session.update. On the first update
  // we attach a default input_audio_transcription so the server will emit
  // user transcripts unless the caller opts out via
  // `providerOptions.inputAudioTranscription = null | false`.
  let hasSentInitialSessionUpdate = false

  const emptyFrequencyData = new Uint8Array(1024)
  const emptyTimeDomainData = new Uint8Array(2048).fill(128)

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
      logger.provider(
        `provider=grok direction=in type=${(message as { type?: string }).type ?? '<unknown>'}`,
        { frame: message },
      )
      handleServerEvent(message)
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
    logger.errors('grok.realtime fatal', {
      error,
      source: 'grok.realtime',
    })
    // RTCErrorEvent exposes a typed `.error`; fall back to the event type
    // name, then to a string representation, so the emitted error message
    // doesn't end up as "[object Event]".
    const rtcError = (error as { error?: { message?: string } }).error
    const msg =
      rtcError?.message ??
      (error instanceof Event ? error.type : String(error))
    const dcErr = new Error(`Data channel error: ${msg}`)
    if (!dataChannelOpened) {
      rejectDataChannelReady?.(dcErr)
    }
    emit('error', { error: dcErr })
  }

  dataChannel.onclose = () => {
    if (!dataChannelOpened) {
      rejectDataChannelReady?.(
        new Error('Data channel closed before opening'),
      )
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
      emit('status_change', {
        status:
          state === 'failed' ? ('error' as RealtimeStatus) : ('idle' as RealtimeStatus),
      })
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
    }
  }

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState
    logger.provider(`provider=grok pc.iceConnectionState=${state}`, {
      state,
    })
    if (
      !dataChannelOpened &&
      (state === 'failed' ||
        state === 'closed' ||
        state === 'disconnected')
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
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 24000,
      },
    })

    for (const track of localStream.getAudioTracks()) {
      pc.addTrack(track, localStream)
    }
  } catch (error) {
    logger.errors('grok.realtime fatal', {
      error,
      source: 'grok.realtime.getUserMedia',
    })
    throw new Error(
      `Microphone access required for realtime voice: ${error instanceof Error ? error.message : error}`,
    )
  }

  // If anything between here and the completed remote-description fails we
  // must tear down the already-acquired microphone, data channel, and peer
  // connection — otherwise the mic indicator stays on forever.
  try {
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
    const type = event.type as string

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
        const transcript = event.transcript as string
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
        const item = event.item as Record<string, unknown>
        if (item.type === 'message') {
          currentMessageId = item.id as string
        }
        break
      }

      case 'response.audio_transcript.delta': {
        const delta = event.delta as string
        emit('transcript', {
          role: 'assistant',
          transcript: delta,
          isFinal: false,
        })
        break
      }

      case 'response.audio_transcript.done': {
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

      case 'response.audio.delta':
        if (currentMode !== 'speaking') {
          currentMode = 'speaking'
          emit('mode_change', { mode: 'speaking' })
        }
        break

      case 'response.audio.done':
        break

      case 'response.function_call_arguments.done': {
        const callId = (event.call_id ?? event.item_id) as string | undefined
        const name = event.name as string
        const args = event.arguments as string
        if (!callId) {
          logger.errors(
            'grok.realtime function_call_arguments.done missing call_id/item_id',
            { event, source: 'grok.realtime' },
          )
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
        const response = event.response as Record<string, unknown>
        const output = response.output as
          | Array<Record<string, unknown>>
          | undefined

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

          for (const item of output || []) {
            if (item.type === 'message' && item.content) {
              const content = item.content as Array<Record<string, unknown>>
              for (const part of content) {
                if (part.type === 'audio' && part.transcript) {
                  message.parts.push({
                    type: 'audio',
                    transcript: part.transcript as string,
                  })
                } else if (part.type === 'text' && part.text) {
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
        emit('interrupted', { messageId: currentMessageId ?? undefined })
        break

      case 'error': {
        const error = event.error as Record<string, unknown>
        const err = new Error((error.message as string) || 'Unknown error')
        logger.errors('grok.realtime server error', {
          error: err,
          source: 'grok.realtime',
          event,
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
      logger.errors('grok.realtime audio autoplay failed', {
        error: e,
        source: 'grok.realtime',
      })
      emit('error', {
        error: e instanceof Error ? e : new Error(String(e)),
      })
    })

    if (!audioContext) {
      audioContext = new AudioContext()
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        logger.errors('grok.realtime audioContext.resume failed', {
          error: err,
          source: 'grok.realtime',
        })
        emit('error', {
          error: err instanceof Error ? err : new Error(String(err)),
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
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
        logger.errors('grok.realtime audioContext.resume failed', {
          error: err,
          source: 'grok.realtime',
        })
        emit('error', {
          error: err instanceof Error ? err : new Error(String(err)),
        })
      })
    }

    inputAnalyser = audioContext.createAnalyser()
    inputAnalyser.fftSize = 2048
    inputAnalyser.smoothingTimeConstant = 0.3

    inputSource = audioContext.createMediaStreamSource(stream)
    inputSource.connect(inputAnalyser)
  }

  const pendingEvents: Array<Record<string, unknown>> = []

  function sendEvent(event: Record<string, unknown>) {
    if (dataChannel?.readyState === 'open') {
      logger.provider(
        `provider=grok direction=out type=${(event.type as string | undefined) ?? '<unknown>'}`,
        { frame: event },
      )
      dataChannel.send(JSON.stringify(event))
    } else {
      pendingEvents.push(event)
    }
  }

  function flushPendingEvents() {
    for (const event of pendingEvents) {
      logger.provider(
        `provider=grok direction=out type=${(event.type as string | undefined) ?? '<unknown>'}`,
        { frame: event },
      )
      dataChannel!.send(JSON.stringify(event))
    }
    pendingEvents.length = 0
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
      const providerOptions = config.providerOptions ?? {}
      const callerTranscription =
        'inputAudioTranscription' in providerOptions
          ? providerOptions.inputAudioTranscription
          : 'input_audio_transcription' in providerOptions
            ? (providerOptions as Record<string, unknown>)
                .input_audio_transcription
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
          if (!inputAnalyser) return emptyFrequencyData
          const data = new Uint8Array(inputAnalyser.frequencyBinCount)
          inputAnalyser.getByteFrequencyData(data)
          return data
        },

        getOutputFrequencyData() {
          if (!outputAnalyser) return emptyFrequencyData
          const data = new Uint8Array(outputAnalyser.frequencyBinCount)
          outputAnalyser.getByteFrequencyData(data)
          return data
        },

        getInputTimeDomainData() {
          if (!inputAnalyser) return emptyTimeDomainData
          const data = new Uint8Array(inputAnalyser.fftSize)
          inputAnalyser.getByteTimeDomainData(data)
          return data
        },

        getOutputTimeDomainData() {
          if (!outputAnalyser) return emptyTimeDomainData
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
