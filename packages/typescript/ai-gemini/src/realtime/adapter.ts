import { GoogleGenAI, Modality } from '@google/genai'
import {
  convertSchemaToJsonSchema,
  createRealtimeEventEmitter,
} from "@tanstack/ai"
import { MediaHandler } from './media-handler'
import type {
  AudioVisualization,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeToken,
} from '@tanstack/ai'
import type { LiveConnectConfig, LiveServerSessionResumptionUpdate } from '@google/genai'
import type { AnyClientTool, RealtimeAdapter, RealtimeConnection } from '@tanstack/ai-client'
import type { GeminiRealtimeOptions, GeminiRealtimeProviderOptions } from './types'

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

  const { emit, on: realtimeEventEmitterOn } = createRealtimeEventEmitter()

  const model = token.config.model ?? 'gemini-live-2.5-flash-native-audio'

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

  const {
    languageCode,
    contextWindowCompression,
    proactivity,
    enableAffectiveDialog,
    thinkingConfig
  } = (config.providerOptions ?? {}) as GeminiRealtimeProviderOptions

  const liveConfig: LiveConnectConfig = {
    responseModalities: [Modality.AUDIO],
    tools: toolsConfig ? [{
      functionDeclarations: toolsConfig
    }] : undefined,
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: config.voice
        }
      },
      languageCode
    },
    maxOutputTokens: config.maxOutputTokens !== 'inf' ? config.maxOutputTokens : undefined,
    systemInstruction: config.instructions,
    temperature: config.temperature,
    contextWindowCompression,
    proactivity,
    enableAffectiveDialog,
    thinkingConfig,
  };

  if (config.outputModalities?.includes("text")) {
    liveConfig.inputAudioTranscription = {}
    liveConfig.outputAudioTranscription = {}
  }

  const mediaHandler = new MediaHandler()

  // Current state
  let currentMode: RealtimeMode = 'idle'
  let currentMessageId: string | null = null
  let messageIdCounter = 0
  let sessionResumptionUpdate: LiveServerSessionResumptionUpdate | null = null

  function generateMessageId(): string {
    return `gemini-msg-${Date.now()}-${++messageIdCounter}`
  }

  const ai = new GoogleGenAI({
    apiKey: token.token,
    httpOptions: {
      apiVersion: 'v1alpha'
    }
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

        if (response.goAway) {
          emit("go_away", { timeLeft: response.goAway.timeLeft })
        }

        // TODO: implement session resumption
        if (response.sessionResumptionUpdate) {
          sessionResumptionUpdate = response.sessionResumptionUpdate
        }

        // Handle token usage
        const { totalTokenCount, promptTokenCount, responseTokenCount, responseTokensDetails } = response.usageMetadata ?? {}
        if (totalTokenCount && promptTokenCount && responseTokenCount) {
          emit("usage", {
            completionTokens: responseTokenCount,
            promptTokens: promptTokenCount,
            totalTokens: totalTokenCount,
          })
        }

        // Handle interruption by the model
        if (response.serverContent?.interrupted) {
          mediaHandler.stopAudioPlayback()
          currentMode = 'listening'
          emit('mode_change', { mode: 'listening' })
          emit('interrupted', { messageId: currentMessageId ?? undefined })
        }

        // Handle input transcription
        if (
          inputTranscription?.text &&
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

        // Handle output transcription
        if (
          outputTranscription?.text &&
          outputTranscription.finished != undefined
        ) {
          emit('transcript', {
            isFinal: outputTranscription.finished,
            transcript: outputTranscription.text,
            role: 'assistant',
          })
        }

        // Handle tool calls
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

        // Play audio as it comes
        if (response.serverContent?.modelTurn?.parts) {
          for (const part of response.serverContent.modelTurn.parts) {
            if (part.inlineData?.data) {
              const audioData = mediaHandler.convertBase64ToArrayBuffer(part.inlineData.data);
              mediaHandler.playAudio(audioData)

              if (currentMode !== 'speaking') {
                currentMode = 'speaking'
                emit('mode_change', { mode: 'speaking' })
              }
            }
          }
        }

        // Handle turn complete
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

            for (const part of response.serverContent.modelTurn.parts || []) {
              console.log(part)

              if (part.inlineData?.data && outputTranscription?.finished && outputTranscription.text) {
                message.parts.push({
                  type: "audio",
                  transcript: outputTranscription.text,
                  audioData: mediaHandler.convertBase64ToArrayBuffer(part.inlineData.data),
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
  mediaHandler.startAudio((data) => {
    session.sendRealtimeInput({
      audio: {
        data: Buffer.from(data).toString("base64"),
        mimeType: 'audio/pcm;rate=16000'
      }
    })
  })

  await mediaHandler.setupInputAudioAnalysis()

  const connection: RealtimeConnection = {
    async disconnect() {
      mediaHandler.stopAudio()

      await session.close();

      currentMode = 'idle'
      emit('status_change', { status: 'idle' })
    },

    async startAudioCapture() {
      // Audio capture is established during connection setup
      // This method enables the tracks and signals listening mode
      mediaHandler.startAudioCapture()
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      // Disable tracks rather than stopping them to allow re-enabling
      mediaHandler.stopAudioCapture()
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
        video: {
          data: imageData,
          mimeType: mimeType
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
      mediaHandler.stopAudioPlayback()
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
      emit('interrupted', { messageId: currentMessageId ?? undefined })
    },
    on: realtimeEventEmitterOn,
    getAudioVisualization(): AudioVisualization {
      return {
        get inputLevel() {
          return mediaHandler.inputLevel
        },

        get outputLevel() {
          return mediaHandler.outputLevel
        },

        getInputFrequencyData() {
          return mediaHandler.inputFrequencyData
        },

        getOutputFrequencyData() {
          return mediaHandler.outputFrequencyData
        },

        getInputTimeDomainData() {
          return mediaHandler.inputTimeDomainData
        },

        getOutputTimeDomainData() {
          return mediaHandler.outputTimeDomainData
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
