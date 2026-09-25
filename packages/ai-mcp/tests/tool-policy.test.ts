import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { createMCPClient } from '../src/client'
import { MCPToolNotFoundError } from '../src/errors'
import { createMCPClients } from '../src/pool'
import { makeServerWithMixedTools } from './helpers/in-memory-server'
import type { McpTool } from '../src'

const readOnly = (tool: McpTool) => tool.annotations?.readOnlyHint === true

describe('toolFilter', () => {
  it('returns every tool when no filter is set', async () => {
    const { clientTransport } = await makeServerWithMixedTools()
    await using client = await createMCPClient({ transport: clientTransport })
    const names = (await client.tools()).map((t) => t.name)
    expect(names.sort()).toEqual(['get_weather', 'set_alert'])
  })

  it('drops tools the filter rejects, including unannotated ones', async () => {
    const { clientTransport } = await makeServerWithMixedTools()
    await using client = await createMCPClient({
      transport: clientTransport,
      toolFilter: readOnly,
    })
    const names = (await client.tools()).map((t) => t.name)
    expect(names).toEqual(['get_weather'])
  })

  it('receives the native (unprefixed) tool name', async () => {
    const { clientTransport } = await makeServerWithMixedTools()
    await using client = await createMCPClient({
      transport: clientTransport,
      prefix: 'wx',
      toolFilter: (tool) => tool.name === 'set_alert',
    })
    const names = (await client.tools()).map((t) => t.name)
    expect(names).toEqual(['wx_set_alert'])
  })

  it('throws MCPToolNotFoundError when an explicit definition is filtered out', async () => {
    const { clientTransport } = await makeServerWithMixedTools()
    await using client = await createMCPClient({
      transport: clientTransport,
      toolFilter: readOnly,
    })
    const setAlert = toolDefinition({
      name: 'set_alert',
      description: 'Create a weather alert',
      inputSchema: z.object({ city: z.string() }),
    })
    await expect(client.tools([setAlert])).rejects.toBeInstanceOf(
      MCPToolNotFoundError,
    )
  })

  it('applies per server in a pool', async () => {
    const a = await makeServerWithMixedTools()
    const b = await makeServerWithMixedTools()
    await using pool = await createMCPClients({
      locked: { transport: a.clientTransport, toolFilter: readOnly },
      open: { transport: b.clientTransport },
    })
    const names = (await pool.tools()).map((t) => t.name)
    expect(names.sort()).toEqual([
      'locked_get_weather',
      'open_get_weather',
      'open_set_alert',
    ])
  })
})

describe('needsApproval', () => {
  it('leaves discovered tools without approval by default', async () => {
    const { clientTransport } = await makeServerWithMixedTools()
    await using client = await createMCPClient({ transport: clientTransport })
    for (const tool of await client.tools()) {
      expect(tool.needsApproval).toBeFalsy()
    }
  })

  it('marks only the tools the predicate selects', async () => {
    const { clientTransport } = await makeServerWithMixedTools()
    await using client = await createMCPClient({
      transport: clientTransport,
      needsApproval: (tool) => !readOnly(tool),
    })
    const byName = Object.fromEntries(
      (await client.tools()).map((t) => [t.name, t.needsApproval]),
    )
    expect(byName).toEqual({ get_weather: undefined, set_alert: true })
  })

  it('does not change explicit definitions', async () => {
    const { clientTransport } = await makeServerWithMixedTools()
    await using client = await createMCPClient({
      transport: clientTransport,
      needsApproval: () => true,
    })
    const setAlert = toolDefinition({
      name: 'set_alert',
      description: 'Create a weather alert',
      inputSchema: z.object({ city: z.string() }),
    })
    const [tool] = await client.tools([setAlert])
    expect(tool?.needsApproval).toBeFalsy()
  })
})
