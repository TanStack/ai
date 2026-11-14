import { sendWith } from '@tanstack/ai-utils/kubb'
import { coherePostV2Embed } from '../generated/client/sdk'
import { resolveCohereTransport } from '../utils/client'
import type {
  CoherePostV2EmbedBody,
  CoherePostV2EmbedResponse,
} from '../generated/client/types'
import type { CohereClientConfig } from '../utils/client'

type Fetcher = (url: string, init: RequestInit) => Promise<Response>

/** The text of a Cohere error body: its `message`, else the raw text. */
async function errorMessage(response: Response) {
  const text = await response.text()
  try {
    const parsed: unknown = JSON.parse(text)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'message' in parsed &&
      typeof parsed.message === 'string'
    ) {
      return parsed.message
    }
  } catch {
    // Not JSON — fall back to the raw body text.
  }
  return text
}

/**
 * The Cohere client the embedding adapter calls. Request bodies are the
 * generated (modelschemas) wire types. `fetcher` replaces the global `fetch`,
 * which is read at call time.
 *
 * @throws `Cohere embed failed (<status>): <message>` for a non-2xx response.
 */
export function createCohereClient(
  config: CohereClientConfig,
  fetcher?: Fetcher,
) {
  const transport = resolveCohereTransport(config)
  const doFetch: Fetcher = fetcher ?? ((url, init) => fetch(url, init))

  return {
    async embed(
      body: CoherePostV2EmbedBody,
      signal?: AbortSignal,
    ): Promise<CoherePostV2EmbedResponse> {
      const { response } = await coherePostV2Embed({
        client: sendWith(async (request) => {
          const res = await doFetch(`${transport.baseUrl}${request.path}`, {
            method: request.method,
            headers: {
              Authorization: `Bearer ${config.apiKey}`,
              ...request.headers,
              ...transport.headers,
            },
            body: request.body,
            ...(signal && { signal }),
          })
          if (!res.ok) {
            throw new Error(
              `Cohere embed failed (${res.status}): ${await errorMessage(res)}`,
            )
          }
          return res
        }),
        body,
      })
      return await response.json()
    },
  }
}
