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
