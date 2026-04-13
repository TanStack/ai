import { GoogleGenAI } from '@google/genai'
import {
  convertSchemaToJsonSchema,
} from "@tanstack/ai"
import type {
  AudioVisualization,
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeToken
} from '@tanstack/ai'
import type { LiveConnectConfig, Modality } from '@google/genai'
import type { AnyClientTool, RealtimeAdapter, RealtimeConnection } from '@tanstack/ai-client'
import type { GeminiRealtimeOptions } from './types'

const textEncoder = new TextEncoder()
const workletCode = `
class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.bufferSize = 4096;
    this.buffer = new Float32Array(this.bufferSize);
    this.bufferIndex = 0;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (!input || !input.length) return true;

    const channelData = input[0];

    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];

      if (this.bufferIndex >= this.bufferSize) {
        this.port.postMessage(this.buffer);
        this.bufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
`

/**
 * Creates a Gemini realtime adapter for client-side use.
 *
 * @param options - Optional configuration
 * @returns A RealtimeAdapter for use with RealtimeClient
 *
 * @example
 * ```typescript
 * import { RealtimeClient } from '@tanstack/ai-client'
 * import { geminiRealtime } from '@tanstack/ai-gemini'
 *
 * const client = new RealtimeClient({
 *   getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *   adapter: geminiRealtime(),
 * })
 * ```
 */
export function geminiRealtime(
  options: GeminiRealtimeOptions = {},
): RealtimeAdapter {
  return {
    provider: 'gemini',

    connect(
      token: RealtimeToken,
      config: RealtimeSessionConfig,
      clientTools?: ReadonlyArray<AnyClientTool>,
    ): Promise<RealtimeConnection> {
      return createWebSocketConnection(token, config, clientTools)
    },
  }
}

/**
 * Creates a WebSocket connection to Gemini's realtime API
 */
