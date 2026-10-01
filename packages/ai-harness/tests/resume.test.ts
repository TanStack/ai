import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { HARNESS_EVENTS, createHarnessHost, defineHarness } from '../src'
import {
  INTERRUPTED_TOOL_RESULT,
  LEASE,
  checkpointMiddleware,
  repairTranscript,
} from '../src/resume'
import { gate, mockAdapter, text, toolCall } from './helpers'
import type { AnyChatMiddleware, AnyTool, ModelMessage } from '@tanstack/ai'
import type { SessionEvent } from '../src'

/** Run one chat() turn with the checkpoint middleware and a fresh run record. */
async function runWithCheckpoint(options: {
  replies: Parameters<typeof mockAdapter>[0]
  tools?: Array<AnyTool>
  middleware: (
    stores: ReturnType<typeof memoryPersistence>['stores'],
  ) => AnyChatMiddleware
}) {
  const { stores } = memoryPersistence()
  await stores.runs.createOrResume({
    runId: 'run-1',
    threadId: 't1',
    startedAt: Date.now(),
  })
  const { adapter } = mockAdapter(options.replies)
  const stream = chat({
    adapter,
    messages: [{ role: 'user', content: 'go' }],
    tools: options.tools ?? [],
    middleware: [options.middleware(stores)],
    threadId: 't1',
    runId: 'run-1',
    stream: true,
  })
  for await (const _chunk of stream) {
    // Run the turn to the end.
  }
  return stores
}

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
    // The model gets the note as a tool error.
    expect(chargeResult?.error).toBe(
      'The tool may or may not have run. Check before you retry.',
    )
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

  it('keeps the result of a tool that finished before the crash', async () => {
    const { stores } = memoryPersistence()
    await stores.messages.saveThread('t1', [
      { id: 'u1', role: 'user', content: 'charge' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-charge',
            type: 'function',
            function: { name: 'charge', arguments: '{}' },
          },
          {
            id: 'call-mail',
            type: 'function',
            function: { name: 'mail', arguments: '{}' },
          },
        ],
      },
    ])
    const finished: ModelMessage = {
      role: 'tool',
      toolCallId: 'call-charge',
      content: 'charged 100',
    }

    await repairTranscript({
      messages: stores.messages,
      threadId: 't1',
      pending: [
        { toolCallId: 'call-charge', name: 'charge', replay: 'never' },
        { toolCallId: 'call-mail', name: 'mail', replay: 'never' },
      ],
      finished: new Map([['call-charge', finished]]),
    })

    const tools = (await stores.messages.loadThread('t1')).filter(
      (message) => message.role === 'tool',
    )
    expect(tools).toEqual([
      { role: 'tool', toolCallId: 'call-charge', content: 'charged 100' },
      {
        role: 'tool',
        toolCallId: 'call-mail',
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: 'The tool may or may not have run. Check before you retry.',
      },
    ])
  })

  it('keeps a finished result that is no longer pending, in batch order', async () => {
    const { stores } = memoryPersistence()
    await stores.messages.saveThread('t1', [
      { id: 'u1', role: 'user', content: 'charge, then mail' },
      {
        id: 'a1',
        role: 'assistant',
        content: '',
        toolCalls: [
          {
            id: 'call-charge',
            type: 'function',
            function: { name: 'charge', arguments: '{}' },
          },
          {
            id: 'call-mail',
            type: 'function',
            function: { name: 'mail', arguments: '{}' },
          },
        ],
      },
    ])

    await repairTranscript({
      messages: stores.messages,
      threadId: 't1',
      // The charge ended, so only the mail is still pending.
      pending: [{ toolCallId: 'call-mail', name: 'mail', replay: 'never' }],
      finished: new Map([
        [
          'call-charge',
          { role: 'tool', toolCallId: 'call-charge', content: 'charged' },
        ],
      ]),
    })

    const tools = (await stores.messages.loadThread('t1')).filter(
      (message) => message.role === 'tool',
    )
    expect(tools.map((message) => message.toolCallId)).toEqual([
      'call-charge',
      'call-mail',
    ])
    expect(tools[0]?.content).toBe('charged')
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

describe('checkpoint middleware options', () => {
  it('uses the lease time it gets', async () => {
    const startedAt = Date.now()
    const stores = await runWithCheckpoint({
      replies: [() => text('done')],
      middleware: ({ runs, messages }) =>
        checkpointMiddleware({
          runs,
          messages,
          hostId: 'host-a',
          lease: { ttlMs: 5_000 },
        }),
    })

    const record = await stores.runs.get('run-1')
    expect(record?.leaseOwner).toBe('host-a')
    // 5 seconds, not the default 30 seconds.
    expect(record?.leaseExpiresAt).toBeGreaterThanOrEqual(startedAt + 5_000)
    expect(record?.leaseExpiresAt).toBeLessThan(startedAt + 15_000)
  })

  it('gives onToolResult the tool message of each call that ends', async () => {
    const seen: Array<{ toolCallId: string; message: ModelMessage }> = []
    const tools = [
      toolDefinition({ name: 'echo', description: 'Echo' }).server(
        async () => 'echoed',
      ),
      toolDefinition({ name: 'boom', description: 'Fail' }).server(async () => {
        throw new Error('boom failed')
      }),
    ]
    await runWithCheckpoint({
      replies: [
        () => toolCall('echo', {}, 'call-echo'),
        () => toolCall('boom', {}, 'call-boom'),
        () => text('done'),
      ],
      tools,
      middleware: ({ runs, messages }) =>
        checkpointMiddleware({
          runs,
          messages,
          hostId: 'host-a',
          onToolResult: (info) => {
            seen.push(info)
          },
        }),
    })

    expect(seen).toEqual([
      {
        toolCallId: 'call-echo',
        message: { role: 'tool', toolCallId: 'call-echo', content: 'echoed' },
      },
      {
        toolCallId: 'call-boom',
        message: {
          role: 'tool',
          toolCallId: 'call-boom',
          content: JSON.stringify({ error: 'boom failed' }),
          error: 'boom failed',
        },
      },
    ])
  })
})
