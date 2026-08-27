import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { GROK_DEFAULT_REALTIME_MODEL } from '../model-meta'
import type {
  AnyClientTool,
  AudioVisualization,
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

function applyVadMode(
  sessionUpdate: Record<string, unknown>,
  config: Partial<RealtimeSessionConfig>,
): void {
  if (!config.vadMode) return
  if (config.vadMode === 'semantic') {
    sessionUpdate.turn_detection = {
      type: 'semantic_vad',
      eagerness: config.semanticEagerness ?? 'medium',
    }
    return
  }
  if (config.vadMode === 'server') {
    sessionUpdate.turn_detection = {
      type: 'server_vad',
      threshold: config.vadConfig?.threshold ?? 0.5,
      prefix_padding_ms: config.vadConfig?.prefixPaddingMs ?? 300,
      silence_duration_ms: config.vadConfig?.silenceDurationMs ?? 500,
    }
    return
  }
  sessionUpdate.turn_detection = null
}

function applyRealtimeTools(
  sessionUpdate: Record<string, unknown>,
  config: Partial<RealtimeSessionConfig>,
): void {
  if (config.tools === undefined) return
  sessionUpdate.tools = config.tools.map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.inputSchema ?? { type: 'object', properties: {} },
  }))
  sessionUpdate.tool_choice = 'auto'
}

