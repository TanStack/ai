import { HTTPClient, OpenRouter } from '@openrouter/sdk'
import type { SDKOptions } from '@openrouter/sdk'
import type { FetchWrapper } from '@tanstack/ai'

/**
 * Give the client for one call. With `wrapFetch`, it is a new client whose
 * requests go through the wrapper. The base fetch is the config's own HTTP
 * client, so its hooks and its fetcher still run.
 */
export function clientForCall(
  client: OpenRouter,
  options: SDKOptions,
  wrapFetch: FetchWrapper | undefined,
) {
  if (!wrapFetch) return client
  const base = options.httpClient ?? new HTTPClient()
  const wrapped = wrapFetch((input, init) =>
    base.request(new Request(input, init)),
  )
  return new OpenRouter({
    ...options,
    httpClient: new HTTPClient({
      // The SDK sends a Request. Send a URL and an init, as a plain fetch
      // call does, so a wrapper that reads `init.headers` keeps them.
      fetcher: async (input) => {
        const request = new Request(input)
        return wrapped(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body && (await request.arrayBuffer()),
          signal: request.signal,
        })
      },
    }),
  })
}
