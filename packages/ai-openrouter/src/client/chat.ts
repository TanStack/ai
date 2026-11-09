import { createCaller, sendText } from './http'
import {
  ChatRequest,
  ChatResult,
  ChatStreamChunk,
  OBJECTS,
} from './tables/chat'
import type { OpenRouterClientOptions } from './http'
import type { OpenRouterClient } from './types'
import type { RequestOptions } from '@openrouter/sdk/lib/sdks.js'
import type { EventStream } from '@openrouter/sdk/lib/event-streams.js'
import type { Chat } from '@openrouter/sdk/sdk/chat.js'
import type {
  ChatResult as ChatResultModel,
  ChatStreamChunk as ChatStreamChunkModel,
} from '@openrouter/sdk/models'
import type { SendChatCompletionRequestRequest } from '@openrouter/sdk/models/operations'

const tables = {
  objects: OBJECTS,
  body: ChatRequest,
  json: ChatResult,
  event: ChatStreamChunk,
}

/**
 * The SDK `chat.send` over fetch: `POST /chat/completions`, JSON or SSE.
 *
 * @example
 * const { chat } = createOpenRouterChatClient({ apiKey: 'sk-or-...' })
 * const result = await chat.send({ chatRequest: { model, messages } })
 */
export function createOpenRouterChatClient(config: OpenRouterClientOptions) {
  const call = createCaller(config)
  const client: Pick<OpenRouterClient, 'chat'> = {
    chat: {
      // The SDK types `send` with overloads on `stream`. One function cannot
      // implement them, so it takes the overload type; the wire decides.
      send: (async (
        request: SendChatCompletionRequestRequest,
        requestOptions?: RequestOptions,
      ) =>
        (await sendText(
          call,
          'chat/completions',
          request.chatRequest,
          request,
          tables,
          requestOptions,
        )) as
          | ChatResultModel
          | EventStream<ChatStreamChunkModel>) as Chat['send'],
    },
  }
  return client
}
