import type { SecurityEvent, SecurityNotifier } from './types'

/** A one-line, secret-free summary of an event, for a push body. */
export function describeEvent(event: SecurityEvent): string {
  switch (event.kind) {
    case 'auth_failure':
      return `Auth failure${event.client ? ` for ${event.client}` : ''}${
        event.ip ? ` from ${event.ip}` : ''
      }`
    case 'forbidden_scope':
      return `${event.client} was refused tool ${event.tool} (scope)`
    case 'egress_denied':
      return `Egress to ${event.origin} was refused${
        event.tool ? ` from ${event.tool}` : ''
      }`
    case 'rate_limited':
      return `${event.client} hit the rate limit`
    case 'approval_pending':
      return `Approval needed: ${event.summary} (${event.proposalId})`
    case 'malformed_request':
      return `Malformed request: ${event.detail}`
  }
}

/** A notifier that does nothing. Use it to turn notifications off on purpose. */
export function silentNotifier(): SecurityNotifier {
  return { notify: async () => {} }
}

/**
 * A notifier that pushes to an [ntfy](https://ntfy.sh) topic. Zero infra: the
 * body is the event summary. No secret or token is ever in the body.
 *
 * @param options.topic - The ntfy topic to publish to
 * @param options.priority - The ntfy priority header (1 to 5)
 * @param options.serverUrl - The ntfy server, `https://ntfy.sh` by default
 */
export function ntfyNotifier(options: {
  topic: string
  priority?: 1 | 2 | 3 | 4 | 5
  serverUrl?: string
  fetch?: (url: string, init?: RequestInit) => Promise<Response>
}): SecurityNotifier {
  const base = (options.serverUrl ?? 'https://ntfy.sh').replace(/\/+$/, '')
  const fetchImpl = options.fetch ?? fetch
  return {
    notify: async (event) => {
      const headers: Record<string, string> = { Title: `MCP: ${event.kind}` }
      if (options.priority !== undefined) {
        headers.Priority = String(options.priority)
      }
      // Best-effort. A down notifier must not break the request path.
      try {
        await fetchImpl(`${base}/${encodeURIComponent(options.topic)}`, {
          method: 'POST',
          headers,
          body: describeEvent(event),
        })
      } catch {
        // swallow
      }
    },
  }
}

/**
 * A notifier that POSTs the event as JSON to a webhook. Use it for Slack,
 * Discord, or your own handler.
 */
export function webhookNotifier(
  url: string,
  fetchImpl: (url: string, init?: RequestInit) => Promise<Response> = fetch,
): SecurityNotifier {
  return {
    notify: async (event) => {
      try {
        await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...event, text: describeEvent(event) }),
        })
      } catch {
        // swallow
      }
    },
  }
}

/**
 * Wraps a notifier so the same event kind for the same client is sent at most
 * once per window. A scanner cannot turn the tripwire into a self-DoS.
 *
 * @param inner - The notifier to protect
 * @param windowMs - The quiet window per key, 60000 ms by default
 * @param now - A clock in ms, for tests
 */
export function debounceNotifier(
  inner: SecurityNotifier,
  windowMs = 60_000,
  now: () => number = () => Date.now(),
): SecurityNotifier {
  const lastSent = new Map<string, number>()
  return {
    notify: async (event) => {
      const client = 'client' in event ? event.client : ''
      const key = `${event.kind}:${client ?? ''}`
      const at = now()
      const prev = lastSent.get(key)
      if (prev !== undefined && at - prev < windowMs) return
      lastSent.set(key, at)
      await inner.notify(event)
    },
  }
}
