import { openrouterPostResponses } from '../generated/client/sdk'
import { createCaller, sendText, wire } from './http'
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
  body: ResponsesRequest,
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
        ) =>
          (await sendText(
            call,
            (body) => (client) =>
              openrouterPostResponses({ client, body: wire(body) }),
            request.responsesRequest,
            request,
            tables,
            requestOptions,
          )) as
            | OpenResponsesResultModel
            | EventStream<StreamEventsModel>) as Responses['send'],
      },
    },
  }
  return client
}
