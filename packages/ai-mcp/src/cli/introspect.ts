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

export async function introspectFromTransport(
  transport: Transport,
): Promise<ServerSurface> {
  const client = new Client({
    name: 'tanstack-ai-mcp-codegen',
    version: '0.0.1',
  })
  await client.connect(transport)
  try {
    const caps = (client.getServerCapabilities() ?? {}) as Record<
      string,
      unknown
    >
    const tools = caps['tools'] ? (await client.listTools()).tools : []
    const resources = caps['resources']
      ? (await client.listResources()).resources
      : []
    const prompts = caps['prompts'] ? (await client.listPrompts()).prompts : []
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
    await client.close()
  }
}

export async function introspectServer(
  config: CodegenServerConfig,
): Promise<ServerSurface> {
  const transport = await resolveTransport(config.transport)
  return introspectFromTransport(transport)
}
