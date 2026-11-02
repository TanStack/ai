import { createOpenRouterChatClient } from './chat'
import { createOpenRouterResponsesClient } from './responses'
import { createOpenRouterRerankClient } from './rerank'
import { createOpenRouterVideoClient } from './video'
import type { OpenRouterClientOptions } from './http'
import type { OpenRouterClient } from './types'

export { createOpenRouterChatClient } from './chat'
export { createOpenRouterResponsesClient } from './responses'
export { createOpenRouterRerankClient } from './rerank'
export { createOpenRouterVideoClient } from './video'
export type { HttpClientLike, OpenRouterClientOptions } from './http'
export type { OpenRouterClient } from './types'

/**
 * A fetch client with the same methods, arguments, results, and errors as
 * the parts of the `OpenRouter` SDK client that this package calls. It takes
 * the SDK `SDKOptions` (`httpClient` is any object with `request(Request)`).
 * The adapters build only the part they call (`createOpenRouterChatClient`
 * and the others), so a bundle keeps only the rename tables of that API.
 *
 * @example
 * const client = createOpenRouterClient({ apiKey: 'sk-or-...' })
 * const result = await client.chat.send({ chatRequest: { model, messages } })
 */
export function createOpenRouterClient(config: OpenRouterClientOptions) {
  const client: OpenRouterClient = {
    ...createOpenRouterChatClient(config),
    ...createOpenRouterResponsesClient(config),
    ...createOpenRouterRerankClient(config),
    ...createOpenRouterVideoClient(config),
  }
  return client
}
