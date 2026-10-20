import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat, defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '../src'
import { logIdOf } from '../src/log'
import {
  INTERRUPTED_TOOL_RESULT,
  TRUNCATED_TOOL_RESULT,
  repairTranscript,
  scrubToolResults,
  toolResultRecorder,
} from '../src/resume'
import { createRedactor } from '../src/auth'
import {
  canOtherHostTake,
  gate,
  mockAdapter,
  storedRun,
  text,
  toolCall,
} from './helpers'
import type { AnyChatMiddleware, AnyTool, ModelMessage } from '@tanstack/ai'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

/** Run one chat() turn with the checkpoint middleware and a fresh run record. */
async function runWithCheckpoint(options: {
  replies: Parameters<typeof mockAdapter>[0]
  tools?: Array<AnyTool>
  middleware: (
    stores: ReturnType<typeof memoryPersistence>['stores'],
  ) => AnyChatMiddleware | Array<AnyChatMiddleware>
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
    middleware: [options.middleware(stores)].flat(),
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

/** The run `runId` in the log of thread `t1`. */
const runIn = (
  persistence: ReturnType<typeof memoryPersistence>,
  runId: string,
) => storedRun(persistence.stores.log, { threadId: 't1' }, runId)

/** The records in the log of thread `t1`. */
const recordsIn = async (persistence: ReturnType<typeof memoryPersistence>) =>
  (await persistence.stores.log.read({ logId: logIdOf({ logId: 't1' }) })).map(
    (entry) => entry.record,
  )

/** Can another host acquire the log of thread `t1` now? */
const isTakeable = (persistence: ReturnType<typeof memoryPersistence>) =>
  canOtherHostTake(persistence.stores.log, logIdOf({ logId: 't1' }))

describe('checkpoints and ownership', () => {
  it('owns the log and records the running tool with its replay mode', async () => {
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
      defineHarness({ name: 'test/resume', adapter, tools: [lookup] }),
      {
        threadId: 't1',
      },
    )

    const turn = session.send('go')
    await started.opened
    // Another host cannot take the thread while the turn runs.
    expect(await isTakeable(persistence)).toBe(false)
    expect(await recordsIn(persistence)).toContainEqual({
      type: 'harness.tool.started',
      toolCallId: 'call-1',
      name: 'lookup',
      replay: 'safe',
    })
    // The assistant message with the tool call is saved before the tool runs.
    const saved = await session.transcript()
    expect(saved.at(-1)?.toolCalls?.[0]?.function.name).toBe('lookup')

    release.open()
    await turn
    expect(await recordsIn(persistence)).toContainEqual(
      expect.objectContaining({
        type: 'harness.tool.result',
        toolCallId: 'call-1',
      }),
    )
    await host.close()
  })

  it('owns the log while a background agent runs, and gives it back after', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const { adapter } = mockAdapter([])
    const session = await host.open(
      defineHarness({
        name: 'test/agent-resume',
        adapter,
        agents: [waiter],
      }),
      {
        threadId: 't1',
      },
    )

    const run = session.agents.waiter.start()
    await waitFor(async () =>
      expect((await runIn(persistence, run.id))?.status).toBe('running'),
    )
    expect(await isTakeable(persistence)).toBe(false)

    await session.cancel({ operationId: run.id })
    await run.then(
      () => {},
      () => {},
    )
    await waitFor(async () => expect(await isTakeable(persistence)).toBe(true))
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

/** A tool that returns `echoed`, and one that throws `boom failed`. */
const echoAndBoom = () => [
  toolDefinition({ name: 'echo', description: 'Echo' }).server(
    async () => 'echoed',
  ),
  toolDefinition({ name: 'boom', description: 'Fail' }).server(async () => {
    throw new Error('boom failed')
  }),
]

/** The model calls `echo`, then `boom`, then answers. */
const echoThenBoom = [
  () => toolCall('echo', {}, 'call-echo'),
  () => toolCall('boom', {}, 'call-boom'),
  () => text('done'),
]

describe('toolResultRecorder', () => {
  it('gives onToolResult the tool message of each call that ends', async () => {
    const seen: Array<{ toolCallId: string; message: ModelMessage }> = []
    await runWithCheckpoint({
      replies: echoThenBoom,
      tools: echoAndBoom(),
      middleware: () =>
        toolResultRecorder((info) => {
          seen.push(info)
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

  it('records the result after an earlier middleware replaced it, also on an error', async () => {
    const seen: Array<ModelMessage> = []
    const replace: AnyChatMiddleware = {
      name: 'test:replace',
      onAfterToolCall: (_ctx, info) => ({
        type: 'replaceResult',
        result: info.ok ? 'replaced' : { error: 'replaced error' },
      }),
    }
    await runWithCheckpoint({
      replies: echoThenBoom,
      tools: echoAndBoom(),
      middleware: () => [
        replace,
        toolResultRecorder(({ message }) => {
          seen.push(message)
        }),
      ],
    })

    expect(seen).toEqual([
      { role: 'tool', toolCallId: 'call-echo', content: 'replaced' },
      {
        role: 'tool',
        toolCallId: 'call-boom',
        content: JSON.stringify({ error: 'replaced error' }),
        error: 'replaced error',
      },
    ])
  })

  it('records the result without the secrets after scrubToolResults', async () => {
    const secret = 'sk-test-0123456789'
    const redactor = createRedactor()
    redactor.add(secret)
    const seen: Array<ModelMessage> = []
    const tools = [
      toolDefinition({ name: 'echo', description: 'Echo' }).server(
        async () => ({ key: secret }),
      ),
      toolDefinition({ name: 'boom', description: 'Fail' }).server(async () => {
        throw new Error(`The key ${secret} was refused.`)
      }),
    ]
    await runWithCheckpoint({
      replies: echoThenBoom,
      tools,
      middleware: () => [
        scrubToolResults(redactor),
        toolResultRecorder(({ message }) => {
          seen.push(message)
        }),
      ],
    })

    expect(seen).toEqual([
      {
        role: 'tool',
        toolCallId: 'call-echo',
        content: JSON.stringify({ key: '[redacted]' }),
      },
      {
        role: 'tool',
        toolCallId: 'call-boom',
        content: JSON.stringify({ error: 'The key [redacted] was refused.' }),
        error: 'The key [redacted] was refused.',
      },
    ])
  })
})