function applyGrokTranscription(
  sessionUpdate: Record<string, unknown>,
  config: Partial<RealtimeSessionConfig>,
  hasSentInitialSessionUpdate: boolean,
): void {
  const providerOptions: Record<string, unknown> = config.providerOptions ?? {}
  const callerTranscription =
    'inputAudioTranscription' in providerOptions
      ? providerOptions.inputAudioTranscription
      : 'input_audio_transcription' in providerOptions
        ? providerOptions.input_audio_transcription
        : undefined
  if (callerTranscription !== undefined) {
    sessionUpdate.input_audio_transcription =
      callerTranscription === false ? null : callerTranscription
    return
  }
  if (!hasSentInitialSessionUpdate) {
    sessionUpdate.input_audio_transcription = { model: 'grok-stt' }
  }
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
      const model = token.config.model ?? GROK_DEFAULT_REALTIME_MODEL
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
  const model = token.config.model ?? GROK_DEFAULT_REALTIME_MODEL
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()

  const pc = new RTCPeerConnection()

  let audioContext: AudioContext | null = null
  let inputAnalyser: AnalyserNode | null = null
  let outputAnalyser: AnalyserNode | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let outputSource: MediaStreamAudioSourceNode | null = null
  let localStream: MediaStream | null = null

  let audioElement: HTMLAudioElement | null = null

  const channel = pc.createDataChannel('oai-events')
  let dataChannel: RTCDataChannel | null = channel

  let currentMode: RealtimeMode = 'idle'
  let currentMessageId: string | null = null

  let isTornDown = false

  const pendingEvents: Array<Record<string, unknown>> = []

  let hasSentInitialSessionUpdate = false

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

    channel.onopen = () => {
      dataChannelOpened = true
      if (dataChannelReadyTimeout !== null) {
        clearTimeout(dataChannelReadyTimeout)
        dataChannelReadyTimeout = null
      }
      // Once resolved, rejecting is a no-op — null out so teardown paths
      // don't attempt a redundant reject on an already-settled promise.
      rejectDataChannelReady = null
      flushPendingEvents()
      emit('status_change', { status: 'connected' })
      resolve()
    }
  })

  channel.onmessage = (event) => {
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

  channel.onerror = (error) => {
    if (isTornDown) return
    logger.errors('grok.realtime fatal', {
      error,
      source: 'grok.realtime',
    })
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- RTCErrorEvent is a typed DOM class that does not structurally overlap Record<string, unknown>; we duck-type it via readObject/readString
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

  channel.onclose = () => {
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

  pc.onconnectionstatechange = () => {
    const state = pc.connectionState
    logger.provider(`provider=grok pc.connectionState=${state}`, {
      state,
    })
    const isConnectionLost =
      state === 'failed' || state === 'disconnected' || state === 'closed'
    if (isConnectionLost) {
      if (!isTornDown) {
        emit('status_change', {
          status: state === 'failed' ? 'error' : 'idle',
        })
      }
      if (!dataChannelOpened) {
        const message =
          state === 'failed'
            ? `PeerConnection failed before data channel opened`
            : `PeerConnection entered state '${state}' before data channel opened`
        rejectDataChannelReady?.(new Error(message))
      }
      const shouldTeardownOnFailure = state === 'failed' && !isTornDown
      if (shouldTeardownOnFailure) {
        void teardownConnection()
      }
    }
  }

  pc.oniceconnectionstatechange = () => {
    const state = pc.iceConnectionState
    logger.provider(`provider=grok pc.iceConnectionState=${state}`, {
      state,
    })
    const iceFailedBeforeOpen =
      !dataChannelOpened &&
      (state === 'failed' || state === 'closed' || state === 'disconnected')
    if (iceFailedBeforeOpen) {
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
    isTornDown = true

    pendingEvents.length = 0

    rejectDataChannelReady?.(
      new Error('Connection torn down before data channel opened'),
    )

    if (localStream) {
      const tracks = localStream.getTracks()
      for (const track of tracks) {
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

    const captureTracks = localStream.getAudioTracks()
    for (const track of captureTracks) {
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

  try {
    setupInputAudioAnalysis(localStream)
    await dataChannelReady
  } catch (err) {
    await teardownConnection()
    throw err
  }

  function setRealtimeMode(mode: RealtimeMode) {
    currentMode = mode
    emit('mode_change', { mode })
  }

  function emitAssistantTranscript(text: string | undefined, isFinal: boolean) {
    if (text === undefined) return
    emit('transcript', { role: 'assistant', transcript: text, isFinal })
  }

  function listenUnlessIdle() {
    if (currentMode !== 'idle') setRealtimeMode('listening')
  }

  function handleOutputItemAdded(event: Record<string, unknown>) {
    const item = readObject(event, 'item')
    if (!item) return
    if (readString(item, 'type') !== 'message') return
    const id = readString(item, 'id')
    if (id !== undefined) currentMessageId = id
  }

  function handleFunctionCallDone(event: Record<string, unknown>) {
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
      return
    }
    try {
      const input = JSON.parse(args)
      emit('tool_call', { toolCallId: callId, toolName: name, input })
    } catch {
      emit('tool_call', { toolCallId: callId, toolName: name, input: args })
    }
  }

  function appendRealtimePart(
    message: RealtimeMessage,
    part: Record<string, unknown>,
  ) {
    const partType = readString(part, 'type')
    if (partType === 'audio') {
      const transcript = readString(part, 'transcript')
      if (transcript) message.parts.push({ type: 'audio', transcript })
      return
    }
    if (partType === 'text') {
      const text = readString(part, 'text')
      if (text) message.parts.push({ type: 'text', content: text })
    }
  }

  function completeRealtimeMessage(
    output: Array<Record<string, unknown>> | undefined,
  ) {
    if (!currentMessageId) return
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
      for (const part of content) appendRealtimePart(message, part)
    }
    emit('message_complete', { message })
    currentMessageId = null
  }

  function handleResponseDone(event: Record<string, unknown>) {
    const response = readObject(event, 'response') ?? {}
    listenUnlessIdle()
    completeRealtimeMessage(readObjectArray(response, 'output'))
  }

  function handleTruncated() {
    listenUnlessIdle()
    emit('interrupted', {
      ...(currentMessageId !== null && { messageId: currentMessageId }),
    })
  }

  function handleServerError(event: Record<string, unknown>) {
    const errorObj = readObject(event, 'error') ?? {}
    const message =
      readString(errorObj, 'message') ?? 'Unknown realtime server error'
    const err: RealtimeServerError = new Error(message)
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
  }

  const grokServerEventHandlers: Record<
    string,
    (event: Record<string, unknown>) => void
  > = {
    'session.created': () => {},
    'session.updated': () => {},
    'input_audio_buffer.speech_started': () => setRealtimeMode('listening'),
    'input_audio_buffer.speech_stopped': () => setRealtimeMode('thinking'),
    'input_audio_buffer.committed': () => {},
    'conversation.item.input_audio_transcription.completed': (event) => {
      const transcript = readString(event, 'transcript')
      if (transcript === undefined) return
      emit('transcript', { role: 'user', transcript, isFinal: true })
    },
    'response.created': () => {
      currentMessageId = null
      setRealtimeMode('thinking')
    },
    'response.output_item.added': handleOutputItemAdded,
    'response.output_audio_transcript.delta': (event) =>
      emitAssistantTranscript(readString(event, 'delta'), false),
    'response.audio_transcript.delta': (event) =>
      emitAssistantTranscript(readString(event, 'delta'), false),
    'response.output_audio_transcript.done': (event) =>
      emitAssistantTranscript(readString(event, 'transcript'), true),
    'response.audio_transcript.done': (event) =>
      emitAssistantTranscript(readString(event, 'transcript'), true),
    // xAI realtime per docs uses `response.text.*`; accept the legacy
    // OpenAI-realtime `response.output_text.*` as an alias.
    'response.text.delta': (event) =>
      emitAssistantTranscript(readString(event, 'delta'), false),
    'response.output_text.delta': (event) =>
      emitAssistantTranscript(readString(event, 'delta'), false),
    'response.text.done': (event) =>
      emitAssistantTranscript(readString(event, 'text'), true),
    'response.output_text.done': (event) =>
      emitAssistantTranscript(readString(event, 'text'), true),
    // xAI realtime per docs uses `response.output_audio.*`; accept the
    // legacy OpenAI-realtime `response.audio.*` as an alias.
    'response.output_audio.delta': () => {
      if (currentMode !== 'speaking') setRealtimeMode('speaking')
    },
    'response.audio.delta': () => {
      if (currentMode !== 'speaking') setRealtimeMode('speaking')
    },
    'response.output_audio.done': () => {},
    'response.audio.done': () => {},
    'response.function_call_arguments.done': handleFunctionCallDone,
    'response.done': handleResponseDone,
    'conversation.item.truncated': handleTruncated,
    error: handleServerError,
  }

  function handleServerEvent(event: Record<string, unknown>) {
    const type = readString(event, 'type')
    const handler =
      type === undefined ? undefined : grokServerEventHandlers[type]
    if (handler) {
      handler(event)
      return
    }
    logger.provider('grok.realtime unhandled server event', {
      type: event.type,
    })
  }

  function setupOutputAudioAnalysis(stream: MediaStream) {
    if (isTornDown) return

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
    if (isTornDown) return

    if (!audioContext) {
      audioContext = new AudioContext()
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch((err) => {
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
        channel.send(JSON.stringify(event))
      }
      pendingEvents.length = 0
    } catch (error) {
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
      await teardownConnection()
      emit('status_change', { status: 'idle' })
    },

    async startAudioCapture() {
      if (localStream) {
        const audioTracks = localStream.getAudioTracks()
        for (const track of audioTracks) {
          track.enabled = true
        }
      }
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      if (localStream) {
        const audioTracks = localStream.getAudioTracks()
        for (const track of audioTracks) {
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
      const isWrappedImage =
        imageData.startsWith('http://') ||
        imageData.startsWith('https://') ||
        imageData.startsWith('data:')
      const imageContent = {
        type: 'input_image',
        image_url: {
          url: isWrappedImage
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

      applyVadMode(sessionUpdate, config)
      applyRealtimeTools(sessionUpdate, config)

      if (config.outputModalities) {
        sessionUpdate.modalities = config.outputModalities
      }

      if (config.temperature !== undefined) {
        sessionUpdate.temperature = config.temperature
      }

      if (config.maxOutputTokens !== undefined) {
        sessionUpdate.max_response_output_tokens = config.maxOutputTokens
      }

      applyGrokTranscription(sessionUpdate, config, hasSentInitialSessionUpdate)

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
      emit('interrupted', {
        ...(currentMessageId !== null && { messageId: currentMessageId }),
      })
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
