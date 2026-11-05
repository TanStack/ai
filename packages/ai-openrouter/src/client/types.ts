import type { Chat } from '@openrouter/sdk/sdk/chat.js'
import type { Responses } from '@openrouter/sdk/sdk/responses.js'
import type { Rerank } from '@openrouter/sdk/sdk/rerank.js'
import type { VideoGeneration } from '@openrouter/sdk/sdk/videogeneration.js'

/**
 * The part of the `OpenRouter` SDK client that this package calls. A real
 * `new OpenRouter()` fits it.
 */
export interface OpenRouterClient {
  chat: Pick<Chat, 'send'>
  beta: { responses: Pick<Responses, 'send'> }
  rerank: Pick<Rerank, 'rerank'>
  videoGeneration: Pick<
    VideoGeneration,
    'generate' | 'getGeneration' | 'getVideoContent'
  >
}
