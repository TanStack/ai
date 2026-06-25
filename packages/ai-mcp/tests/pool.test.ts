import { describe, expect, it } from 'vitest'
import { createMCPClients } from '../src/pool'
import {
  makeServerWithMismatchedResource,
  makeServerWithResource,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'

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

    await pool.clients.beta!.close()
    await expect(pool.tools()).rejects.toThrow(
      /Failed to list tools from MCP server\(s\): beta/,
    )
    await pool.close()
  })

  it('readResource routes to the owning client and returns its result', async () => {
    // alpha has no resources; res owns file:///hello.txt. The pool tries each
    // client and returns the first success, so it must reach `res`.
    const alpha = await makeServerWithWeatherTool()
    const res = await makeServerWithResource()
    await using pool = await createMCPClients({
      alpha: { transport: alpha.clientTransport },
      res: { transport: res.clientTransport },
    })
    const read = await pool.readResource('file:///hello.txt')
    expect(read.contents[0]).toMatchObject({
      uri: 'file:///hello.txt',
      text: 'hello from resource',
    })
  })

  it('readResource skips a client that resolves but returns a non-matching uri', async () => {
    // `mismatch` resolves the read without error but stamps a DIFFERENT uri on
    // its contents; the pool must skip it and reach the owning `res` server.
    const mismatch = await makeServerWithMismatchedResource()
    const res = await makeServerWithResource()
    await using pool = await createMCPClients({
      // mismatch first so it's tried before the owning server
      mismatch: { transport: mismatch.clientTransport },
      res: { transport: res.clientTransport },
    })
    const read = await pool.readResource('file:///hello.txt')
    expect(read.contents[0]).toMatchObject({
      uri: 'file:///hello.txt',
      text: 'hello from resource',
    })
  })

  it('readResource throws when no client can resolve the uri', async () => {
    const alpha = await makeServerWithWeatherTool()
    await using pool = await createMCPClients({
      alpha: { transport: alpha.clientTransport },
    })
    await expect(pool.readResource('file:///missing.txt')).rejects.toThrow()
  })

  it('getServers() returns each server descriptor keyed by config key', async () => {
    const a = await makeServerWithWeatherTool()
    const b = await makeServerWithWeatherTool()
    await using pool = await createMCPClients({
      alpha: { transport: a.clientTransport },
      beta: { transport: b.clientTransport, prefix: 'wx' },
    })
    expect(pool.getServers()).toEqual({
      // default prefix = config key
      alpha: { transport: a.clientTransport, prefix: 'alpha' },
      // explicit prefix wins
      beta: { transport: b.clientTransport, prefix: 'wx' },
    })
  })

  it('closes already-connected clients and throws if one server fails', async () => {
    const a = await makeServerWithWeatherTool()
    // Wrap alpha's transport close so we can assert cleanup actually ran.
    const originalClose = a.clientTransport.close.bind(a.clientTransport)
    let alphaClosed = false
    a.clientTransport.close = async () => {
      alphaClosed = true
      await originalClose()
    }
    const broken: Transport = {
      start: async () => {
        throw new Error('nope')
      },
      send: async () => {},
      close: async () => {},
    }
    await expect(
      createMCPClients({
        alpha: { transport: a.clientTransport },
        beta: { transport: broken },
      }),
    ).rejects.toThrow(/beta/)
    expect(alphaClosed).toBe(true)
  })
})
