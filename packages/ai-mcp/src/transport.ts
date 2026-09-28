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
export async function resolveTransport(input: TransportInput) {
  if (isTransportInstance(input)) return input

  switch (input.type) {
    case 'http':
      return new StreamableHTTPClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
        fetch: input.fetch,
        authProvider: input.authProvider,
      })
    case 'sse':
      return new SSEClientTransport(new URL(input.url), {
        requestInit: { headers: input.headers },
        fetch: input.fetch,
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
