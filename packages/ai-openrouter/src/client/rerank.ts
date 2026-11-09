import { createCaller, readJSON } from './http'
import { remap } from './remap'
import { OBJECTS, RerankRequest, RerankResponse } from './tables/rerank'
import type { OpenRouterClientOptions } from './http'
import type { OpenRouterClient } from './types'
import type { CreateRerankResponse } from '@openrouter/sdk/models/operations'

/**
 * The SDK `rerank.rerank` over fetch: `POST /rerank`.
 *
 * @example
 * const { rerank } = createOpenRouterRerankClient({ apiKey: 'sk-or-...' })
 * const result = await rerank.rerank({ requestBody: { model, query, documents } })
 */
export function createOpenRouterRerankClient(config: OpenRouterClientOptions) {
  const call = createCaller(config)
  const client: Pick<OpenRouterClient, 'rerank'> = {
    rerank: {
      async rerank(request, requestOptions) {
        const exchange = await call(
          {
            method: 'POST',
            path: 'rerank',
            body: JSON.stringify(
              remap(request.requestBody, RerankRequest, OBJECTS),
            ),
            accept: 'application/json;q=1, text/event-stream;q=0',
            headers: request,
            okStatus: 200,
            okTypes: ['application/json', 'text/event-stream'],
            errorStatuses: [400, 401, 402, 404, 429, 500, 502, 503, 524, 529],
          },
          requestOptions,
        )
        const isText = exchange.response.headers
          .get('content-type')
          ?.includes('text/event-stream')
        // The wire JSON goes through the SDK rename tables.
        return (
          isText
            ? await exchange.response.text()
            : await readJSON(exchange, RerankResponse, OBJECTS)
        ) as CreateRerankResponse
      },
    },
  }
  return client
}
