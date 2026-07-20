import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { resolveTransport } from '../transport'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { CodegenServerConfig } from './define-config'

export interface ServerSurface {
  tools: Array<{
    name: string
    inputSchema: unknown
    outputSchema?: unknown
    description?: string
  }>
  resources: Array<{ uri: string; name?: string }>
  prompts: Array<{
    name: string
    arguments?: Array<{ name: string; required?: boolean }>
  }>
  capabilities: Record<string, unknown>
}

/** Drain a cursor-paginated MCP list endpoint into a single array. */
async function listAll<TItem>(
  fetchPage: (
    cursor: string | undefined,
  ) => Promise<{ items: Array<TItem>; nextCursor?: string }>,
): Promise<Array<TItem>> {
  const all: Array<TItem> = []
  let cursor: string | undefined
  do {
    const page = await fetchPage(cursor)
    all.push(...page.items)
    cursor = page.nextCursor
  } while (cursor)
  return all
}

export async function introspectFromTransport(
  transport: Transport,
): Promise<ServerSurface> {
  const client = new Client({
    name: 'tanstack-ai-mcp-codegen',
    version: '0.0.1',
  })
  try {
    await client.connect(transport)
    const caps = (client.getServerCapabilities() ?? {}) as Record<
      string,
      unknown
    >
    const tools = caps['tools']
      ? await listAll(async (cursor) => {
          const r = await client.listTools({ cursor })
          return { items: r.tools, nextCursor: r.nextCursor }
        })
      : []
    const resources = caps['resources']
      ? await listAll(async (cursor) => {
          const r = await client.listResources({ cursor })
          return { items: r.resources, nextCursor: r.nextCursor }
        })
      : []
    const prompts = caps['prompts']
      ? await listAll(async (cursor) => {
          const r = await client.listPrompts({ cursor })
          return { items: r.prompts, nextCursor: r.nextCursor }
        })
      : []
    return {
      tools: tools.map((t) => ({
        name: t.name,
        inputSchema: t.inputSchema,
        outputSchema: (t as { outputSchema?: unknown }).outputSchema,
        description: t.description,
      })),
      resources: resources.map((r) => ({ uri: r.uri, name: r.name })),
      prompts: prompts.map((p) => ({ name: p.name, arguments: p.arguments })),
      capabilities: caps,
    }
  } finally {
    // Guarded so a close() failure can't mask the original error.
    await client.close().catch(() => undefined)
  }
}

export async function introspectServer(
  config: CodegenServerConfig,
): Promise<ServerSurface> {
  const transport = await resolveTransport(config.transport)
  return introspectFromTransport(transport)
}
