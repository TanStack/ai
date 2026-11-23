import { convertFunctionToolToAdapterFormat } from '../tools/function-tool'
import { getOpenAIApiKeyFromEnv } from '../utils/client'
import type { RealtimeSessionAdapter, RealtimeToolConfig } from '@tanstack/ai'
import type {
  OpenAILiveDelegation,
  OpenAILiveModel,
  OpenAILiveSessionOptions,
} from './live-types'

/** The fields that this adapter reads from the `POST /live/sessions` answer. */
interface OpenAILiveSessionResponse {
  session?: { id?: unknown }
  transport?: { sdp?: unknown }
}

/**
 * Maps the delegation options to the snake_case fields of
 * `session.delegation.responses`. Keys that are not set are left out.
 * The Live adapter also uses it for `session.update`.
 */
export function toResponsesSettings(delegation: Partial<OpenAILiveDelegation>) {
  return {
    ...(delegation.model !== undefined && { model: delegation.model }),
    ...(delegation.instructions !== undefined && {
      instructions: delegation.instructions,
    }),
    ...(delegation.toolChoice !== undefined && {
      tool_choice: delegation.toolChoice,
    }),
    ...(delegation.parallelToolCalls !== undefined && {
      parallel_tool_calls: delegation.parallelToolCalls,
    }),
    ...(delegation.maxOutputTokens !== undefined && {
      max_output_tokens: delegation.maxOutputTokens,
    }),
  }
}

/**
 * Builds `session.delegation` in the Responses API format.
 * The client tools go to the delegated model, because it runs the tool calls.
 */
function buildDelegation(
  delegation: OpenAILiveDelegation,
  tools: Array<RealtimeToolConfig>,
) {
  return {
    type: 'responses',
    responses: {
      ...toResponsesSettings(delegation),
      ...(tools.length > 0 && {
        tools: tools.map(convertFunctionToolToAdapterFormat),
      }),
    },
  }
}

/**
 * Creates an OpenAI GPT-Live session adapter. Use it on the server with
 * `realtimeSession()`.
 *
 * The browser sends its WebRTC offer and its session config to your server.
 * This adapter sends them to `POST {baseURL}/live/sessions` with your API key
 * and returns the SDP answer. The browser never sees the API key.
 *
 * The server options win: `instructions` and `voice` replace the client
 * values. Only the server sets `model` and `delegation`. When the client
 * sends tools, you must set `delegation`, because the delegated model runs
 * the tool calls.
 *
 * @param options - Server options for the session. See {@link OpenAILiveSessionOptions}.
 * @returns A RealtimeSessionAdapter for use with `realtimeSession()`.
 * @throws Error when `apiKey` is not set and `OPENAI_API_KEY` is missing.
 *
 * @example
 * ```typescript
 * import { realtimeSession } from '@tanstack/ai'
 * import { openaiLiveSession } from '@tanstack/ai-openai'
 *
 * const answer = await realtimeSession({
 *   adapter: openaiLiveSession({ delegation: { model: 'gpt-5.5' } }),
 *   request: await request.json(),
 * })
 * ```
 */
export function openaiLiveSession(
  options: OpenAILiveSessionOptions = {},
): RealtimeSessionAdapter {
  const apiKey = options.apiKey ?? getOpenAIApiKeyFromEnv()
  const baseURL = options.baseURL ?? 'https://api.openai.com/v1'

  return {
    provider: 'openai',

    async createSession(request, requestOptions) {
      const model: OpenAILiveModel = options.model ?? 'gpt-live-1.1'
      const instructions = options.instructions ?? request.config.instructions
      const voice = options.voice ?? request.config.voice
      const tools = request.config.tools ?? []

      if (tools.length > 0 && !options.delegation) {
        throw new Error(
          'openaiLiveSession: the client sent tools, but no `delegation` is set. GPT-Live runs tools through a delegated Responses model. Set `delegation: { model }` in openaiLiveSession().',
        )
      }

      const session = {
        model,
        ...(instructions !== undefined && { instructions }),
        ...(voice !== undefined && { audio: { output: { voice } } }),
        ...(options.store !== undefined && { store: options.store }),
        delegation: options.delegation
          ? buildDelegation(options.delegation, tools)
          : null,
      }

      const response = await fetch(`${baseURL}/live/sessions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session,
          transport: { type: 'webrtc', sdp: request.sdp },
        }),
        ...(requestOptions?.abortSignal && {
          signal: requestOptions.abortSignal,
        }),
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(
          `OpenAI live session creation failed: ${response.status} ${errorText}`,
        )
      }

      const data = (await response.json()) as
        | OpenAILiveSessionResponse
        | undefined
      const sessionId = data?.session?.id
      const sdp = data?.transport?.sdp
      if (typeof sessionId !== 'string' || typeof sdp !== 'string') {
        throw new Error(
          'OpenAI live session response is missing `session.id` or `transport.sdp`',
        )
      }

      const config = {
        model,
        ...(instructions !== undefined && { instructions }),
        ...(voice !== undefined && { voice }),
        ...(tools.length > 0 && { tools }),
      }

      return { provider: 'openai', sessionId, sdp, config }
    },
  }
}
