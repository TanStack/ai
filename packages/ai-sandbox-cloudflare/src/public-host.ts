/**
 * Host resolution for the two DISTINCT public surfaces the sandbox layer exposes.
 * Kept in its own (Workers-free) module so it stays pure and unit-testable.
 *
 * These were once a single `PUBLIC_HOSTNAME`, but they have different reachers and
 * therefore different correct values:
 *
 *  - **Bridge / tool-exec** — the off-isolate CONTAINER calls back into the Worker
 *    (`/_bridge`, `/tool-exec`). It must reach the Worker, so locally that's
 *    `host.docker.internal` (the container can't reach the host's `localhost`).
 *  - **Preview** — the BROWSER opens an `exposePort` URL that `proxyToSandbox`
 *    routes into the container. It needs WILDCARD DNS, so locally that's
 *    `*.localhost` (browsers resolve it to loopback with zero setup) and in
 *    production a CUSTOM DOMAIN (`*.workers.dev` has no wildcard subdomains).
 */

/** Hostnames that mean "this machine" (the loopback the container can't reach). */
function isLoopbackHost(host: string): boolean {
  const name = host.split(':')[0]
  return name === 'localhost' || name === '127.0.0.1' || name === '0.0.0.0'
}

/** The port portion of a `host[:port]`, or `fallback` when none is present. */
function portOf(host: string, fallback: string): string {
  const colon = host.indexOf(':')
  return colon === -1 ? fallback : host.slice(colon + 1)
}

/** `http://` for local hosts (loopback / host.docker.internal), `https://` else. */
function originForHost(host: string): string {
  const name = host.split(':')[0]
  const scheme =
    isLoopbackHost(host) || name === 'host.docker.internal' ? 'http' : 'https'
  return `${scheme}://${host}`
}

/**
 * Resolve the ORIGIN the off-isolate sandbox CONTAINER uses to call back into the
 * Worker — the MCP tool-bridge (`/_bridge`) and host-tool execution (`/tool-exec`).
 * Returns a full origin (scheme + host + optional port), e.g.
 * `http://host.docker.internal:3001` locally or `https://app.example.com` deployed.
 *
 * `PUBLIC_HOSTNAME` wins when set; otherwise we derive from the host the trigger
 * request arrived on (`input.publicHost`).
 *
 * ── Why a callback hostname is unavoidable ──────────────────────────────────────
 * The container is SEPARATE compute from the Worker isolate; it can only reach the
 * Worker over the network, so the callback URL must be an absolute host.
 *
 * ── Why request-derivation is SAFE on Cloudflare ────────────────────────────────
 * On a generic Node server the `Host` header is attacker-controlled and trusting it
 * is a Host-injection / token-exfil vector (the per-run bearer token rides this
 * URL). Not so behind Cloudflare: the edge dispatches a request to your Worker only
 * when its hostname matches a route you OWN, so `input.publicHost` is always one of
 * your own hostnames — never an attacker's.
 *
 * ── Local dev: localhost → host.docker.internal ─────────────────────────────────
 * Locally the trigger arrives on `localhost`, which the container CANNOT reach
 * (that's the container's own loopback). So we rewrite it to `host.docker.internal`
 * (the Docker host gateway), keeping the port, over `http`. This removes the need
 * for a dev tunnel for the bridge entirely.
 */
export function resolveBridgeOrigin(
  env: { PUBLIC_HOSTNAME?: string },
  input: { publicHost?: string },
): string {
  const configured = env.PUBLIC_HOSTNAME?.trim()
  if (configured) return originForHost(configured)
  const host = input.publicHost
  if (!host) {
    throw new Error(
      'sandbox agent: no bridge host available — set PUBLIC_HOSTNAME, or run ' +
        'behind Cloudflare so the Worker can derive it from the trigger request.',
    )
  }
  // Local dev: the container reaches the host machine via the Docker host gateway.
  if (isLoopbackHost(host)) {
    return `http://host.docker.internal:${portOf(host, '3001')}`
  }
  return originForHost(host)
}

/**
 * Resolve the HOST passed to `exposePort` for browser-facing preview URLs (the app
 * the agent builds). Returns a bare host (the `@cloudflare/sandbox` SDK builds the
 * `<port>-<id>-<token>.<host>` URL + scheme itself).
 *
 * `PREVIEW_HOSTNAME` wins when set; otherwise we derive from the trigger request.
 *
 * Preview URLs require WILDCARD DNS, which constrains the value:
 *  - **Local** → `localhost:<port>`. The SDK's localhost path yields
 *    `http://<port>-<id>-<token>.localhost:<port>`, which browsers resolve to
 *    loopback with no DNS setup — so previews work locally with no tunnel.
 *  - **Deployed** → a CUSTOM DOMAIN with a `*.<domain>` route. `*.workers.dev` has
 *    no wildcard subdomains (the SDK's `exposePort` throws on it), so we throw a
 *    clear error pointing at `PREVIEW_HOSTNAME` rather than letting the run fail
 *    deep in the agent.
 */
export function resolvePreviewHost(
  env: { PREVIEW_HOSTNAME?: string },
  input: { publicHost?: string },
): string {
  const configured = env.PREVIEW_HOSTNAME?.trim()
  if (configured) return configured
  const host = input.publicHost
  if (!host) {
    throw new Error(
      'sandbox agent: no preview host available — set PREVIEW_HOSTNAME to a ' +
        'custom domain with a wildcard route.',
    )
  }
  if (isLoopbackHost(host)) return host
  if (host.endsWith('.workers.dev')) {
    throw new Error(
      'sandbox agent: preview URLs need a custom domain with wildcard DNS — ' +
        '*.workers.dev has no wildcard subdomains. Set PREVIEW_HOSTNAME to your ' +
        'custom domain and add a `*.<domain>` route to the Worker.',
    )
  }
  return host
}
