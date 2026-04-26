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
      const model = token.config.model ?? 'gpt-4o-realtime-preview'
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
  const model = token.config.model ?? 'gpt-4o-realtime-preview'
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

  // Data channel for events
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

  // Set up data channel for bidirectional communication
  dataChannel = pc.createDataChannel('oai-events')

  // Promise that resolves when the data channel is open and ready
  const dataChannelReady = new Promise<void>((resolve) => {
    dataChannel!.onopen = () => {
      flushPendingEvents()
      emit('status_change', { status: 'connected' as RealtimeStatus })
      resolve()
    }
  })

  dataChannel.onmessage = (event) => {
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

  dataChannel.onerror = (error) => {
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
    for (const track of localStream.getAudioTracks()) {
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

  // Send SDP to OpenAI and get answer
  const sdpResponse = await fetch(`${OPENAI_REALTIME_URL}?model=${model}`, {
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
        // Realtime payloads include both call_id and item_id; some sessions omit one.
        const callId = (event.call_id ?? event.item_id) as string | undefined
        const name = event.name as string
        const args = event.arguments as string
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
        emit('error', {
          error: new Error((error.message as string) || 'Unknown error'),
        })
        break
      }
    }
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
      dataChannel!.send(JSON.stringify(event))
    }
    pendingEvents.length = 0
  }

  // Connection implementation
  const connection: RealtimeConnection = {
    async disconnect() {
      if (localStream) {
        for (const track of localStream.getTracks()) {
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

      emit('status_change', { status: 'idle' as RealtimeStatus })
    },

    async startAudioCapture() {
      // Audio capture is established during connection setup
      // This method enables the tracks and signals listening mode
      if (localStream) {
        for (const track of localStream.getAudioTracks()) {
          track.enabled = true
        }
      }
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      // Disable tracks rather than stopping them to allow re-enabling
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

      // Always enable input audio transcription so user speech is transcribed
      sessionUpdate.input_audio_transcription = { model: 'whisper-1' }

      if (Object.keys(sessionUpdate).length > 0) {
        sendEvent({
          type: 'session.update',
          session: sessionUpdate,
        })
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

        // Normalize to 0-1 range (max deviation is 128)
        // Scale by 1.5x so that ~66% amplitude reads as full scale
        // This provides good visual feedback without pegging too early
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