async function createWebSocketConnection(
  token: RealtimeToken,
  config: RealtimeSessionConfig,
  tools?: ReadonlyArray<AnyClientTool>,
): Promise<RealtimeConnection> {
  const model = token.config.model ?? 'gemini-live-2.5-flash-native-audio'
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()

  const responseModalities = config.outputModalities?.map(modality => modality.toUpperCase()) as Array<Modality>

  const toolsConfig = tools
    ? tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema
        ? convertSchemaToJsonSchema(t.inputSchema)
        : undefined,
      outputSchema: t.outputSchema
        ? convertSchemaToJsonSchema(t.outputSchema)
        : undefined,
    }))
    : undefined

  const liveConfig: LiveConnectConfig = {
    responseModalities,
    tools: toolsConfig ? [{
      functionDeclarations: toolsConfig
    }] : undefined,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: config.voice
        }
      }
    },
    maxOutputTokens: config.maxOutputTokens !== 'inf' ? config.maxOutputTokens : undefined,
    systemInstruction: config.instructions,
    temperature: config.temperature,
    ...config.providerOptions
  };

  // Audio context
  let audioContext: AudioContext | null = null
  let inputAnalyser: AnalyserNode | null = null
  let outputAnalyser: AnalyserNode | null = null
  let inputSource: MediaStreamAudioSourceNode | null = null
  let localStream: MediaStream | null = null

  // Audio element for playback (more reliable than AudioContext.destination)
  let nextPlayTime = 0
  let scheduledSources: Array<AudioBufferSourceNode> = []
  // let audioElement: HTMLAudioElement | null = null

  // Current state
  let currentMode: RealtimeMode = 'idle'
  let currentMessageId: string | null = null
  let messageIdCounter = 0

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

  function generateMessageId(): string {
    return `gemini-msg-${Date.now()}-${++messageIdCounter}`
  }

  function downsampleBuffer(buffer: Float32Array, sampleRate: number, outSampleRate: number) {
    if (outSampleRate === sampleRate) return buffer;
    const ratio = sampleRate / outSampleRate;
    const newLength = Math.round(buffer.length / ratio);
    const result = new Float32Array(newLength);
    let offsetResult = 0;
    let offsetBuffer = 0;
    while (offsetResult < result.length) {
      const nextOffsetBuffer = Math.round((offsetResult + 1) * ratio);
      let accum = 0,
        count = 0;
      for (
        let i = offsetBuffer;
        i < nextOffsetBuffer && i < buffer.length;
        i++
      ) {
        accum += buffer[i]!;
        count++;
      }
      result[offsetResult] = accum / count;
      offsetResult++;
      offsetBuffer = nextOffsetBuffer;
    }
    return result;
  }

  function convertFloat32ToInt16(buffer: Float32Array) {
    let l = buffer.length;
    const buf = new Int16Array(l);
    while (l--) {
      buf[l] = Math.min(1, Math.max(-1, buffer[l]!)) * 0x7fff;
    }
    return buf.toString();
  }

  const ai = new GoogleGenAI({
    apiKey: token.token
  });

  const session = await ai.live.connect({
    model: model,
    config: liveConfig,
    callbacks: {
      onopen() {
        emit("status_change", { status: "connected" })
      },
      onclose() {
        emit("status_change", { status: "idle" })
      },
      onmessage(response) {

        const content = response.serverContent;
        const inputTranscription = content?.inputTranscription;
        const outputTranscription = content?.outputTranscription;

        if (response.data) {
          // TODO: Decode chunk and play using an `AudioWorklet` or
          // buffer them into an AudioContext

          playIncomingAudioChunk(textEncoder.encode(response.data).buffer)

          if (currentMode !== 'speaking') {
            currentMode = 'speaking'
            emit('mode_change', { mode: 'speaking' })
          }
        }

        if (
          inputTranscription &&
          inputTranscription.text != undefined &&
          inputTranscription.finished != undefined
        ) {
          if (inputTranscription.finished && currentMode !== 'thinking') {
            currentMode = 'thinking'
            emit('mode_change', { mode: 'thinking' })
          }

          emit('transcript', {
            isFinal: inputTranscription.finished,
            transcript: inputTranscription.text,
            role: 'user',
          })
        }

        if (
          outputTranscription &&
          outputTranscription.text != undefined &&
          outputTranscription.finished != undefined
        ) {
          emit('transcript', {
            isFinal: outputTranscription.finished,
            transcript: outputTranscription.text,
            role: 'assistant',
          })
        }

        if (response.toolCall?.functionCalls) {

          for (const fc of response.toolCall.functionCalls) {
            if (!fc.id || !fc.name) {
              continue;
            }
            emit('tool_call', {
              toolCallId: fc.id,
              input: fc.args,
              toolName: fc.name
            })
          }
        }

        if (response.serverContent?.turnComplete) {
          currentMode = 'listening'
          emit('mode_change', { mode: 'listening' })

          if (response.serverContent.modelTurn?.role == 'model') {
            currentMessageId = generateMessageId()
            const message: RealtimeMessage = {
              id: currentMessageId,
              role: 'assistant',
              timestamp: Date.now(),
              parts: []
            }

            for (const item of response.serverContent.modelTurn.parts || []) {
              if (item.text) {
                message.parts.push({
                  type: 'audio',
                  transcript: item.text
                })
              }
            }

            emit('message_complete', { message })
          }

        }
      },
      onerror(event) {
        emit("error", {
          error: new Error(event.message)
        })
      },
    }
  });

  // Request microphone access
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 24000,
      },
    })
  } catch (error) {
    throw new Error(
      `Microphone access required for realtime voice: ${error instanceof Error ? error.message : error}`,
    )
  }

  // Set up audio analysis now that we have the stream
  await setupAudioAnalysis(localStream)

  // Set up audio analysis for input
  async function setupAudioAnalysis(stream: MediaStream) {
    if (!audioContext) {
      // Best to specify Gemini's 16kHz here if possible for the whole context
      audioContext = new AudioContext()

      const blob = new Blob([workletCode], { type: 'application/javascript' })
      const workletUrl = URL.createObjectURL(blob)

      await audioContext.audioWorklet.addModule(workletUrl)
    }

    // Resume AudioContext if suspended (browsers require user interaction)
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // Ignore - visualization just won't work
      })
    }

    // 1. Setup Input (Microphone) Analyser
    inputAnalyser = audioContext.createAnalyser()
    inputAnalyser.fftSize = 2048 // Larger size for more accurate level detection
    inputAnalyser.smoothingTimeConstant = 0.3

    inputSource = audioContext.createMediaStreamSource(stream)
    inputSource.connect(inputAnalyser)

    // 2. Setup Output (Gemini) Analyser
    outputAnalyser = audioContext.createAnalyser()
    outputAnalyser.fftSize = 2048
    outputAnalyser.smoothingTimeConstant = 0.3

    // Connect output analyser directly to speakers
    outputAnalyser.connect(audioContext.destination)

    const source = audioContext.createMediaStreamSource(
      stream
    );
    const audioWorkletNode = new AudioWorkletNode(
      audioContext,
      "pcm-processor"
    );

    audioWorkletNode.port.onmessage = (event) => {
      if (currentMode === 'listening') {
        const downsampled = downsampleBuffer(
          event.data,
          audioContext!.sampleRate,
          16000
        );
        const pcm16 = convertFloat32ToInt16(downsampled);
        session.sendRealtimeInput({
          audio: {
            data: pcm16,
            mimeType: 'audio/pcm;rate=16000'
          }
        })
      }
    };

    source.connect(audioWorkletNode);
  }

  // Play incoming audio chunk from WebSocket connection
  function playIncomingAudioChunk(arrayBuffer: ArrayBuffer) {
    if (!audioContext) return
    if (audioContext.state === 'suspended') {
      audioContext.resume().catch(() => {
        // Ignore - visualization just won't work
      })
    }

    const pcmData = new Int16Array(arrayBuffer)
    const float32Data = new Float32Array(pcmData.length)
    for (let i = 0; i < pcmData.length; i++) {
      float32Data[i] = pcmData[i]! / 32768.0;
    }

    const buffer = audioContext.createBuffer(1, float32Data.length, 24000);
    buffer.getChannelData(0).set(float32Data);

    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    if (outputAnalyser) {
      source.connect(outputAnalyser)
    } else {
      source.connect(audioContext.destination);
    }

    const now = audioContext.currentTime;
    nextPlayTime = Math.max(now, nextPlayTime);
    source.start(nextPlayTime);
    nextPlayTime += buffer.duration;

    scheduledSources.push(source);
    source.onended = () => {
      const idx = scheduledSources.indexOf(source);
      if (idx > -1) scheduledSources.splice(idx, 1);
    };
  }

  const connection: RealtimeConnection = {
    async disconnect() {
      if (localStream) {
        for (const track of localStream.getTracks()) {
          track.stop()
        }
        localStream = null
      }

      if (audioContext) {
        await audioContext.close()
        audioContext = null
      }

      await session.close();

      currentMode = 'idle'
      emit('status_change', { status: 'idle' })
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
      session.sendRealtimeInput({ text })
      currentMode = 'thinking'
      emit('mode_change', { mode: 'thinking' })
    },

    sendImage(imageData: string, mimeType: string) {
      // Only accepts raw image data, not URLs
      session.sendRealtimeInput({
        media: {
          data: imageData,
          mimeType: mimeType,
        }
      })
      currentMode = 'thinking'
      emit('mode_change', { mode: 'thinking' })
    },

    sendToolResult(callId: string, result: string) {
      session.sendToolResponse({
        functionResponses: {
          id: callId,
          response: {
            result
          }
        }
      })
    },

    updateSession() {
      // No equivalent of updateSession() exists dynamically as it does in OpenAI
      // for updating system instructions, tools, etc mid-session.
    },

    interrupt() {
      scheduledSources.forEach((s) => {
        try {
          s.stop();
        } catch (e) { }
      });
      scheduledSources = [];
      if (audioContext) {
        nextPlayTime = audioContext.currentTime;
      }

      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
      emit('interrupted', { messageId: currentMessageId ?? undefined })
    },

    on<TEvent extends RealtimeEvent>(
      event: TEvent,
      handler: RealtimeEventHandler<TEvent>
    ): () => void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set());
      }
      eventHandlers.get(event)!.add(handler)

      return () => {
        eventHandlers.get(event)!.delete(handler)
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

  return connection;
}
