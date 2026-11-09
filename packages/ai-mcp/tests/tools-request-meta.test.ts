import { InMemoryTransport } from '@modelcontextprotocol/client'
import { Server } from '@modelcontextprotocol/server'
import { toolDefinition } from '@tanstack/ai'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createMCPClientFromTransport } from '../src/client'
import { createMCPClients } from '../src/pool'
import type { MCPRequestMeta, MCPRequestMetaInput } from '@tanstack/ai'

interface CallRecord {
  who: unknown
  meta: unknown
}

// A raw server with one `echo` tool. It keeps the `who` arg and the `_meta`
// of each tools/call it gets.
async function makeRecordingServer() {
  const calls: Array<CallRecord> = []
  const server = new Server(
    { name: 'meta', version: '1.0.0' },
    { capabilities: { tools: {} } },
  )
  server.setRequestHandler('tools/list', () => ({
    tools: [
      {
        name: 'echo',
        inputSchema: {
          type: 'object' as const,
          properties: { who: { type: 'string' } },
        },
      },
    ],
  }))
  server.setRequestHandler('tools/call', (request) => {
    calls.push({
      who: request.params.arguments?.who,
      meta: request.params._meta,
    })
    return { content: [{ type: 'text' as const, text: 'ok' }] }
  })
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair()
  await server.connect(serverTransport)
  return { clientTransport, calls }
}

// A hook that keeps each input it gets and returns `meta`.
function recordingHook(meta: Record<string, unknown>) {
  const inputs: Array<MCPRequestMetaInput> = []
  const hook: MCPRequestMeta = (request) => {
    inputs.push(request)
    return meta
  }
  return { hook, inputs }
}

const echoDef = toolDefinition({
  name: 'echo',
  description: 'Echo',
  inputSchema: z.object({ who: z.string() }),
})

describe('tools({ requestMeta })', () => {
  it('auto-discovered tool sends hook meta', async () => {
    const { clientTransport, calls } = await makeRecordingServer()
    await using client = await createMCPClientFromTransport(
      clientTransport,
      'store',
    )
    const { hook, inputs } = recordingHook({ 'acme.com/tenant': 't1' })
    const [tool] = await client.tools({ requestMeta: hook })
    await tool!.execute!({ who: 'a' })
    expect(inputs).toEqual([
      {
        method: 'tools/call',
        serverId: 'store',
        toolName: 'echo',
        args: { who: 'a' },
      },
    ])
    expect(calls[0]?.meta).toMatchObject({ 'acme.com/tenant': 't1' })
  })

  it('explicit tools(defs) tool sends hook meta', async () => {
    const { clientTransport, calls } = await makeRecordingServer()
    await using client = await createMCPClientFromTransport(
      clientTransport,
      'store',
    )
    const { hook, inputs } = recordingHook({ tenant: 't2' })
    const [tool] = await client.tools([echoDef], { requestMeta: hook })
    await tool.execute!({ who: 'b' })
    expect(inputs).toEqual([
      {
        method: 'tools/call',
        serverId: 'store',
        toolName: 'echo',
        args: { who: 'b' },
      },
    ])
    expect(calls[0]?.meta).toMatchObject({ tenant: 't2' })
  })

  it('lazy tools send hook meta', async () => {
    const { clientTransport, calls } = await makeRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    const { hook } = recordingHook({ tenant: 't3' })
    const [tool] = await client.tools({ lazy: true, requestMeta: hook })
    expect(tool!.lazy).toBe(true)
    await tool!.execute!({ who: 'c' })
    expect(calls[0]?.meta).toMatchObject({ tenant: 't3' })
  })

  it('pool.tools({ requestMeta }) calls the hook with each server id', async () => {
    const alpha = await makeRecordingServer()
    const beta = await makeRecordingServer()
    await using pool = await createMCPClients({
      alpha: { transport: alpha.clientTransport },
      beta: { transport: beta.clientTransport },
    })
    const tools = await pool.tools({
      requestMeta: (request) => ({ server: request.serverId }),
    })
    for (const tool of tools) await tool.execute!({ who: 'd' })
    expect(alpha.calls.map((call) => call.meta)).toMatchObject([
      { server: 'alpha' },
    ])
    expect(beta.calls.map((call) => call.meta)).toMatchObject([
      { server: 'beta' },
    ])
  })

  it('two tools() calls with different hooks stay separate', async () => {
    const { clientTransport, calls } = await makeRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    // Each hook waits, so both calls are in flight at the same time.
    const delayedHook =
      (tenant: string): MCPRequestMeta =>
      async () => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        return { tenant }
      }
    const [runA] = await client.tools({ requestMeta: delayedHook('a') })
    const [runB] = await client.tools({ requestMeta: delayedHook('b') })
    await Promise.all([
      runA!.execute!({ who: 'a' }),
      runB!.execute!({ who: 'b' }),
      runA!.execute!({ who: 'a' }),
      runB!.execute!({ who: 'b' }),
    ])
    expect(calls).toHaveLength(4)
    for (const call of calls) {
      expect(call.meta).toMatchObject({ tenant: call.who })
    }
  })

  it('hook rejection fails the tool call with that error', async () => {
    const { clientTransport, calls } = await makeRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    const failure = new Error('no tenant')
    const [tool] = await client.tools({
      requestMeta: () => Promise.reject(failure),
    })
    await expect(tool!.execute!({ who: 'e' })).rejects.toBe(failure)
    expect(calls).toEqual([])
  })

  it('sends no user meta keys without a hook', async () => {
    const { clientTransport, calls } = await makeRecordingServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    const [tool] = await client.tools()
    await tool!.execute!({ who: 'f' })
    expect(calls).toHaveLength(1)
    // The SDK may add its own keys. No test key may appear.
    expect(calls[0]?.meta ?? {}).not.toHaveProperty('tenant')
    expect(calls[0]?.meta ?? {}).not.toHaveProperty('server')
  })
})
