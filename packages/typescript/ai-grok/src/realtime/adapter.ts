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

  return {
    provider: 'grok',

    async connect(
      token: RealtimeToken,
      _clientTools?: ReadonlyArray<AnyClientTool>,
    ): Promise<RealtimeConnection> {
      if (connectionMode === 'webrtc') {
        return createWebRTCConnection(token)
      }
      throw new Error('WebSocket connection mode not yet implemented')
    },
  }
}

/**
 * Creates a WebRTC connection to xAI's realtime API.
 */
async function createWebRTCConnection(
  token: RealtimeToken,
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
      handleServerEvent(message)
    } catch (e) {
      console.error('Failed to parse realtime event:', e)
    }
  }

  dataChannel.onerror = (error) => {
    emit('error', { error: new Error(`Data channel error: ${error}`) })
  }

  pc.ontrack = (event) => {
    if (event.track.kind === 'audio' && event.streams[0]) {
      setupOutputAudioAnalysis(event.streams[0])
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
    throw new Error(
      `Microphone access required for realtime voice: ${error instanceof Error ? error.message : error}`,
    )
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
    throw new Error(
      `Failed to establish WebRTC connection: ${sdpResponse.status} - ${errorText}`,
    )
  }

  const answerSdp = await sdpResponse.text()
  await pc.setRemoteDescription({ type: 'answer', sdp: answerSdp })

  setupInputAudioAnalysis(localStream)

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
          console.warn(
            '[grokRealtime] function_call_arguments.done missing call_id/item_id',
            event,
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

        currentMode = 'listening'
        emit('mode_change', { mode: 'listening' })

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
        emit('error', {
          error: new Error((error.message as string) || 'Unknown error'),
        })
        break
      }
    }
  }

  function setupOutputAudioAnalysis(stream: MediaStream) {
    audioElement = new Audio()
    audioElement.srcObject = stream
    audioElement.autoplay = true
    audioElement.play().catch((e) => {
      console.warn('Audio autoplay failed:', e)
    })

    if (!audioContext) {
      audioContext = new AudioContext()
    }

    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {})
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
      audioContext.resume().catch(() => {})
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
      dataChannel.send(JSON.stringify(event))
    } else {
      pendingEvents.push(event)
    }
  }

  function flushPendingEvents() {
    for (const event of pendingEvents) {
      dataChannel!.send(JSON.stringify(event))
    }
    pendingEvents.length = 0
  }

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

      sessionUpdate.input_audio_transcription = { model: 'grok-stt' }

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

  await dataChannelReady

  return connection
}
