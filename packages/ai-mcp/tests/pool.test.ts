import { describe, expect, it } from 'vitest'
import { makeServerWithWeatherTool } from './helpers/in-memory-server'
import { createMCPClients } from '../src/pool'

describe('createMCPClients', () => {
  it('connects to many servers and flattens auto-prefixed tools', async () => {
    const a = await makeServerWithWeatherTool()
    const b = await makeServerWithWeatherTool()
    await using pool = await createMCPClients({
      alpha: { transport: a.clientTransport },
      beta: { transport: b.clientTransport },
    })
    const names = (await pool.tools()).map((t) => t.name)
    expect(names).toContain('alpha_get_weather')
    expect(names).toContain('beta_get_weather') // no collision despite same server tool name
  })

  it('exposes typed per-server access via .clients', async () => {
    const a = await makeServerWithWeatherTool()
    await using pool = await createMCPClients({
      alpha: { transport: a.clientTransport },
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    expect(await pool.clients.alpha!.tools()).toBeDefined()
  })

  it('forwards ToolsOptions (lazy) to every server', async () => {
    const a = await makeServerWithWeatherTool()
    const b = await makeServerWithWeatherTool()
    await using pool = await createMCPClients({
      alpha: { transport: a.clientTransport },
      beta: { transport: b.clientTransport },
    })
    const tools = await pool.tools({ lazy: true })
    expect(tools.length).toBeGreaterThan(0)
    expect(tools.every((t) => t.lazy === true)).toBe(true)
  })

  it('names the failing server by config key when tools() discovery fails', async () => {
    const a = await makeServerWithWeatherTool()
    const b = await makeServerWithWeatherTool()
    const pool = await createMCPClients({
      alpha: { transport: a.clientTransport },
      beta: { transport: b.clientTransport },
    })
    // Force a per-server discovery failure after connect.
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await pool.clients.beta!.close()
    await expect(pool.tools()).rejects.toThrow(
      /Failed to list tools from MCP server\(s\): beta/,
    )
    await pool.close()
  })

  it('closes already-connected clients and throws if one server fails', async () => {
    const a = await makeServerWithWeatherTool()
    const broken = {
      start: async () => {
        throw new Error('nope')
      },
      send: async () => {},
      close: async () => {},
    }
    await expect(
      createMCPClients({
        alpha: { transport: a.clientTransport },
        beta: { transport: broken as any },
      }),
    ).rejects.toThrow(/beta/)
  })
})
