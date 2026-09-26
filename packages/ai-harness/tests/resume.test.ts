import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { HARNESS_EVENTS, createHarnessHost, defineHarness } from '../src'
import { INTERRUPTED_TOOL_RESULT, LEASE } from '../src/resume'
import { gate, mockAdapter, text, toolCall } from './helpers'
import type { SessionEvent } from '../src'

describe('checkpoints and leases', () => {
  it('holds a lease and records the running tool with its replay mode', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const started = gate()
    const release = gate()
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Look up a fact',
      inputSchema: z.object({ q: z.string() }),
      replay: 'safe',
    }).server(async () => {
      started.open()
      await release.opened
      return 'found'
    })
    const { adapter } = mockAdapter([
      () => toolCall('lookup', { q: 'x' }),
      () => text('done'),
    ])
    const session = await host.open(
      defineHarness({ name: 'test/lease', adapter, tools: [lookup] }),
      { threadId: 't1' },
    )

    const turn = session.prompt('go')
    await started.opened
    const running = await persistence.stores.runs.get(turn.id)
    expect(running?.leaseOwner).toMatch(/^host-/)
    expect(running?.leaseExpiresAt).toBeGreaterThan(Date.now())
    expect(running?.leaseExpiresAt).toBeLessThanOrEqual(
      Date.now() + LEASE.ttlMs,
    )
    expect(running?.checkpoint?.pendingTools).toEqual([
      { toolCallId: 'call-1', name: 'lookup', replay: 'safe' },
    ])
    // The assistant message with the tool call is saved before the tool runs.
    const saved = await persistence.stores.messages.loadThread('t1')
    expect(saved.at(-1)?.toolCalls?.[0]?.function.name).toBe('lookup')

    release.open()
    await turn
    const finished = await persistence.stores.runs.get(turn.id)
    expect(finished?.checkpoint?.pendingTools).toEqual([])
    await host.close()
  })
})

describe('crash resume', () => {
  it('continues a crashed turn, runs safe tools again, and notes the others', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.messages.saveThread('t1', [
      { id: 'u1', role: 'user', content: 'refund and look up' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-charge',
            type: 'function',
            function: { name: 'charge', arguments: '{"cents":100}' },
          },
          {
            id: 'call-lookup',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":"x"}' },
          },
        ],
      },
    ])
    await persistence.stores.runs.createOrResume({
      runId: 'crashed-run',
      threadId: 't1',
      startedAt: Date.now() - 60_000,
    })
    await persistence.stores.runs.update('crashed-run', {
      leaseOwner: 'host-gone',
      leaseExpiresAt: Date.now() - 1_000,
      checkpoint: {
        at: Date.now() - 2_000,
        pendingTools: [
          { toolCallId: 'call-charge', name: 'charge', replay: 'never' },
          { toolCallId: 'call-lookup', name: 'lookup', replay: 'safe' },
        ],
      },
    })

    const charge = vi.fn(async () => 'charged')
    const lookup = vi.fn(async () => 'found')
    const tools = [
      toolDefinition({
        name: 'charge',
        description: 'Charge a card',
        inputSchema: z.object({ cents: z.number() }),
      }).server(charge),
      toolDefinition({
        name: 'lookup',
        description: 'Look up a fact',
        inputSchema: z.object({ q: z.string() }),
        replay: 'safe',
      }).server(lookup),
    ]
    const { adapter, calls } = mockAdapter([() => text('recovered')])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/resume', adapter, tools }),
      { threadId: 't1' },
    )

    const seen: Array<SessionEvent> = []
    const controller = new AbortController()
    const reading = (async () => {
      for await (const entry of session.events({
        from: '0',
        signal: controller.signal,
      })) {
        seen.push(entry)
      }
    })()
    await vi.waitFor(() => expect(session.snapshot().status).toBe('idle'))
    await vi.waitFor(() => expect(calls).toHaveLength(1))
    controller.abort()
    await reading

    expect(lookup).toHaveBeenCalledTimes(1)
    expect(charge).not.toHaveBeenCalled()
    const transcript = await persistence.stores.messages.loadThread('t1')
    const chargeResult = transcript.find(
      (message) =>
        message.role === 'tool' && message.toolCallId === 'call-charge',
    )
    expect(chargeResult?.content).toBe(JSON.stringify(INTERRUPTED_TOOL_RESULT))
    expect(transcript.at(-1)?.content).toBe('recovered')

    expect((await persistence.stores.runs.get('crashed-run'))?.status).toBe(
      'failed',
    )
    const resumed = seen.find(
      (entry) =>
        entry.event.type === EventType.CUSTOM &&
        entry.event.name === HARNESS_EVENTS.operationResumed,
    )
    expect(resumed?.event).toMatchObject({
      value: { resumedFrom: 'crashed-run' },
    })
    await host.close()
  })

  it('leaves a run alone while its lease is still valid', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.runs.createOrResume({
      runId: 'live-run',
      threadId: 't1',
      startedAt: Date.now(),
    })
    await persistence.stores.runs.update('live-run', {
      leaseOwner: 'host-other',
      leaseExpiresAt: Date.now() + 20_000,
    })
    const { adapter, calls } = mockAdapter([])
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/live', adapter }),
      {
        threadId: 't1',
      },
    )
    expect(session.snapshot().status).toBe('idle')
    expect(calls).toHaveLength(0)
    expect((await persistence.stores.runs.get('live-run'))?.status).toBe(
      'running',
    )
    await host.close()
  })
})
