import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { OAuthClientProvider } from '@modelcontextprotocol/sdk/client/auth.js'

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

/** Either a built-in config or a ready-made SDK Transport instance (escape hatch). */
export type TransportInput = TransportConfig | Transport

function isTransportInstance(input: TransportInput): input is Transport {
  return typeof (input as Transport).start === 'function'
}

export async function resolveTransport(
  input: TransportInput,
): Promise<Transport> {
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
    default:
      throw new Error(`Unknown MCP transport config: ${JSON.stringify(input)}`)
  }
}
