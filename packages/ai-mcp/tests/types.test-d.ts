import { expectTypeOf } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { createMCPClient } from '../src/client'
import type { MCPClient } from '../src/client'
import type { DescriptorFromServer } from '../src/direct-client'
import type { travelServer } from './fixtures/travel-server'
import type { MCPClients } from '../src/pool'
import type {
  MCPClientOptions,
  MappedServerTools,
  McpServerTool,
  McpToolMetadata,
  ServerDescriptor,
} from '../src/types'
import type { ServerTool } from '@tanstack/ai'
import type {
  CallToolResult,
  ToolAnnotations,
} from '@modelcontextprotocol/client'

interface WeatherServer extends ServerDescriptor {
  tools: { get_weather: { input: { city: string }; output: string } }
  resources: {}
  prompts: {}
  capabilities: { tools: {} }
}

declare const client: MCPClient<WeatherServer>

// Discovery: tools() (no args) resolves to typed ServerTools keyed by the
// descriptor — an array whose element matches ServerTool, and whose `name`
// is the descriptor's tool-name literal (the guarantee this path delivers;
// args/results stay untyped on discovery).
const discovered = await client.tools()
expectTypeOf(discovered).toBeArray()
expectTypeOf(discovered).items.toMatchTypeOf<ServerTool>()
expectTypeOf(discovered).items.toMatchTypeOf<{ name: 'get_weather' }>()

// Default (no generic): discovery still yields an array of ServerTool
// (unchanged from before the descriptor overlay was added).
declare const defaultClient: MCPClient
const defaultDiscovered = await defaultClient.tools()
expectTypeOf(defaultDiscovered).toBeArray()
expectTypeOf(defaultDiscovered).items.toMatchTypeOf<ServerTool>()

// Defs overload still yields per-def types via MappedServerTools.
const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get weather for a city',
  inputSchema: z.object({ city: z.string() }),
})
const bound = await client.tools([getWeather])
expectTypeOf(bound).toEqualTypeOf<MappedServerTools<[typeof getWeather]>>()

// `metadata.mcp` is typed on EVERY tools() path, so a consumer reads the
// server's title / annotations with no annotation, no optional chaining on
// `metadata`, and no cast.
expectTypeOf(discovered).items.toHaveProperty('metadata').toExtend<{
  mcp: McpToolMetadata
}>()
expectTypeOf(bound).items.toHaveProperty('metadata').toExtend<{
  mcp: McpToolMetadata
}>()
expectTypeOf(defaultDiscovered).items.toHaveProperty('metadata').toExtend<{
  mcp: McpToolMetadata
}>()

declare const pool: MCPClients
const pooled = await pool.tools()
expectTypeOf(pooled).items.toHaveProperty('metadata').toExtend<{
  mcp: McpToolMetadata
}>()

// The whole point: these resolve without help, and a misspelling is an error.
expectTypeOf(discovered[0]!.metadata.mcp.title).toEqualTypeOf<string>()
expectTypeOf(discovered[0]!.metadata.mcp.serverToolName).toEqualTypeOf<string>()
expectTypeOf(discovered[0]!.metadata.mcp.annotations).toEqualTypeOf<
  ToolAnnotations | undefined
>()
// @ts-expect-error — `annotaions` is not a field of McpToolMetadata.
discovered[0]!.metadata.mcp.annotaions

// An McpServerTool still drops into anything that wants a plain ServerTool
// (e.g. `chat({ tools })`) — the metadata guarantee only narrows.
expectTypeOf<McpServerTool>().toExtend<ServerTool>()

// A transport client typed from a createMCPServer object. `typeof` needs no
// runtime import of the server.
async function typedRemote() {
  const remote = await createMCPClient<typeof travelServer>({
    transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
  })
  expectTypeOf(remote).toEqualTypeOf<
    MCPClient<DescriptorFromServer<typeof travelServer>>
  >()
  const weather = await remote.callTool('get_weather', { city: 'Paris' })
  // get_weather has `outputSchema: z.string()`.
  expectTypeOf(weather.structuredContent).toEqualTypeOf<string | undefined>()
  await remote.readResource('file:///city-guide.md')
  await remote.getPrompt('trip_brief', { city: 'Paris' })
  const tools = await remote.tools()
  expectTypeOf(tools).items.toMatchTypeOf<{ name: 'get_weather' }>()

  // @ts-expect-error the tool name is not on this server
  await remote.callTool('missing', { city: 'Paris' })
  // @ts-expect-error city is a string
  await remote.callTool('get_weather', { city: 1 })
  // @ts-expect-error the URI is not on this server
  await remote.readResource('file:///missing.md')
  // @ts-expect-error the prompt name is not on this server
  await remote.getPrompt('missing', { city: 'Paris' })
  // @ts-expect-error city is a string
  await remote.getPrompt('trip_brief', { city: 1 })
}
void typedRemote

// Without a type argument, every name is accepted and results keep the SDK
// types.
async function untypedRemote() {
  const remote = await createMCPClient({
    transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
  })
  const result = await remote.callTool('anything', { any: 'args' })
  expectTypeOf(result).toEqualTypeOf<CallToolResult>()
  await remote.readResource('file:///anything.md')
  await remote.getPrompt('anything', { any: 'args' })
}
void untypedRemote

// Tool policy callbacks get the typed raw MCP tool definition.
const policy: MCPClientOptions = {
  transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
  toolFilter: (tool) => {
    expectTypeOf(tool.name).toEqualTypeOf<string>()
    expectTypeOf(tool.annotations).toEqualTypeOf<ToolAnnotations | undefined>()
    // @ts-expect-error - misspelled field
    void tool.annotaions
    return tool.annotations?.readOnlyHint === true
  },
  needsApproval: (tool) => tool.annotations?.destructiveHint !== false,
}
void policy
