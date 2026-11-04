import type { OpenRouterClientOptions } from '../client/index'
import type { FetchWrapper } from '@tanstack/ai'

/**
 * Give the client for one call. With `wrapFetch`, it is a new client from
 * `create` whose requests go through the wrapper. The base fetch is the
 * config's own HTTP client, so its hooks and its fetcher still run.
 */
export function clientForCall<TClient>(
  client: TClient,
  options: OpenRouterClientOptions,
  wrapFetch: FetchWrapper | undefined,
  create: (options: OpenRouterClientOptions) => TClient,
) {
  if (!wrapFetch) return client
  const base = options.httpClient
  const wrapped = wrapFetch((input, init) => {
    const request = new Request(input, init)
    return base ? base.request(request) : fetch(request)
  })
  return create({
    ...options,
    httpClient: {
      // The client sends a Request. Send a URL and an init, as a plain fetch
      // call does, so a wrapper that reads `init.headers` keeps them.
      request: async (request) =>
        wrapped(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body && (await request.arrayBuffer()),
          signal: request.signal,
        }),
    },
  })
}
