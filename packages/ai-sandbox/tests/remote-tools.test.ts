import { describe, expect, it } from 'vitest'
import {
  executeHostTool,
  remoteToolStubs,
  toolDescriptors,
} from '../src/remote-tools'
import type { RemoteToolExecutor } from '../src/remote-tools'
import type { AnyTool } from '@tanstack/ai'

const getTime: AnyTool = {
  name: 'getTime',
  description: 'returns the time',
  inputSchema: { type: 'object', properties: { tz: { type: 'string' } } },
  execute: (args) => Promise.resolve(`now in ${(args as { tz: string }).tz}`),
}

describe('remote-tools (co-located host-tool delegation)', () => {
  it('toolDescriptors serializes name/description/json-schema', () => {
    const [d] = toolDescriptors([getTime])
    expect(d).toEqual({
      name: 'getTime',
      description: 'returns the time',
      inputSchema: { type: 'object', properties: { tz: { type: 'string' } } },
    })
  })

  it('falls back to an empty object schema for a non-JSON-schema input', () => {
    const zodish: AnyTool = {
      name: 'x',
      description: 'd',
      // a Standard Schema (object) rather than a JSON-schema object
      inputSchema: { '~standard': { version: 1 } },
      execute: () => Promise.resolve(1),
    }
    expect(toolDescriptors([zodish])[0]!.inputSchema).toEqual({
      type: 'object',
      properties: {},
    })
  })

  it('remoteToolStubs builds tools whose execute delegates to the executor', async () => {
    const calls: Array<{ name: string; args: unknown }> = []
    const executor: RemoteToolExecutor = {
      execute: (name, args) => {
        calls.push({ name, args })
        return Promise.resolve(`remote:${name}`)
      },
    }
    const [stub] = remoteToolStubs(toolDescriptors([getTime]), executor)
    expect(stub!.name).toBe('getTime')
    expect(stub!.inputSchema).toEqual(getTime.inputSchema)
    const result = await stub!.execute!({ tz: 'utc' }, {})
    expect(result).toBe('remote:getTime')
    expect(calls).toEqual([{ name: 'getTime', args: { tz: 'utc' } }])
  })

  it('round-trips: a stub whose executor runs executeHostTool calls the REAL tool', async () => {
    // Simulates the container↔orchestrator loop without HTTP: the executor
    // (would be httpRemoteToolExecutor over the wire) runs the host tool.
    const executor: RemoteToolExecutor = {
      execute: (name, args) =>
        executeHostTool([getTime], name, args, { threadId: 'thread-1' }),
    }
    const [stub] = remoteToolStubs(toolDescriptors([getTime]), executor)
    expect(await stub!.execute!({ tz: 'mars' }, {})).toBe('now in mars')
  })

  it('executeHostTool throws for an unknown tool', async () => {
    await expect(
      executeHostTool([getTime], 'nope', {}, { threadId: 'thread-1' }),
    ).rejects.toThrow(/Unknown tool/)
  })

  it('executeHostTool refuses a tool with needsApproval', async () => {
    let ran = false
    const gated: AnyTool = {
      ...getTime,
      needsApproval: true,
      execute: () => {
        ran = true
        return Promise.resolve('ran')
      },
    }
    await expect(
      executeHostTool([gated], 'getTime', {}, { threadId: 'thread-1' }),
    ).rejects.toThrow(/needsApproval/)
    expect(ran).toBe(false)
  })

  it('executeHostTool forwards the thread id and context to the real tool', async () => {
    let seenCtx: unknown
    const tool: AnyTool = {
      name: 't',
      description: 'd',
      execute: (_args, ctx) => {
        seenCtx = ctx
        return Promise.resolve('ok')
      },
    }
    await executeHostTool(
      [tool],
      't',
      {},
      { threadId: 'thread-1', context: { userId: 'u1' } },
    )
    expect(seenCtx).toMatchObject({
      threadId: 'thread-1',
      context: { userId: 'u1' },
    })
  })
})
