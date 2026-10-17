import {
  SSEClientTransport,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import type {
  OAuthClientProvider,
  Transport,
} from '@modelcontextprotocol/client'

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
 * Build a Transport from HTTP config, SSE config, or an existing Transport.
 *
 * For stdio, build the Transport with `stdioTransport` and pass that instance.
 * Throws an Error when the config type is `stdio` or is not a known type.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * SDK 2.1.0 does not send `Mcp-Name` for custom `events/*` methods.
 * SEP-3415 requires it on Streamable HTTP for name-scoped events requests.
 */
async function mcpNameFromRpc(request: Request): Promise<string | undefined> {
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
  return json.params.name
}

const MCP_NAME_SENTINEL_PREFIX = '=?base64?'
const MCP_NAME_SENTINEL_SUFFIX = '?='

/**
 * Copy of SDK 2.1.0 `needsBase64` / `encodeMcpParamValue` (not exported).
 * Printable ASCII with no leading/trailing whitespace is sent as-is.
 * Anything else uses `=?base64?{b64-of-utf8}?=` so `Headers.set` stays ASCII.
 */
function needsBase64(value: string): boolean {
  if (value.length === 0) return true
  if (
    value.startsWith(MCP_NAME_SENTINEL_PREFIX) &&
    value.endsWith(MCP_NAME_SENTINEL_SUFFIX)
  ) {
    return true
  }
  if (value !== value.trim()) return true
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i)
    if (code === 9 || (code !== undefined && code >= 32 && code <= 126)) {
      continue
    }
    return true
  }
  return false
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return btoa(binary)
}

function encodeMcpName(value: string): string {
  return needsBase64(value)
    ? `${MCP_NAME_SENTINEL_PREFIX}${utf8ToBase64(value)}${MCP_NAME_SENTINEL_SUFFIX}`
    : value
}

function fetchWithMcpEventName(baseFetch: typeof fetch = fetch): typeof fetch {
  return async (input, init) => {
    const request = new Request(input, init)
    if (request.headers.has('mcp-name')) {
      return baseFetch(input, init)
    }
    const name = await mcpNameFromRpc(request)
    if (name === undefined) return baseFetch(input, init)
    const headers = new Headers(request.headers)
    headers.set('Mcp-Name', encodeMcpName(name))
    return baseFetch(new Request(request, { headers }))
  }
}

export async function resolveTransport(input: TransportInput) {
  if (isTransportInstance(input)) return input

  switch (input.type) {
    case 'http':
      return new StreamableHTTPClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
        fetch: fetchWithMcpEventName(input.fetch),
        authProvider: input.authProvider,
      })
    case 'sse':
      return new SSEClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
        fetch: fetchWithMcpEventName(input.fetch),
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
