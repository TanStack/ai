import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { applyInput, capabilitiesOf } from '../src/server'
import { permissions } from '../src/first-party/permissions'
import { gate, messageTexts, mockAdapter, text, toolCall } from './helpers'
import type { HarnessPlugin } from '../src'
import type { StreamChunk } from '@tanstack/ai'

const fetchStats = toolDefinition({
  name: 'fetch_stats',
  description: 'Deterministic stats for a ticket',
  inputSchema: z.object({ ticketId: z.string() }),
}).server(async ({ ticketId }) => ({ ticketId, count: 42 }))

const secretTool = toolDefinition({
  name: 'secret_tool',
  description: 'Not exposed',
  inputSchema: z.object({}),
}).server(async () => ({ ok: true }))

function setup(plugins: Array<HarnessPlugin> = []) {
  const { adapter, calls } = mockAdapter([() => text('hi')])
  const harness = defineHarness({
    name: 'test/tools',
    adapter,
    tools: [fetchStats, secretTool],
    plugins: () => plugins,
    expose: { tools: ['fetch_stats'] },
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  return { harness, host, calls }
}

const types = (events: Array<{ event: { type: string } }>) =>
  events.map(({ event }) => event.type)

describe('{ op: "tool" }', () => {
  it('runs an exposed tool with no model call and keeps the call in the transcript', async () => {
    const { harness, host, calls } = setup()
    const session = await host.open(harness, { threadId: 't-run' })

    const receipt = await applyInput({
      harness,
      session,
      input: {
        op: 'tool',
        name: 'fetch_stats',
        args: { ticketId: 'T-1042' },
        meta: { trigger: 'manual' },
      },
    })
    expect(receipt.status).toBe('accepted')
    const operation = session.operation(receipt.operationId ?? '')
    await operation
    expect(operation?.status()).toBe('completed')
    expect(calls).toHaveLength(0)

    const events: Array<{ event: StreamChunk }> = []
    for await (const entry of operation!.events({ from: '0' })) {
      events.push(entry)
    }
    const start = events.find(
      ({ event }) => event.type === 'TOOL_CALL_START',
    )?.event
    expect(start).toMatchObject({ toolCallName: 'fetch_stats' })
    const injection = events.find(
      ({ event }) =>
        event.type === 'CUSTOM' && event.name === 'tanstack.injection',
    )?.event
    expect(injection).toMatchObject({ value: { trigger: 'manual' } })
    expect(types(events)).toContain('TOOL_CALL_RESULT')

    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).toContain('T-1042')

    await host.close()
  })

  it('refuses a tool that is not in expose.tools', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-deny' })

    expect(
      await applyInput({
        harness,
        session,
        input: { op: 'tool', name: 'secret_tool' },
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })
    expect(
      await applyInput({
        harness,
        session,
        input: { op: 'tool', name: 'nope' },
      }),
    ).toMatchObject({ status: 'rejected', reason: 'not_exposed' })

    await host.close()
  })

  it('checks the args against the tool input schema', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-bad-args' })

    // Wire args are not typed, so a client can send the wrong shape.
    const receipt = await applyInput({
      harness,
      session,
      input: {
        op: 'tool',
        name: 'fetch_stats',
        args: { wrong: true },
      },
    })
    await session.operation(receipt.operationId ?? '')
    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).toMatch(/validation/i)

    await host.close()
  })

  it('follows permissions(): a deny rule stops the call', async () => {
    const { harness, host } = setup([
      permissions({ rules: [{ tool: 'fetch_stats', decision: 'deny' }] }),
    ])
    const session = await host.open(harness, { threadId: 't-rules' })

    await session
      .runTool({ name: 'fetch_stats', args: { ticketId: 'T-1' } })
      .then(
        () => {},
        () => {},
      )
    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).not.toContain('"count":42')

    await host.close()
  })

  it('follows permissions(): an ask rule asks before the call runs', async () => {
    const { harness, host } = setup([
      permissions({ rules: [{ tool: 'fetch_stats', decision: 'ask' }] }),
    ])
    const session = await host.open(harness, { threadId: 't-ask' })

    const operation = session.runTool({
      name: 'fetch_stats',
      args: { ticketId: 'T-2' },
    })
    // The approval is a turn wait at the boundary, answered with `resolve`.
    await vi.waitFor(
      () => expect(session.snapshot().pendingWaits).toHaveLength(1),
      { timeout: 5_000 },
    )
    const [wait] = session.snapshot().pendingWaits
    if (!wait) throw new Error('No approval.')
    expect(wait.kind).toBe('approval')
    const inputId = `answer:${wait.waitId}`
    await session.resolve({
      resume: [
        { interruptId: wait.waitId, status: 'resolved', payload: 'once' },
      ],
      inputId,
    })
    await session.settled({ inputId })
    void operation
    const transcript = await session.transcript()
    const result = transcript.find((message) => message.role === 'tool')
    expect(JSON.stringify(result?.content)).toContain('T-2')

    await host.close()
  })

  it('marks the exposed tools in the capabilities document', () => {
    const { harness } = setup()
    const byName = Object.fromEntries(
      capabilitiesOf(harness).tools.items.map((tool) => [
        tool.name,
        tool.exposed,
      ]),
    )
    expect(byName).toEqual({ fetch_stats: true, secret_tool: false })
  })

  it('answers a client input with the real receipt', async () => {
    const { harness, host } = setup()
    const session = await host.open(harness, { threadId: 't-receipt' })

    const input = {
      op: 'tool' as const,
      name: 'fetch_stats',
      args: { ticketId: 'T-7' },
      inputId: 'cron-1',
    }
    const first = await applyInput({ harness, session, input })
    expect(first).toMatchObject({ inputId: 'cron-1', status: 'accepted' })
    // A retry with other args under the same id is a conflict.
    expect(
      await applyInput({
        harness,
        session,
        input: { ...input, args: { ticketId: 'X' } },
      }),
    ).toMatchObject({
      inputId: 'cron-1',
      status: 'rejected',
      reason: 'conflict',
    })

    await host.close()
  })

  it('is refused while interrupts wait, as a prompt is', async () => {
    const risky = toolDefinition({
      name: 'risky',
      description: 'Needs approval',
      inputSchema: z.object({}),
      needsApproval: true,
    }).server(async () => 'done')
    const { adapter } = mockAdapter([() => toolCall('risky', {})])
    const harness = defineHarness({
      name: 'test/tools-interrupted',
      adapter,
      tools: [risky, fetchStats],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't-waiting' })
    await session.send('go')

    const operation = session.runTool({
      name: 'fetch_stats',
      args: { ticketId: 'T-3' },
    })
    expect(await operation.receipt).toMatchObject({
      status: 'rejected',
      reason: 'pending_interrupts',
    })
    await operation.then(
      () => {},
      () => {},
    )
    const transcript = await session.transcript()
    expect(JSON.stringify(transcript)).not.toContain('T-3')

    await host.close()
  })

  it('runs a steer sent during a tool turn as its own turn', async () => {
    const started = gate()
    const release = gate()
    const slow = toolDefinition({
      name: 'slow_sync',
      description: 'Waits for the test',
      inputSchema: z.object({}),
    }).server(async () => {
      started.open()
      await release.opened
      return { synced: true }
    })
    const { adapter, calls } = mockAdapter([() => text('answered')])
    const harness = defineHarness({
      name: 'test/tools-steer',
      adapter,
      tools: [slow],
      expose: { tools: ['slow_sync'] },
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 't-tool-steer' })

    const operation = session.runTool({ name: 'slow_sync', args: {} })
    await started.opened
    const receipt = await session.send('are you there?', { mode: 'steer' })
      .receipt
    release.open()
    await operation

    // The tool turn did not take the steer, so no model ran in it.
    const toolTurn = await session.settled({
      inputId: (await operation.receipt).inputId ?? '',
    })
    expect(toolTurn.outcome).toBe('completed')
    const steer = await session.settled({ inputId: receipt.inputId })
    expect(steer.outcome).toBe('completed')
    expect(steer.operationId).not.toBe(operation.id)
    expect(calls).toHaveLength(1)
    expect(messageTexts(calls[0]).at(-1)).toBe('are you there?')

    await host.close()
  })

  it('types expose.tools and the args from the harness tools', () => {
    expect(() =>
      defineHarness({
        name: 'test/tools-typo',
        tools: [fetchStats],
        // @ts-expect-error `fetch_stat` is not a harness tool.
        expose: { tools: ['fetch_stat'] },
      }),
    ).toThrow(/expose\.tools names "fetch_stat"/)

    const { harness } = setup()
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const check = async () => {
      const session = await host.open(harness, { threadId: 't-types' })
      // @ts-expect-error `ticketId` must be a string.
      void session.runTool({ name: 'fetch_stats', args: { ticketId: 1 } })
      // A plugin tool takes any args.
      void session.runTool({ name: 'plugin_tool', args: { anything: true } })
    }
    expect(check).toBeTypeOf('function')
  })
})
