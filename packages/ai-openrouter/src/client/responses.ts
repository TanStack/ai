import { openrouterPostResponses } from '../generated/client/sdk'
import { createCaller, sendText } from './http'
import { toWire } from './remap'
import {
  OBJECTS,
  OpenResponsesResult,
  ResponsesRequest,
  StreamEvents,
} from './tables/responses'
import type { OpenRouterClientOptions } from './http'
import type { OpenRouterClient } from './types'
import type { RequestOptions } from '@openrouter/sdk/lib/sdks.js'
import type { EventStream } from '@openrouter/sdk/lib/event-streams.js'
import type { Responses } from '@openrouter/sdk/sdk/responses.js'
import type {
  OpenResponsesResult as OpenResponsesResultModel,
  StreamEvents as StreamEventsModel,
} from '@openrouter/sdk/models'
import type { CreateResponsesRequest } from '@openrouter/sdk/models/operations'

const tables = {
  objects: OBJECTS,
  json: OpenResponsesResult,
  event: StreamEvents,
}

/**
 * The SDK `beta.responses.send` over the generated `POST /responses`, JSON or SSE.
 *
 * @example
 * const { beta } = createOpenRouterResponsesClient({ apiKey: 'sk-or-...' })
 * const result = await beta.responses.send({ responsesRequest: { model, input } })
 */
export function createOpenRouterResponsesClient(
  config: OpenRouterClientOptions,
) {
  const call = createCaller(config)
  const client: Pick<OpenRouterClient, 'beta'> = {
    beta: {
      responses: {
        // The SDK types `send` with overloads on `stream`. One function
        // cannot implement them, so it takes the overload type.
        send: (async (
          request: CreateResponsesRequest,
          requestOptions?: RequestOptions,
        ) => {
          const body = toWire(
            request.responsesRequest,
            ResponsesRequest,
            OBJECTS,
          )
          const result = await sendText(
            call,
            (http) =>
              openrouterPostResponses({
                client: http,
                body: {
                  ...body,
                  // @ts-expect-error modelschemas gap: ReasoningItem.content rejects null, input has no `openrouter:mcp` item; public type mismatch: SDK ShellCallOutputItem.output vs ShellCallOutputContent
                  input: body.input,
                  // @ts-expect-error modelschemas gap: Responses `model` is a closed enum of known slugs, the API takes any model id
                  model: body.model,
                  // @ts-expect-error modelschemas gap: web plugin `user_location` rejects null
                  plugins: body.plugins,
                  // @ts-expect-error modelschemas gap: TextConfig & TextExtendedConfig intersect `verbosity` and drop 'max'
                  text: body.text,
                },
              }),
            body.stream,
            request,
            tables,
            requestOptions,
          )
          return result as
            | OpenResponsesResultModel
            | EventStream<StreamEventsModel>
        }) as Responses['send'],
      },
    },
  }
  return client
}
