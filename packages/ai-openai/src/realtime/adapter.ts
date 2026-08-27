import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { buildSessionUpdate } from './session-update'
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
    ): Promise<RealtimeConnection> {
      const model = token.config.model ?? 'gpt-realtime'
      logger.request(`activity=realtime provider=openai model=${model}`, {
        provider: 'openai',
        model,
      })

      if (connectionMode === 'webrtc') {
        return createWebRTCConnection(token, logger)
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
 * Creates a WebRTC connection to OpenAI's realtime API
 */
async function createWebRTCConnection(
  token: RealtimeToken,
  logger: InternalLogger,
): Promise<RealtimeConnection> {
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()

  // WebRTC peer connection
  const pc = new RTCPeerConnection()

  // Audio context for visualization
  let audioContext: AudioContext | null = null
  let inputAnalyser: AnalyserNode | null = null
  let outputAnalyser: AnalyserNode | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let outputSource: MediaStreamAudioSourceNode | null = null
  let localStream: MediaStream | null = null

  // Audio element for playback (more reliable than AudioContext.destination)
  let audioElement: HTMLAudioElement | null = null

  // Data channel for events (assigned at construction below; nulled out by teardown)
  let dataChannel: RTCDataChannel | null = null

  // Current state
  let currentMode: RealtimeMode = 'idle'
  let currentMessageId: string | null = null

  // Empty arrays for when visualization isn't available
  // frequencyBinCount = fftSize / 2 = 1024
  const emptyFrequencyData = new Uint8Array(1024)
  const emptyTimeDomainData = new Uint8Array(2048).fill(128) // 128 is silence

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

  const channel = pc.createDataChannel('oai-events')
  dataChannel = channel

  // Promise that resolves when the data channel is open and ready
  const dataChannelReady = new Promise<void>((resolve) => {
    channel.onopen = () => {
      flushPendingEvents()
      emit('status_change', { status: 'connected' })
      resolve()
    }
  })

  channel.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      logger.provider(
        `provider=openai direction=in type=${(message as { type?: string }).type ?? '<unknown>'}`,
        { frame: message },
      )
      handleServerEvent(message)
    } catch (e) {
      logger.errors('openai.realtime fatal', {
        error: e,
        source: 'openai.realtime',
      })
    }
  }

  channel.onerror = (error) => {
    logger.errors('openai.realtime fatal', {
      error,
      source: 'openai.realtime',
    })
    emit('error', { error: new Error(`Data channel error: ${error}`) })
  }

  // Handle incoming audio track
  pc.ontrack = (event) => {
    if (event.track.kind === 'audio' && event.streams[0]) {
      setupOutputAudioAnalysis(event.streams[0])
    }
  }

  // IMPORTANT: Request microphone access and add audio track BEFORE creating offer
  // OpenAI's Realtime API requires an audio track in the SDP offer
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 24000,
      },
    })

    // Add audio track to peer connection
    const offerAudioTracks = localStream.getAudioTracks()
    for (const track of offerAudioTracks) {
      pc.addTrack(track, localStream)
    }
  } catch (error) {
    throw new Error(
      `Microphone access required for realtime voice: ${error instanceof Error ? error.message : error}`,
    )
  }

  // Create and set local description (now includes audio track)
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)

  const sdpResponse = await fetch(`${OPENAI_REALTIME_URL}/calls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token.token}`,
      'Content-Type': 'application/sdp',
    },
    body: offer.sdp ?? null,
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

  const answerSdp = await sdpResponse.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  // Set up input audio analysis now that we have the stream
  setupInputAudioAnalysis(localStream)

  function setRealtimeMode(mode: RealtimeMode) {
    currentMode = mode
    emit('mode_change', { mode })
  }

  function emitAssistantTranscript(text: string, isFinal: boolean) {
    emit('transcript', { role: 'assistant', transcript: text, isFinal })
  }

  function handleFunctionCallDone(event: Record<string, unknown>) {
    // Realtime payloads include both call_id and item_id; some sessions omit one.
    const callId = (event['call_id'] ?? event['item_id']) as string | undefined
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
      return
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
  }

  function appendOpenAIRealtimePart(
    message: RealtimeMessage,
    part: Record<string, unknown>,
  ) {
    // GA renamed assistant content types: `audio` -> `output_audio`,
    // `text` -> `output_text`
    if (part.type === 'output_audio' && part.transcript) {
      message.parts.push({
        type: 'audio',
        transcript: part.transcript as string,
      })
      return
    }
    if (part.type === 'output_text' && part.text) {
      message.parts.push({
        type: 'text',
        content: part.text as string,
      })
    }
  }

  function handleResponseDone(event: Record<string, unknown>) {
    const response = event.response as Record<string, unknown>
    const output = response.output as Array<Record<string, unknown>> | undefined

    setRealtimeMode('listening')
    if (!currentMessageId) return

    const message: RealtimeMessage = {
      id: currentMessageId,
      role: 'assistant',
      timestamp: Date.now(),
      parts: [],
    }
    for (const item of output || []) {
      const isMessageItem = item.type === 'message' && item.content
      if (!isMessageItem) continue
      const content = item.content as Array<Record<string, unknown>>
      for (const part of content) appendOpenAIRealtimePart(message, part)
    }
    emit('message_complete', { message })
    currentMessageId = null
  }

  const openaiServerEventHandlers: Record<
    string,
    (event: Record<string, unknown>) => void
  > = {
    'session.created': () => {},
    'session.updated': () => {},
    'input_audio_buffer.speech_started': () => setRealtimeMode('listening'),
    'input_audio_buffer.speech_stopped': () => setRealtimeMode('thinking'),
    'input_audio_buffer.committed': () => {},
    'conversation.item.input_audio_transcription.completed': (event) => {
      emit('transcript', {
        role: 'user',
        transcript: event.transcript as string,
        isFinal: true,
      })
    },
    'response.created': () => setRealtimeMode('thinking'),
    'response.output_item.added': (event) => {
      const item = event.item as Record<string, unknown>
      if (item.type === 'message') currentMessageId = item.id as string
    },
    'response.output_audio_transcript.delta': (event) =>
      emitAssistantTranscript(event.delta as string, false),
    'response.output_audio_transcript.done': (event) =>
      emitAssistantTranscript(event.transcript as string, true),
    'response.output_text.delta': (event) =>
      emitAssistantTranscript(event.delta as string, false),
    'response.output_text.done': (event) =>
      emitAssistantTranscript(event.text as string, true),
    'response.output_audio.delta': () => {
      if (currentMode !== 'speaking') setRealtimeMode('speaking')
    },
    'response.output_audio.done': () => {},
    'response.function_call_arguments.done': handleFunctionCallDone,
    'response.done': handleResponseDone,
    'conversation.item.truncated': () => {
      emit(
        'interrupted',
        currentMessageId ? { messageId: currentMessageId } : {},
      )
    },
    error: (event) => {
      const error = event.error as Record<string, unknown>
      emit('error', {
        error: new Error((error.message as string) || 'Unknown error'),
      })
    },
  }

  function handleServerEvent(event: Record<string, unknown>) {
    const type = event.type as string
    const handler = openaiServerEventHandlers[type]
    if (handler) handler(event)
  }

  // Set up audio analysis for output
  function setupOutputAudioAnalysis(stream: MediaStream) {
    // Create audio element for playback - this is the standard way to play WebRTC audio
    audioElement = new Audio()
    audioElement.srcObject = stream
    audioElement.autoplay = true
    // Some browsers require this for autoplay
    audioElement.play().catch((e) => {
      logger.errors('openai.realtime audio autoplay failed', {
        error: e,
        source: 'openai.realtime',
      })
    })

    // Set up AudioContext for visualization only (not playback)
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    // Resume AudioContext if suspended (browsers require user interaction)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // Ignore - visualization just won't work
      })
    }

    outputAnalyser = audioContext.createAnalyser()
    outputAnalyser.fftSize = 2048 // Larger size for more accurate level detection
    outputAnalyser.smoothingTimeConstant = 0.3

    outputSource = audioContext.createMediaStreamSource(stream)
    outputSource.connect(outputAnalyser)
    // Don't connect to destination - the Audio element handles playback
  }

  // Set up audio analysis for input
  function setupInputAudioAnalysis(stream: MediaStream) {
    if (!audioContext) {
      audioContext = new AudioContext()
    }

    // Resume AudioContext if suspended (browsers require user interaction)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // Ignore - visualization just won't work
      })
    }

    inputAnalyser = audioContext.createAnalyser()
    inputAnalyser.fftSize = 2048 // Larger size for more accurate level detection
    inputAnalyser.smoothingTimeConstant = 0.3

    inputSource = audioContext.createMediaStreamSource(stream)
    inputSource.connect(inputAnalyser)
  }

  // Queue for events sent before the data channel is open
  const pendingEvents: Array<Record<string, unknown>> = []

  // Send event to server (queues if data channel not yet open)
  function sendEvent(event: Record<string, unknown>) {
    if (dataChannel?.readyState === 'open') {
      logger.provider(
        `provider=openai direction=out type=${(event.type as string | undefined) ?? '<unknown>'}`,
        { frame: event },
      )
      dataChannel.send(JSON.stringify(event))
    } else {
      pendingEvents.push(event)
    }
  }

  // Flush any queued events (called when data channel opens)
  function flushPendingEvents() {
    for (const event of pendingEvents) {
      logger.provider(
        `provider=openai direction=out type=${(event.type as string | undefined) ?? '<unknown>'}`,
        { frame: event },
      )
      channel.send(JSON.stringify(event))
    }
    pendingEvents.length = 0
  }

  // Connection implementation
  const connection: RealtimeConnection = {
    async disconnect() {
      if (localStream) {
        const mediaTracks = localStream.getTracks()
        for (const track of mediaTracks) {
          track.stop()
        }
        localStream = null
      }

      if (audioElement) {
        audioElement.pause()
        audioElement.srcObject = null
        audioElement = null
      }

      if (dataChannel) {
        dataChannel.close()
        dataChannel = null
      }

      pc.close()

      if (audioContext) {
        await audioContext.close()
        audioContext = null
      }

      emit('status_change', { status: 'idle' })
    },

    async startAudioCapture() {
      // Audio capture is established during connection setup
      // This method enables the tracks and signals listening mode
      if (localStream) {
        const captureTracks = localStream.getAudioTracks()
        for (const track of captureTracks) {
          track.enabled = true
        }
      }
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      // Disable tracks rather than stopping them to allow re-enabling
      if (localStream) {
        const captureTracks = localStream.getAudioTracks()
        for (const track of captureTracks) {
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

    getAudioVisualization(): AudioVisualization {
      // Helper to calculate audio level from time domain data
      // Uses peak amplitude which is more responsive for voice audio meters
      function calculateLevel(analyser: AnalyserNode): number {
        const data = new Uint8Array(analyser.fftSize)
        analyser.getByteTimeDomainData(data)

        // Find peak deviation from center (128 is silence)
        // This is more responsive than RMS for voice level meters
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

  // Wait for the data channel to be open before returning the connection.
  // This ensures session.update (tools, instructions, etc.) can be sent immediately.
  await dataChannelReady

  return connection
}
