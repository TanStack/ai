import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type { RealtimeToken, RealtimeTokenAdapter, Tool } from '@tanstack/ai'
import type {
  OpenAIRealtimeModel,
  OpenAIRealtimeSessionResponse,
  OpenAIRealtimeTokenOptions,
} from './types'

const OPENAI_REALTIME_SESSIONS_URL =
  'https://api.openai.com/v1/realtime/sessions'

/**
 * Creates an OpenAI realtime token adapter.
 *
 * This adapter generates ephemeral tokens for client-side WebRTC connections.
 * The token is valid for 10 minutes.
 *
 * @param options - Configuration options for the realtime session
 * @returns A RealtimeTokenAdapter for use with realtimeToken()
 *
 * @example
 * ```typescript
 * import { realtimeToken } from '@tanstack/ai'
 * import { openaiRealtimeToken } from '@tanstack/ai-openai'
 *
 * const token = await realtimeToken({
 *   adapter: openaiRealtimeToken({
 *     model: 'gpt-4o-realtime-preview',
 *     voice: 'alloy',
 *     instructions: 'You are a helpful assistant.',
 *     turnDetection: {
 *       type: 'semantic_vad',
 *       eagerness: 'medium',
 *     },
 *   }),
 * })
 * ```
 */
export function openaiRealtimeToken(
  options: OpenAIRealtimeTokenOptions = {},
): RealtimeTokenAdapter {
  const apiKey = getOpenAIApiKeyFromEnv()

  return {
    provider: 'openai',

    async generateToken(): Promise<RealtimeToken> {
      const model: OpenAIRealtimeModel =
        options.model ?? 'gpt-4o-realtime-preview'
      const voice = options.voice ?? 'alloy'

      // Build request body
      const body: Record<string, unknown> = {
        model,
        voice,
      }

      if (options.instructions) {
        body.instructions = options.instructions
      }

      if (options.turnDetection !== undefined) {
        body.turn_detection = options.turnDetection
      }

      if (options.inputAudioFormat) {
        body.input_audio_format = options.inputAudioFormat
      }

      if (options.outputAudioFormat) {
        body.output_audio_format = options.outputAudioFormat
      }

      if (options.inputAudioTranscription) {
        body.input_audio_transcription = options.inputAudioTranscription
      }

      if (options.tools) {
        body.tools = options.tools
      }

      if (options.toolChoice) {
        body.tool_choice = options.toolChoice
      }

      if (options.temperature !== undefined) {
        body.temperature = options.temperature
      }

      if (options.maxResponseOutputTokens !== undefined) {
        body.max_response_output_tokens = options.maxResponseOutputTokens
      }

      // Call OpenAI API to create session and get ephemeral token
      const response = await fetch(OPENAI_REALTIME_SESSIONS_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `OpenAI realtime session creation failed: ${response.status} ${errorText}`,
        )
      }

      const sessionData: OpenAIRealtimeSessionResponse = await response.json()

      // Convert tools to our format
      const tools: Array<Tool> = sessionData.tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.parameters,
      }))

      return {
        provider: 'openai',
        token: sessionData.client_secret.value,
        expiresAt: sessionData.client_secret.expires_at * 1000, // Convert to ms
        config: {
          model: sessionData.model,
          voice: sessionData.voice,
          instructions: sessionData.instructions,
          tools,
          vadMode:
            sessionData.turn_detection?.type === 'semantic_vad'
              ? 'semantic'
              : sessionData.turn_detection?.type === 'server_vad'
                ? 'server'
                : 'manual',
          vadConfig: sessionData.turn_detection
            ? {
                threshold: sessionData.turn_detection.threshold,
                prefixPaddingMs: sessionData.turn_detection.prefix_padding_ms,
                silenceDurationMs:
                  sessionData.turn_detection.silence_duration_ms,
              }
            : undefined,
          providerOptions: {
            inputAudioFormat: sessionData.input_audio_format,
            outputAudioFormat: sessionData.output_audio_format,
            inputAudioTranscription: sessionData.input_audio_transcription,
            temperature: sessionData.temperature,
            maxResponseOutputTokens: sessionData.max_response_output_tokens,
          },
        },
      }
    },
  }
}
