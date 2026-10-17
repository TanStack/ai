import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import {
  INTERRUPTED_TOOL_RESULT,
  LEASE,
  TRUNCATED_TOOL_RESULT,
  checkpointMiddleware,
  holdRunLease,
  repairTranscript,
} from '../src/resume'
import { gate, mockAdapter, text, toolCall } from './helpers'
import type { AnyChatMiddleware, AnyTool, ModelMessage } from '@tanstack/ai'

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

/** A background agent that runs until it is cancelled. */
const waiter = defineAgent({
  name: 'waiter',
  description: 'Waits until it is cancelled',
  run: (ctx) =>
    new Promise<string>((resolve) =>
      ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
    ),
})

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
      {
        threadId: 't1',
      },
    )

    const turn = session.send('go')
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
    const saved = await session.transcript()
    expect(saved.at(-1)?.toolCalls?.[0]?.function.name).toBe('lookup')

    release.open()
    await turn
    const finished = await persistence.stores.runs.get(turn.id)
    expect(finished?.checkpoint?.pendingTools).toEqual([])
    await host.close()
  })

  it('holds a lease on a background agent run', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const { adapter } = mockAdapter([])
    const session = await host.open(
      defineHarness({
        name: 'test/agent-lease',
        adapter,
        agents: [waiter],
      }),
      {
        threadId: 't1',
      },
    )

    const run = session.agents.waiter.start()
    await vi.waitFor(async () =>
      expect(
        (await persistence.stores.runs.get(run.id))?.leaseExpiresAt,
      ).toBeGreaterThan(Date.now()),
    )
    expect((await persistence.stores.runs.get(run.id))?.leaseOwner).toMatch(
      /^host-/,
    )
    await host.close()
  })
})

describe('crash resume', () => {
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

  it('puts a repaired result right after its tool call, before a later message', async () => {
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
        ],
      },
      { id: 'n1', role: 'user', content: 'A note from the host.' },
    ])

    await repairTranscript({
      messages: stores.messages,
      threadId: 't1',
      pending: [],
      finished: new Map([
        [
          'call-charge',
          { role: 'tool', toolCallId: 'call-charge', content: 'charged' },
        ],
      ]),
    })

    expect(
      (await stores.messages.loadThread('t1')).map((message) =>
        message.role === 'tool' ? message.toolCallId : message.id,
      ),
    ).toEqual(['u1', 'a1', 'call-charge', 'n1'])
  })

  it('gives each call of an answer cut at the output limit the truncated result', async () => {
    const { stores } = memoryPersistence()
    const cut = { tanstack: { finishReason: 'length' } }
    const call = (id: string, name: string) => ({
      id,
      type: 'function' as const,
      function: { name, arguments: '{}' },
    })
    await stores.messages.saveThread('t1', [
      { id: 'u1', role: 'user', content: 'search, then look up' },
      {
        id: 'a1',
        role: 'assistant',
        content: null,
        metadata: cut,
        toolCalls: [
          call('call-a', 'lookup'),
          {
            ...call('call-search', 'web_search'),
            metadata: { providerExecuted: true },
          },
        ],
      },
      {
        id: 'a1-segment-1',
        role: 'assistant',
        content: 'Now',
        metadata: cut,
        toolCalls: [call('call-b', 'lookup')],
      },
    ])

    await repairTranscript({
      messages: stores.messages,
      threadId: 't1',
      pending: [],
    })

    const tools = (await stores.messages.loadThread('t1')).filter(
      (message) => message.role === 'tool',
    )
    // The provider ran its own search, so it gets no result.
    expect(tools).toEqual(
      ['call-a', 'call-b'].map((toolCallId) => ({
        role: 'tool',
        toolCallId,
        content: TRUNCATED_TOOL_RESULT,
        error: TRUNCATED_TOOL_RESULT,
      })),
    )
  })

  it('gives a cut call the text of a truncated function, with the call', async () => {
    const { stores } = memoryPersistence()
    await stores.messages.saveThread('t1', [
      { id: 'u1', role: 'user', content: 'look up' },
      {
        id: 'a1',
        role: 'assistant',
        content: null,
        metadata: { tanstack: { finishReason: 'length' } },
        toolCalls: [
          {
            id: 'call-a',
            type: 'function',
            function: { name: 'lookup', arguments: '{"q":' },
          },
        ],
      },
    ])

    await repairTranscript({
      messages: stores.messages,
      threadId: 't1',
      pending: [],
      truncated: ({ toolCallId, toolName }) => `${toolName} ${toolCallId} cut`,
    })

    expect((await stores.messages.loadThread('t1')).at(-1)).toEqual({
      role: 'tool',
      toolCallId: 'call-a',
      content: 'lookup call-a cut',
      error: 'lookup call-a cut',
    })
  })
})

describe('checkpoint middleware options', () => {
  it('keeps renewing the run lease after a renewal fails', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const { runs } = memoryPersistence().stores
    await runs.createOrResume({
      runId: 'run-1',
      threadId: 't1',
      startedAt: Date.now(),
    })
    // Not a vi.spyOn: its mock handles the rejection itself.
    let calls = 0
    const update = runs.update.bind(runs)
    runs.update = (runId, patch) => {
      calls += 1
      return calls === 2
        ? Promise.reject(new Error('store down'))
        : update(runId, patch)
    }
    const stop = await holdRunLease(runs, 'run-1', 'host-1', { renewMs: 1 })

    await vi.waitFor(() => expect(calls).toBeGreaterThanOrEqual(3))
    stop()
    await new Promise((resolve) => setTimeout(resolve, 0))
    process.off('unhandledRejection', unhandled)

    expect(unhandled).not.toHaveBeenCalled()
  })

  it('stops renewing after another host took the run over', async () => {
    const { runs } = memoryPersistence().stores
    await runs.createOrResume({
      runId: 'run-1',
      threadId: 't1',
      startedAt: Date.now(),
    })
    const stop = await holdRunLease(runs, 'run-1', 'host-1', { renewMs: 1 })
    await runs.update('run-1', {
      leaseOwner: 'host-2',
      leaseExpiresAt: Date.now() + 60_000,
    })
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect((await runs.get('run-1'))?.leaseOwner).toBe('host-2')
    stop()
  })

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
