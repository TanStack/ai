import { Client } from '@modelcontextprotocol/client'
import type { Transport } from '@modelcontextprotocol/client'
import { listPages } from '../list-pages'
import { resolveTransport } from '../transport'
import type { CodegenServerConfig } from './define-config'

/**
 * Tools, resources, prompts, and capabilities read from one MCP server.
 */
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

// A list call with no cursor reads every page and removes nextCursor.
// listPages must see each cursor. A repeated cursor then throws an Error.
function fetchListPage<
  MethodName extends 'tools/list' | 'resources/list' | 'prompts/list',
>(client: Client, method: MethodName, cursor: string | undefined) {
  if (cursor === undefined) {
    return client.request({ method })
  }
  const params: Record<string, unknown> = { cursor }
  return client.request({ method, params })
}

/**
 * Read tools, resources, prompts, and capabilities from one MCP server.
 *
 * `transport` is a client transport that is not connected yet.
 * The client tries protocol `2026-07-28` first.
 * If the server does not support that protocol, the client uses the 2025 initialize handshake.
 * This function throws an Error when connect fails, when a list repeats a cursor, or when a list passes the page cap.
 */
export async function introspectFromTransport(transport: Transport) {
  const client = new Client(
    { name: 'tanstack-ai-mcp-codegen', version: '0.0.1' },
    { versionNegotiation: { mode: 'auto' } },
  )
  try {
    await client.connect(transport)
    const reported = client.getServerCapabilities()
    const serverListsTools = reported?.tools !== undefined
    const serverListsResources = reported?.resources !== undefined
    const serverListsPrompts = reported?.prompts !== undefined
    const tools = serverListsTools
      ? await listPages(async (cursor) => {
          const page = await fetchListPage(client, 'tools/list', cursor)
          return { items: page.tools, nextCursor: page.nextCursor }
        })
      : []
    const resources = serverListsResources
      ? await listPages(async (cursor) => {
          const page = await fetchListPage(client, 'resources/list', cursor)
          return { items: page.resources, nextCursor: page.nextCursor }
        })
      : []
    const prompts = serverListsPrompts
      ? await listPages(async (cursor) => {
          const page = await fetchListPage(client, 'prompts/list', cursor)
          return { items: page.prompts, nextCursor: page.nextCursor }
        })
      : []
    const capabilities: Record<string, unknown> = {}
    if (reported !== undefined) {
      const entries = Object.entries(reported)
      for (const [key, entry] of entries) {
        capabilities[key] = entry
      }
    }
    return {
      tools: tools.map((tool) => ({
        name: tool.name,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
        description: tool.description,
      })),
      resources: resources.map((resource) => ({
        uri: resource.uri,
        name: resource.name,
      })),
      prompts: prompts.map((prompt) => ({
        name: prompt.name,
        arguments: prompt.arguments,
      })),
      capabilities,
    }
  } finally {
    // A close failure must not hide the original error.
    await client.close().catch(() => undefined)
  }
}

/**
 * Connect to the server in `config` and read its surface.
 *
 * `config` is one server from the codegen config.
 * This function throws an Error for the same failures as `introspectFromTransport`.
 */
export async function introspectServer(config: CodegenServerConfig) {
  const transport = await resolveTransport(config.transport)
  return introspectFromTransport(transport)
}
