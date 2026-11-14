import { openrouterPostChatCompletions } from '../generated/client/sdk'
import { createCaller, sendText } from './http'
import { toWire } from './remap'
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
  json: ChatResult,
  event: ChatStreamChunk,
}

/**
 * The SDK `chat.send` over the generated `POST /chat/completions`, JSON or SSE.
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
      ) => {
        const body = toWire(request.chatRequest, ChatRequest, OBJECTS)
        const result = await sendText(
          call,
          (http) =>
            openrouterPostChatCompletions({
              client: http,
              body: {
                ...body,
                // @ts-expect-error modelschemas gap: web plugin `user_location` rejects null
                plugins: body.plugins,
              },
            }),
          body.stream,
          request,
          tables,
          requestOptions,
        )
        return result as ChatResultModel | EventStream<ChatStreamChunkModel>
      }) as Chat['send'],
    },
  }
  return client
}
