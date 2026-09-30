import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { applyInput, createHarnessHost, defineHarness } from '../src'
import { mockAdapter, text, toolCall } from './helpers'

/** A tool that records the execution context it was called with. */
function captureTool() {
  const seen: Array<any> = []
  const tool = toolDefinition({
    name: 'capture_ctx',
    description: 'Records its execution context',
    inputSchema: z.object({}),
  }).server(async (_args, ctx) => {
    seen.push(ctx)
    return { ok: true }
  })
  return { tool, seen }
}

describe('systemPreamble on the prompt op', () => {
  it('prepends preamble strings ahead of the harness system prompts', async () => {
    const { adapter, calls } = mockAdapter([() => text('done')])
    const harness = defineHarness({
      name: 'test/preamble',
      adapter,
      systemPrompts: ['HARNESS_PROMPT'],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't-preamble' })

    await session.prompt('hello', {
      systemPreamble: ['MEMORY: intranet-only', 'MEMORY: watchlist=repo'],
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].systemPrompts).toEqual([
      'MEMORY: intranet-only',
      'MEMORY: watchlist=repo',
      'HARNESS_PROMPT',
    ])

    await host.close()
  })

  it('threads preamble through the protocol prompt op', async () => {
    const { adapter, calls } = mockAdapter([() => text('done')])
    const harness = defineHarness({
      name: 'test/preamble-protocol',
      adapter,
      systemPrompts: ['BASE'],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't-proto' })

    const operation = session.prompt('hi', { systemPreamble: ['PRE'] })
    await operation

    // The protocol layer must accept + forward the field.
    const receipt = await applyInput(harness, session, {
      op: 'prompt',
      message: 'again',
      systemPreamble: ['PRE2'],
    })
    expect(receipt.status).toBe('accepted')
    // wait for the second turn to reach the adapter
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls.at(-1).systemPrompts[0]).toBe('PRE2')

    await host.close()
  })
})

describe('tool execution context carries the calling thread', () => {
  it('an in-band tool sees the thread via context.context.threadId', async () => {
    const { tool, seen } = captureTool()
    const { adapter } = mockAdapter([
      () => toolCall('capture_ctx', {}),
      () => text('done'),
    ])
    const harness = defineHarness({
      name: 'test/inband-ctx',
      adapter,
      tools: [tool],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't-inband' })

    await session.prompt('go')

    expect(seen).toHaveLength(1)
    expect(seen[0].context.threadId).toBe('t-inband')
    expect(typeof seen[0].context.runId).toBe('string')

    await host.close()
  })

  it('an out-of-band tool sees the thread via the flat context.threadId', async () => {
    const { tool, seen } = captureTool()
    const { adapter } = mockAdapter([() => text('idle')])
    const harness = defineHarness({
      name: 'test/oob-ctx',
      adapter,
      tools: [tool],
      toolVisibility: { capture_ctx: 'public' },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't-oob' })

    await applyInput(harness, session, { op: 'tool', name: 'capture_ctx' })
    // let the tool op run
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(seen).toHaveLength(1)
    expect(seen[0].threadId).toBe('t-oob')
    expect(typeof seen[0].runId).toBe('string')

    await host.close()
  })
})
