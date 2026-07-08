import { expectTypeOf } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import type { MCPClient } from '../src/client'
import type { MappedServerTools, ServerDescriptor } from '../src/types'
import type { ServerTool } from '@tanstack/ai'

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
