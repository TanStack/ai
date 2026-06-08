import { CliError } from '../core/exit-codes'
import type * as McpModule from '@tanstack/ai-mcp'
import type * as McpStdioModule from '@tanstack/ai-mcp/stdio'

/** A connected MCP client, structurally compatible with chat()'s `mcp.clients`. */
export interface McpClientLike {
  tools: (options?: { lazy?: boolean }) => Promise<Array<unknown>>
  close: () => Promise<void>
}

/**
 * Build connected MCP clients from `--mcp` specs. A spec is either an HTTP(S)
 * URL (streamable-HTTP transport) or a shell command (stdio transport), e.g.
 *   --mcp https://example.com/mcp
 *   --mcp "npx -y @modelcontextprotocol/server-filesystem /tmp"
 *
 * `@tanstack/ai-mcp` is imported lazily so the machine path that doesn't use
 * tools never loads it.
 */
export async function buildMcpClients(
  specs: Array<string>,
): Promise<Array<McpClientLike>> {
  if (specs.length === 0) return []

  let mcp: typeof McpModule
  let stdio: typeof McpStdioModule
  try {
    mcp = await import('@tanstack/ai-mcp')
    stdio = await import('@tanstack/ai-mcp/stdio')
  } catch (cause) {
    throw new CliError(
      'PROVIDER_NOT_INSTALLED',
      'MCP support requires @tanstack/ai-mcp. Install it: pnpm add @tanstack/ai-mcp',
      { detail: { package: '@tanstack/ai-mcp' }, cause },
    )
  }

  const clients: Array<McpClientLike> = []
  for (const spec of specs) {
    const httpTransport: { type: 'http'; url: string } = {
      type: 'http',
      url: spec,
    }
    const transport = isUrl(spec)
      ? httpTransport
      : stdio.stdioTransport(parseCommand(spec))
    try {
      const client = await mcp.createMCPClient({ transport })
      clients.push(client)
    } catch (cause) {
      // Don't leak the connections opened so far if a later one fails.
      await Promise.all(clients.map((c) => c.close().catch(() => undefined)))
      throw new CliError(
        'RUNTIME',
        `Failed to connect to MCP server "${spec}".`,
        { cause },
      )
    }
  }
  return clients
}

function isUrl(spec: string): boolean {
  return /^https?:\/\//i.test(spec)
}

/**
 * Tokenize a command string into argv, respecting single/double quotes so paths
 * with spaces survive, e.g. `node "C:\Program Files\srv.js" --flag`.
 */
export function tokenizeCommand(spec: string): Array<string> {
  const tokens: Array<string> = []
  let current = ''
  let quote: '"' | "'" | null = null
  let started = false
  for (const ch of spec) {
    if (quote) {
      if (ch === quote) quote = null
      else current += ch
    } else if (ch === '"' || ch === "'") {
      quote = ch
      started = true
    } else if (/\s/.test(ch)) {
      if (started) {
        tokens.push(current)
        current = ''
        started = false
      }
    } else {
      current += ch
      started = true
    }
  }
  if (started) tokens.push(current)
  return tokens
}

function parseCommand(spec: string): { command: string; args: Array<string> } {
  const [command, ...args] = tokenizeCommand(spec)
  if (!command) {
    throw new CliError('USAGE', `Invalid --mcp spec: "${spec}".`)
  }
  return { command, args }
}
