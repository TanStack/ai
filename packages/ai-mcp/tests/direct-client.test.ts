import { toolDefinition } from '@tanstack/ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createMCPClient } from '../src/client'
import { ToolInputRequiredError } from '../src/server/context'
import type { MCPToolContext } from '../src/server/context'
import { createMCPServer } from '../src/server/create-server'
import { travelClient } from './direct-client-boundary'
import { travelServer } from './fixtures/travel-server'

function contextServer() {
  return createMCPServer({
    name: 'context',
    version: '1.0.0',
    sample: async () => 'from-sample',
    tools: [
      toolDefinition({
        name: 'ask',
        description: 'Asks the user',
        inputSchema: z.object({ city: z.string() }),
      }).server<MCPToolContext>(async (_args, ctx) =>
        String(await ctx.context.requestInput({ message: 'Which day?' })),
      ),
      toolDefinition({
        name: 'draft',
        description: 'Uses the sample option',
      }).server<MCPToolContext>(async (_args, ctx) =>
        String(await ctx.context.sample({ messages: [] })),
      ),
    ],
  })
}

describe('createMCPClient({ server })', () => {
  it('calls the tool, the resource, and the prompt on the server object', async () => {
    const client = await travelClient()
    const forecast = await client.callTool('get_weather', { city: 'Paris' })
    const guide = await client.readResource('file:///city-guide.md')
    const brief = await client.getPrompt('trip_brief', { city: 'Paris' })
    const typedForecast: string = forecast

    expect(typedForecast).toBe('Sunny in Paris')
    expect(guide).toEqual({ text: '# Paris\n\nPack a light jacket.' })
    expect(brief).toEqual([
      { role: 'user', content: 'Write a one-day plan for Paris.' },
    ])
  })

  it('throws when the tool name is not on the server', async () => {
    const client = await travelClient()
    const missing = client as {
      callTool: (name: string, args: { city: string }) => Promise<unknown>
    }
    await expect(
      missing.callTool('missing', { city: 'Paris' }),
    ).rejects.toThrow('The MCP server has no tool missing.')
  })

  it('gives the tool ctx.context.requestInput, which throws ToolInputRequiredError', async () => {
    const client = await createMCPClient({ server: contextServer() })
    await expect(
      client.callTool('ask', { city: 'Paris' }),
    ).rejects.toBeInstanceOf(ToolInputRequiredError)
  })

  it('gives the tool ctx.context.sample from the server sample option', async () => {
    const client = await createMCPClient({ server: contextServer() })
    expect(await client.callTool('draft', {})).toBe('from-sample')
  })

  it('rejects args that do not match the input schema', async () => {
    const client = await createMCPClient({ server: contextServer() })
    const loose = client as {
      callTool: (name: string, args: unknown) => Promise<unknown>
    }
    await expect(loose.callTool('ask', { city: 1 })).rejects.toThrow()
  })
})

function rejectedCalls() {
  return travelClient().then((client) => {
    // @ts-expect-error the tool name is not on this server
    void client.callTool('missing', { city: 'Paris' })
    // @ts-expect-error city is a string
    void client.callTool('get_weather', { city: 1 })
    // @ts-expect-error the URI is not on this server
    void client.readResource('file:///missing.md')
    // @ts-expect-error the prompt name is not on this server
    void client.getPrompt('missing', { city: 'Paris' })
    // @ts-expect-error city is a string
    void client.getPrompt('trip_brief', { city: 1 })
  })
}

void rejectedCalls
void travelServer
