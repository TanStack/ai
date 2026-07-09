/**
 * User-agent tagging for Vercel Sandbox traffic.
 *
 * The `@vercel/sandbox` SDK sends a `user-agent` of
 * `vercel/sandbox/<sdk-version> (…)` on every API request. We wrap the SDK's
 * `fetch` so each request also carries a `@tanstack/ai-sandbox-vercel` token.
 */

export const USER_AGENT_TOKEN = '@tanstack/ai-sandbox-vercel'

/**
 * Wraps a `fetch` so every request's `user-agent` contains the package name
 * (e.g. `vercel/sandbox/2.2.1 (…) @tanstack/ai-sandbox-vercel`). When no
 * `user-agent` is present, the token becomes the whole header.
 */
export function withSandboxUserAgent(
  inner: typeof globalThis.fetch = globalThis.fetch,
): typeof globalThis.fetch {
  return (input, init) => {
    const headers = new Headers(
      init?.headers ??
        (typeof input === 'object' && 'headers' in input
          ? input.headers
          : undefined),
    )
    const existing = headers.get('user-agent')
    headers.set(
      'user-agent',
      existing ? `${existing} ${USER_AGENT_TOKEN}` : USER_AGENT_TOKEN,
    )
    return inner(input, { ...init, headers })
  }
}
