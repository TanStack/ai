import {
  createRealtimeEventEmitter,
} from "@tanstack/ai"
import { AudioPlayer, AudioStreamer, base64ToArrayBuffer } from './utils'
import { GeminiLiveClient } from './client'
import type { LiveResponse } from './client'
import type {
  AudioVisualization,
  RealtimeMessage,
  RealtimeMode,
  RealtimeSessionConfig,
  RealtimeToken,
} from '@tanstack/ai'
import type { AnyClientTool, RealtimeAdapter, RealtimeClientOptions, RealtimeConnection } from '@tanstack/ai-client'
import type { GeminiRealtimeModel, GeminiRealtimeOptions } from './types'

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
      config: RealtimeClientOptions,
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
  config: RealtimeClientOptions,
  tools?: ReadonlyArray<AnyClientTool>,
): Promise<RealtimeConnection> {

  const { emit, on: realtimeEventEmitterOn } = createRealtimeEventEmitter()

  const model = (token.config.model ?? 'gemini-3.1-flash-live-preview') as GeminiRealtimeModel

  // Current state
  let currentMode: RealtimeMode = 'idle'
  let currentMessageId: string | null = null
  let messageIdCounter = 0

  function generateMessageId(): string {
    return `gemini-msg-${Date.now()}-${++messageIdCounter}`
  }

  const client = new GeminiLiveClient(token.token, model, tools)
  const audioStreamer = new AudioStreamer(client)
  const audioPlayer = new AudioPlayer()
  await audioPlayer.init()

  client.connect()

  audioStreamer.start()

  let message: RealtimeMessage = {
    id: '',
    role: 'assistant',
    timestamp: 0,
    parts: []
  }

  client.onReceiveResponse = (response: LiveResponse) => {
    switch (response.type) {
      case 'text':
        message.parts.push({
          type: 'text',
          content: response.data,
        })
        break;
      case 'audio':
        message.parts.push({
          type: 'audio',
          transcript: response.data.transcript,
          audioData: base64ToArrayBuffer(response.data.audioData)
        })
        if (currentMode !== 'speaking') {
          currentMode = 'speaking'
          emit('mode_change', { mode: 'speaking' })
        }
        audioPlayer.play(response.data.audioData)
        break;
      case 'go_away':
        emit("go_away", { timeLeft: response.data.timeLeft })
        break;
      case 'usage_metadata':
        emit("usage", {
          completionTokens: response.data.responseTokenCount ?? 0,
          promptTokens: response.data.promptTokenCount ?? 0,
          totalTokens: response.data.totalTokenCount ?? 0,
        })
        break;
      case 'input_transcription':
        if (response.data.finished && currentMode !== 'thinking') {
          currentMode = 'thinking'
          emit('mode_change', { mode: 'thinking' })
        }
        emit('transcript', {
          isFinal: response.data.finished,
          transcript: response.data.text,
          role: 'user',
        })
        break;
      case 'output_transcription':
        emit('transcript', {
          isFinal: response.data.finished,
          transcript: response.data.text,
          role: 'assistant',
        })
        break;
      case 'interrupted':
        audioPlayer.interrupt()
        currentMode = 'listening'
        emit('mode_change', { mode: 'listening' })
        emit('interrupted', { messageId: currentMessageId ?? undefined })
        break;
      case 'tool_call':
        for (const tool of response.data) {
          if (tool.id && tool.name) {
            emit('tool_call', {
              toolCallId: tool.id,
              input: tool.args,
              toolName: tool.name
            })
          }
        }
        break;
      case 'turn_complete':
        currentMessageId = generateMessageId()
        message.id = currentMessageId
        message.timestamp = Date.now()

        emit('message_complete', { message })
        message = {
          id: '',
          role: 'assistant',
          timestamp: 0,
          parts: []
        }
        currentMode = 'listening'
        emit('mode_change', { mode: 'listening' })
        break;
      case 'setup_complete':
        emit('status_change', { status: 'connected' })
        break;
      case 'error':
        emit('error', {
          error: new Error(response.data)
        })
        break;
    }
  }


  const connection: RealtimeConnection = {
    async disconnect() {
      audioStreamer.stop()
      audioPlayer.destroy()
      client.disconnect()
      currentMode = 'idle'
      emit('status_change', { status: 'idle' })
    },

    async startAudioCapture() {
      // Audio capture is established during connection setup
      audioStreamer.startAudioCapture()
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
    },

    stopAudioCapture() {
      audioStreamer.stopAudioCapture()
      currentMode = 'idle'
      emit('mode_change', { mode: 'idle' })
    },

    sendText(text: string) {
      client.sendTextMessage(text)
      currentMode = 'thinking'
      emit('mode_change', { mode: 'thinking' })
    },

    sendImage(imageData: string, mimeType: string) {
      client.sendImageMessage(imageData, mimeType)
      currentMode = 'thinking'
      emit('mode_change', { mode: 'thinking' })
    },

    sendToolResult(callId: string, result: string) {
      client.sendToolResponse([{
          id: callId,
          response: {
            result
          }
      }])
    },

    updateSession(config) {
      client.updateSession(config)
      emit('status_change', { status: 'reconnecting' })
    },

    updateToken(token) {
      client.updateToken(token)
      emit('status_change', { status: 'reconnecting' })
    },

    interrupt() {
      audioPlayer.interrupt()
      currentMode = 'listening'
      emit('mode_change', { mode: 'listening' })
      emit('interrupted', { messageId: currentMessageId ?? undefined })
    },
    on: realtimeEventEmitterOn,
    getAudioVisualization(): AudioVisualization {
      return {
        get inputLevel() {
          return audioStreamer.inputLevel
        },

        get outputLevel() {
          return audioPlayer.outputLevel
        },

        getInputFrequencyData() {
          return audioStreamer.inputFrequencyData
        },

        getOutputFrequencyData() {
          return audioPlayer.outputFrequencyData
        },

        getInputTimeDomainData() {
          return audioStreamer.inputTimeDomainData
        },

        getOutputTimeDomainData() {
          return audioPlayer.outputTimeDomainData
        },

        get inputSampleRate() {
          return audioStreamer.inputSampleRate
        },

        get outputSampleRate() {
          return audioPlayer.outputSampleRate
        },
      }
    },
  }

  return connection;
}
