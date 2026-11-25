import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import type {
  OAuthClientProvider,
  Transport,
} from '@modelcontextprotocol/client'
import {
  createEventHeaderLookup,
  encodeMcpHeaderValue,
} from './events/param-headers'
import type { EventHeaderLookup } from './events/param-headers'
import { isRecord } from './events/value'

export interface HttpTransportConfig {
  type: 'http'
  url: string
  headers?: Record<string, string>
  fetch?: typeof fetch
  authProvider?: OAuthClientProvider
}

export interface SseTransportConfig {
  type: 'sse'
  url: string
  headers?: Record<string, string>
  fetch?: typeof fetch
  authProvider?: OAuthClientProvider
}

/** stdio is declared here for typing but constructed only via `@tanstack/ai-mcp/stdio`. */
export interface StdioTransportConfig {
  type: 'stdio'
  command: string
  args?: Array<string>
  env?: Record<string, string>
  cwd?: string
}

export type TransportConfig =
  | HttpTransportConfig
  | SseTransportConfig
  | StdioTransportConfig

/** Either a built-in config or a ready-made Transport instance (escape hatch). */
export type TransportInput = TransportConfig | Transport

/**
 * Return true when `input` is already a Transport, not a config object.
 */
export function isTransportInstance(input: TransportInput): input is Transport {
  return 'start' in input && typeof input.start === 'function'
}

/**
 * SDK 2.1.0 does not send `Mcp-Name` or `Mcp-Param-*` for `events/*`.
 * SEP-3415 requires both on Streamable HTTP.
 */
async function eventsRpc(
  request: Request,
): Promise<{ name: string; args: unknown } | undefined> {
  if (request.method !== 'POST') return undefined
  let json: unknown
  try {
    json = await request.clone().json()
  } catch {
    return undefined
  }
  if (!isRecord(json)) return undefined
  if (
    json.method !== 'events/subscribe' &&
    json.method !== 'events/unsubscribe'
  ) {
    return undefined
  }
  if (!isRecord(json.params) || typeof json.params.name !== 'string') {
    return undefined
  }
  return { name: json.params.name, args: json.params.arguments }
}

function fetchWithMcpEventHeaders(
  baseFetch: typeof fetch,
  lookup: EventHeaderLookup,
): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    const rpc = await eventsRpc(request)
    if (rpc === undefined) return baseFetch(input, init)
    const headers = new Headers(request.headers)
    let changed = false
    if (!headers.has('mcp-name')) {
      headers.set('Mcp-Name', encodeMcpHeaderValue(rpc.name))
      changed = true
    }
    for (const [name, value] of Object.entries(
      lookup.headersFor(rpc.name, rpc.args),
    )) {
      headers.set(name, value)
      changed = true
    }
    if (!changed) return baseFetch(input, init)
    return baseFetch(new Request(request, { headers }))
  }
}

/**
 * A caller-built Streamable HTTP or SSE transport already closed over its
 * fetch. Replace `_fetch` so `send()` still gets the routing headers.
 * SDK 2.1.0 `send()` calls `(this._fetch ?? fetch)`.
 */
function wrapTransportFetch(
  transport: Transport,
  lookup: EventHeaderLookup,
): void {
  const current = Reflect.get(transport, '_fetch')
  const base = typeof current === 'function' ? (current as typeof fetch) : fetch
  Reflect.set(transport, '_fetch', fetchWithMcpEventHeaders(base, lookup))
}

/**
 * Build a Transport from HTTP config, SSE config, or an existing Transport.
 *
 * For stdio, build the Transport with `stdioTransport` and pass that instance.
 * Throws an Error when the config type is `stdio` or is not a known type.
 * With `events`, HTTP and SSE requests for `events/subscribe` and
 * `events/unsubscribe` get `Mcp-Name` and `Mcp-Param-*`.
 * A Transport instance is wrapped the same way when it has a fetch.
 */
export async function resolveTransport(
  input: TransportInput,
  options?: { events?: boolean; eventHeaders?: EventHeaderLookup },
) {
  const lookup = options?.events
    ? (options.eventHeaders ?? createEventHeaderLookup())
    : undefined
  if (isTransportInstance(input)) {
    if (lookup !== undefined) wrapTransportFetch(input, lookup)
    return input
  }
  const withEvents = (base?: typeof fetch) =>
    lookup !== undefined
      ? fetchWithMcpEventHeaders(base ?? fetch, lookup)
      : base

  switch (input.type) {
    case 'http':
      return new StreamableHTTPClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
        fetch: withEvents(input.fetch),
        authProvider: input.authProvider,
      })
    case 'sse':
      return new SSEClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
        fetch: withEvents(input.fetch),
        authProvider: input.authProvider,
      })
    case 'stdio':
      throw new Error(
        "stdio transport must be created via '@tanstack/ai-mcp/stdio': " +
          "import { stdioTransport } from '@tanstack/ai-mcp/stdio' and pass the result as `transport`.",
      )
    default: {
      const unknownConfig: never = input
      throw new Error(
        `Unknown MCP transport config: ${JSON.stringify(unknownConfig)}`,
      )
    }
  }
}
