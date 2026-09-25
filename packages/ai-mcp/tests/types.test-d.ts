import { expectTypeOf } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { MCPClient } from '../src/client'
import type { MCPClients } from '../src/pool'
import type {
  MappedServerTools,
  McpServerTool,
  McpToolMetadata,
  ServerDescriptor,
} from '../src/types'
import type { ServerTool } from '@tanstack/ai'
import type { ToolAnnotations } from '@modelcontextprotocol/sdk/types.js'

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
