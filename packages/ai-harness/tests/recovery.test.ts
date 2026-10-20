import { describe, expect, it, vi } from 'vitest'
import { memoryLogStore } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, logIdOf } from '../src'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { CUT_OFF_NOTE, INTERRUPTED_TOOL_RESULT } from '../src/resume'
import {
  CRASHING_OWNERSHIP,
  gate,
  messageTexts,
  mockAdapter,
  ownershipExpired,
  storedRun,
  text,
  toolCall,
  untilAborted,
  wrapLogStore,
} from './helpers'
import type { AnyTool, StreamChunk } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { AnyAgent, HarnessConfig, OwnershipOptions } from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

const THREAD = 't1'
/** The id of the log of `THREAD` in the store. */
const LOG = logIdOf({ logId: THREAD })

/** A background agent that runs until it is cancelled. */
const waiter = defineAgent({
  name: 'waiter',
  description: 'Waits until it is cancelled',
  run: (ctx) =>
    new Promise<string>((resolve) =>
      ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
    ),
})

/** The stores of a durable host: only a log. */
function logOnlyPersistence(log: LogStore = memoryLogStore()) {
  return { stores: { log } }
}

type LogOnly = ReturnType<typeof logOnlyPersistence>

async function openHost(
  persistence: LogOnly,
  replies: Array<Reply>,
  tools: Array<AnyTool> = [],
  ownership?: OwnershipOptions,
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({
    persistence,
    ...(ownership ? { ownership } : {}),
  })
  const session = await host.open(
    defineHarness({ name: 'test/recovery', adapter, tools }),
    {
      threadId: THREAD,
    },
  )
  return { host, session, calls }
}

/** Resolves when the model call is aborted. */
const aborted = (options: any) =>
  new Promise<void>((resolve) =>
    options.request?.signal?.addEventListener('abort', () => resolve(), {
      once: true,
    }),
  )

/** A model call that waits until the call is aborted, like a host that stopped. */
const hangs: Reply = (options: any) =>
  (async function* (): AsyncGenerator<StreamChunk> {
    yield {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: 1,
    }
    await aborted(options)
  })()

/**
 * A model call that streams `content`, then waits until it is aborted.
 * `onStreamed` runs after the session took the text.
 */
const cutAfter =
  (content: string, onStreamed = () => {}): Reply =>
  (options: any) =>
    (async function* (): AsyncGenerator<StreamChunk> {
      // RUN_STARTED, TEXT_MESSAGE_START, TEXT_MESSAGE_CONTENT.
      yield* text(content).slice(0, 3)
      onStreamed()
      await aborted(options)
    })()

async function openCutOff(
  persistence: LogOnly,
  replies: Array<Reply>,
  options: Partial<HarnessConfig> = {},
  ownership?: OwnershipOptions,
) {
  const { adapter, calls } = mockAdapter(replies)
  const host = createHarnessHost({
    persistence,
    ...(ownership ? { ownership } : {}),
  })
  const session = await host.open(
    defineHarness({ name: 'test/recovery', adapter, ...options }),
    {
      threadId: THREAD,
    },
  )
  return { host, session, calls }
}

/** Each message as `[role, content]`. */
const roles = (messages: ReadonlyArray<{ role: string; content: unknown }>) =>
  messages.map((message) => [message.role, message.content])

describe('a durable host with only a log', () => {
  it('lets the caller answer an interrupted turn as soon as it ends', async () => {
    const log = memoryLogStore()
    // A store that releases after a timer, like one over the network.
    const slow = wrapLogStore(log, {
      releaseOwnership: async (claim) => {
        await new Promise((resolve) => setTimeout(resolve, 5))
        await log.releaseOwnership(claim)
      },
    })
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(async () => ({ ok: true }))
    const { host, session } = await openHost(
      logOnlyPersistence(slow),
      [
        () => toolCall('remove', { path: 'a.txt' }, 'call_1'),
        () => text('removed'),
      ],
      [remove],
    )

    const turn = await session.send('remove a.txt')
    const interrupt = turn.interrupts?.[0]
    if (!interrupt) throw new Error('The turn did not stop for approval.')
    expect(session.snapshot().status).toBe('requires_action')
    const receipt = await session.resolve({
      resume: [
        { interruptId: interrupt.id, status: 'resolved', payload: true },
      ],
    })
    expect(receipt.status).toBe('accepted')
    await host.close()
  })

  it('keeps a turn whose host is alive, and runs it again after that host stops', async () => {
    const persistence = logOnlyPersistence()
    const first = await openHost(persistence, [hangs], [], CRASHING_OWNERSHIP)
    void Promise.resolve(first.session.send('go', { inputId: 'in-1' })).catch(
      () => {},
    )
    await waitFor(() => expect(first.calls).toHaveLength(1))

    // A second host while the first owns the log: it leaves the turn alone.
    const watcher = await openHost(persistence, [() => text('never')])
    expect(watcher.calls).toHaveLength(0)
    expect(watcher.session.snapshot().status).toBe('idle')
    await watcher.host.close()

    await ownershipExpired()
    const next = await openHost(persistence, [() => text('recovered')])
    expect(await next.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(next.calls).toHaveLength(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('fails a background agent whose host stopped, and keeps a finished one', async () => {
    const persistence = logOnlyPersistence()
    const pricer = defineAgent({
      name: 'pricer',
      description: 'Prices',
      run: async () => 'priced',
    })
    const first = createHarnessHost({
      persistence,
      ownership: CRASHING_OWNERSHIP,
    })
    const session = await first.open(
      defineHarness({
        name: 'test/recovery',
        adapter: mockAdapter([]).adapter,
        agents: [pricer, waiter],
      }),
      {
        threadId: THREAD,
      },
    )
    await session.agents.pricer.run()
    session.agents.waiter.start(undefined, { startTurnWhenDone: true })
    // Both runs are applied: the pricer ended, the waiter runs.
    await waitFor(async () =>
      expect(
        (await persistence.stores.log.read({ logId: LOG })).filter(
          (entry) => entry.record.type === 'harness.input.applied',
        ),
      ).toHaveLength(2),
    )

    await ownershipExpired()
    const next = await openHost(persistence, [() => text('noted')])
    await waitFor(() => expect(next.calls).toHaveLength(1))
    await waitFor(() => expect(next.session.snapshot().status).toBe('idle'))

    // One wake, for the agent that stopped. The finished agent stays settled.
    expect(next.calls).toHaveLength(1)
    expect(messageTexts(next.calls[0]).at(-1)).toBe(
      'Background agent waiter failed: [waiter failed] The host stopped during this agent run.',
    )
    await first.close().catch(() => {})
    await next.host.close()
  })

  it('repairs a cut batch from the log', async () => {
    const persistence = logOnlyPersistence()
    const mailStarted = gate()
    const charge = vi.fn(async () => 'charged')
    const tools = [
      toolDefinition({ name: 'charge', description: 'Charge' }).server(charge),
      toolDefinition({ name: 'mail', description: 'Mail' }).server(
        async (_args, context) => {
          mailStarted.open()
          // Wait like a host that stopped, until the call is aborted at close.
          return new Promise<never>((_resolve, reject) => {
            context?.abortSignal?.addEventListener(
              'abort',
              () => reject(new Error('stopped')),
              { once: true },
            )
          })
        },
      ),
    ]
    const twoCalls: Reply = () => {
      const now = Date.now()
      return [
        {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
        },
        ...['charge', 'mail'].flatMap(
          (name): Array<StreamChunk> => [
            {
              type: EventType.TOOL_CALL_START,
              toolCallId: `call-${name}`,
              toolCallName: name,
              timestamp: now,
            },
            {
              type: EventType.TOOL_CALL_ARGS,
              toolCallId: `call-${name}`,
              delta: '{}',
              timestamp: now,
            },
            {
              type: EventType.TOOL_CALL_END,
              toolCallId: `call-${name}`,
              timestamp: now,
            },
          ],
        ),
        {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now,
          metadata: { tanstack: { finishReason: 'tool_calls' } },
        },
      ]
    }
    const first = await openHost(
      persistence,
      [twoCalls],
      tools,
      CRASHING_OWNERSHIP,
    )
    void Promise.resolve(
      first.session.send('charge and mail', { inputId: 'batch-1' }),
    ).catch(() => {})
    await mailStarted.opened
    await waitFor(async () =>
      expect(
        (await persistence.stores.log.read({ logId: LOG })).filter(
          (entry) => entry.record.type === 'harness.tool.result',
        ),
      ).toHaveLength(1),
    )
    await ownershipExpired()

    const next = await openHost(persistence, [() => text('done')], tools)
    await next.session.settled({ inputId: 'batch-1' })

    const results = (await next.session.transcript()).filter(
      (message) => message.role === 'tool',
    )
    expect(results).toEqual([
      { role: 'tool', toolCallId: 'call-charge', content: 'charged' },
      {
        role: 'tool',
        toolCallId: 'call-mail',
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: INTERRUPTED_TOOL_RESULT.note,
      },
    ])
    expect(charge).toHaveBeenCalledTimes(1)
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})

describe('the runs in the log of a durable host', () => {
  it('keeps the failed run when the stopped host ends its agent later', async () => {
    const log = memoryLogStore()
    const persistence = { stores: { log } }
    const harness = defineHarness({
      name: 'test/recovery',
      adapter: mockAdapter([]).adapter,
      agents: [waiter],
    })
    const first = createHarnessHost({
      persistence,
      ownership: CRASHING_OWNERSHIP,
    })
    const run = (
      await first.open(harness, { threadId: THREAD })
    ).agents.waiter.start()
    await waitFor(async () =>
      expect((await storedRun(log, { threadId: THREAD }, run.id))?.status).toBe(
        'running',
      ),
    )

    await ownershipExpired()
    const next = createHarnessHost({ persistence })
    await next.open(harness, { threadId: THREAD })
    // The first host sees the writes of the second host: it lost the log,
    // so it stops its agent.
    await expect(Promise.resolve(run)).rejects.toThrow(
      'Another host took this thread over',
    )

    expect((await storedRun(log, { threadId: THREAD }, run.id))?.status).toBe(
      'failed',
    )
    await first.close().catch(() => {})
    await next.close()
  })
})

describe('close({ recoverable: true })', () => {
  /** A durable store set. */
  function durableStores() {
    return { stores: { log: memoryLogStore() } }
  }

  async function openOn(
    persistence: ReturnType<typeof durableStores>,
    replies: Array<Reply>,
    options: { tools?: Array<AnyTool>; agents?: Array<AnyAgent> } = {},
  ) {
    const { adapter, calls } = mockAdapter(replies)
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/recovery', adapter, ...options }),
      {
        threadId: THREAD,
      },
    )
    return { host, session, calls }
  }

  const logRecords = async (persistence: ReturnType<typeof durableStores>) =>
    (await persistence.stores.log.read({ logId: LOG })).map(
      (entry) => entry.record,
    )

  it('runs a turn stopped in a model call again on the next host, with no settlement', async () => {
    const persistence = durableStores()
    const first = await openOn(persistence, [untilAborted()])
    const turn = first.session.send('go', { inputId: 'in-1' })
    await waitFor(() => expect(first.calls).toHaveLength(1))

    await first.host.close({ recoverable: true })

    await expect(turn).rejects.toThrow('Session closed.')
    expect(
      (await logRecords(persistence)).map((record) => record.type),
    ).not.toContain('harness.input.settled')
    expect(
      (await storedRun(persistence.stores.log, { threadId: THREAD }, turn.id))
        ?.status,
    ).toBe('running')
    const next = await openOn(persistence, [() => text('recovered')])
    expect(await next.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    const applied = (await logRecords(persistence)).filter(
      (record) => record.type === 'harness.input.applied',
    )
    expect(applied.map((record) => record.attempt)).toEqual([1, 2])
    expect(messageTexts(next.calls[0])).toEqual(['go'])
    await next.host.close()
  })

  it('gives a cut call of a tool that must not run twice the interrupted result', async () => {
    const persistence = durableStores()
    const started = gate()
    const mail = toolDefinition({ name: 'mail', description: 'Mail' }).server(
      (_args, context) =>
        new Promise<never>((_resolve, reject) => {
          started.open()
          context?.abortSignal?.addEventListener(
            'abort',
            () => reject(new Error('stopped')),
            { once: true },
          )
        }),
    )
    const first = await openOn(persistence, [() => toolCall('mail', {})], {
      tools: [mail],
    })
    void first.session.send('mail it', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await started.opened

    await first.host.close({ recoverable: true })
    const next = await openOn(persistence, [() => text('done')], {
      tools: [mail],
    })
    await next.session.settled({ inputId: 'in-1' })

    const results = (await next.session.transcript()).filter(
      (message) => message.role === 'tool',
    )
    expect(results).toEqual([
      {
        role: 'tool',
        toolCallId: 'call-1',
        content: JSON.stringify(INTERRUPTED_TOOL_RESULT),
        error: INTERRUPTED_TOOL_RESULT.note,
      },
    ])
    await next.host.close()
  })

  it('still settles a turn aborted at a plain close', async () => {
    const persistence = durableStores()
    const first = await openOn(persistence, [untilAborted()])
    const turn = first.session.send('go', { inputId: 'in-1' })
    await waitFor(() => expect(first.calls).toHaveLength(1))

    await first.host.close()

    await expect(turn).rejects.toThrow('Cancelled.')
    expect(
      (await storedRun(persistence.stores.log, { threadId: THREAD }, turn.id))
        ?.status,
    ).toBe('aborted')
    const next = await openOn(persistence, [() => text('never')])
    expect(await next.session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'aborted',
    })
    expect(next.calls).toHaveLength(0)
    await next.host.close()
  })

  it('keeps the text that a model call streamed before the close, for the next host', async () => {
    const log = memoryLogStore()
    // A store over the network: each append lands a little later.
    const slow = wrapLogStore(log, {
      append: async (batch) => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return log.append(batch)
      },
    })
    const persistence = logOnlyPersistence(slow)
    const streamed = gate()
    const first = await openCutOff(persistence, [
      cutAfter('The answer is ', streamed.open),
    ])
    void first.session.send('go', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await streamed.opened

    await first.host.close({ recoverable: true })
    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
    })
    await next.session.settled({ inputId: 'in-1' })

    expect(roles(next.calls[0].messages)).toEqual([
      ['user', 'go'],
      ['assistant', 'The answer is '],
      ['user', CUT_OFF_NOTE],
    ])
    await next.host.close()
  })

  it('resumes an agent run on the next host', async () => {
    const persistence = durableStores()
    let started = 0
    const worker = defineAgent({
      name: 'worker',
      description: 'Waits on its first run, then finishes',
      run: (ctx) => {
        started += 1
        if (started > 1) return Promise.resolve('done')
        return new Promise<string>((resolve) =>
          ctx.abortSignal?.addEventListener('abort', () => resolve('stopped')),
        )
      },
    })
    const first = await openOn(persistence, [], { agents: [worker] })
    first.session
      .agent('worker')
      ?.start(undefined, { runAgainAfterCrash: true })
    await waitFor(() => expect(started).toBe(1))

    await first.host.close({ recoverable: true })
    const next = await openOn(persistence, [], { agents: [worker] })

    await waitFor(() => expect(started).toBe(2))
    const input = (await logRecords(persistence)).find(
      (record) => record.type === 'harness.input',
    )
    expect(
      await next.session.settled({ inputId: String(input?.inputId) }),
    ).toMatchObject({
      outcome: 'completed',
    })
    await next.host.close()
  })
})

describe('durability.continueCutOff', () => {
  const lookup = toolDefinition({
    name: 'lookup',
    description: 'Look up a fact',
  }).server(async () => 'found')

  /** A host that stops in a model call after `streamed` reached the log. */
  async function crashAfterText(
    replies: Array<Reply>,
    options: Partial<HarnessConfig> = { tools: [lookup] },
    streamed = 'The answer is ',
  ) {
    const persistence = logOnlyPersistence()
    const first = await openCutOff(
      persistence,
      replies,
      options,
      CRASHING_OWNERSHIP,
    )
    void first.session.send('go', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await waitFor(async () =>
      expect(
        JSON.stringify(await persistence.stores.log.read({ logId: LOG })),
      ).toContain(streamed),
    )
    await ownershipExpired()
    return { persistence, first }
  }

  it.each([
    { option: true, note: CUT_OFF_NOTE },
    { option: { note: 'Go on.' }, note: 'Go on.' },
  ])(
    'continues an answer that a crash cut (continueCutOff: $option)',
    async ({ option, note }) => {
      // The text of the first model call is in the transcript already.
      const { persistence, first } = await crashAfterText([
        () => [
          ...text('Let me look.').slice(0, 4),
          ...toolCall('lookup', {}).slice(1),
        ],
        cutAfter('The answer is '),
      ])

      const next = await openCutOff(persistence, [() => text('42.')], {
        durability: { continueCutOff: option },
        tools: [lookup],
      })
      expect(await next.session.settled({ inputId: 'in-1' })).toMatchObject({
        outcome: 'completed',
      })

      const before = [
        ['user', 'go'],
        ['assistant', 'Let me look.'],
        ['tool', 'found'],
        ['assistant', 'The answer is '],
        ['user', note],
      ]
      expect(roles(next.calls[0].messages)).toEqual(before)
      expect(roles(await next.session.transcript())).toEqual([
        ...before,
        ['assistant', '42.'],
      ])
      // One append, so the transcript never ends with the cut answer.
      const added = (await persistence.stores.log.read({ logId: LOG })).find(
        (entry) =>
          entry.record.type === 'harness.transcript' &&
          JSON.stringify(entry.record).includes(note),
      )
      expect(added?.record).toMatchObject({
        add: [
          { role: 'assistant', content: 'The answer is ' },
          { role: 'user', content: note },
        ],
      })
      await first.host.close().catch(() => {})
      await next.host.close()
    },
  )

  it('adds one user message for each note, in order, in the same append', async () => {
    const { persistence, first } = await crashAfterText([
      cutAfter('The answer is '),
    ])
    const one = 'The stream was interrupted.'
    const two = 'Continue from the partial.'

    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: { note: [one, two] } },
    })
    await next.session.settled({ inputId: 'in-1' })

    const added = [
      ['assistant', 'The answer is '],
      ['user', one],
      ['user', two],
    ]
    expect(roles(next.calls[0].messages)).toEqual([['user', 'go'], ...added])
    const record = (await persistence.stores.log.read({ logId: LOG })).find(
      (entry) =>
        entry.record.type === 'harness.transcript' &&
        JSON.stringify(entry.record).includes(one),
    )?.record
    expect(roles(Array.isArray(record?.add) ? record.add : [])).toEqual(added)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  /** A model call that streams one thinking block, then waits until it is aborted. */
  const thinksThenHangs =
    (signature?: string): Reply =>
    (options: any) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        yield* [
          {
            type: EventType.RUN_STARTED,
            runId: 'r',
            threadId: 't',
            timestamp: 1,
          },
          { type: EventType.REASONING_START, messageId: 'r1', timestamp: 1 },
          {
            type: EventType.REASONING_MESSAGE_START,
            messageId: 'r1',
            role: 'reasoning',
            timestamp: 1,
          },
          {
            type: EventType.REASONING_MESSAGE_CONTENT,
            messageId: 'r1',
            delta: 'Check the docs.',
            timestamp: 1,
          },
          ...(signature
            ? [
                {
                  type: EventType.REASONING_ENCRYPTED_VALUE,
                  subtype: 'message',
                  entityId: 'r1',
                  encryptedValue: signature,
                  timestamp: 1,
                } satisfies StreamChunk,
              ]
            : []),
        ] satisfies Array<StreamChunk>
        await aborted(options)
      })()

  it('continues an answer cut after signed thinking, and keeps the thinking', async () => {
    const { persistence, first } = await crashAfterText(
      [thinksThenHangs('sig-1')],
      {},
      'sig-1',
    )

    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
    })
    await next.session.settled({ inputId: 'in-1' })

    const partial = {
      role: 'assistant',
      content: null,
      thinking: [{ content: 'Check the docs.', signature: 'sig-1' }],
    }
    expect(next.calls[0].messages).toMatchObject([
      { role: 'user', content: 'go' },
      partial,
      { role: 'user', content: CUT_OFF_NOTE },
    ])
    expect((await next.session.transcript()).slice(1, 3)).toMatchObject([
      partial,
      { role: 'user', content: CUT_OFF_NOTE },
    ])
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('runs a call cut after thinking with no signature again with no note', async () => {
    const { persistence, first } = await crashAfterText(
      [thinksThenHangs()],
      {},
      'Check the docs.',
    )

    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
    })
    await next.session.settled({ inputId: 'in-1' })

    expect(roles(next.calls[0].messages)).toEqual([['user', 'go']])
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('runs a cut answer again with no note when the option is off', async () => {
    const { persistence, first } = await crashAfterText([
      cutAfter('The answer is '),
    ])

    const next = await openCutOff(persistence, [() => text('42.')])
    await next.session.settled({ inputId: 'in-1' })

    expect(roles(next.calls[0].messages)).toEqual([['user', 'go']])
    expect(roles(await next.session.transcript())).toEqual([
      ['user', 'go'],
      ['assistant', '42.'],
    ])
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('does not keep the text of an agent that the crash cut', async () => {
    const child = mockAdapter([cutAfter('Agent notes ')])
    const writer = defineAgent({
      name: 'writer',
      description: 'Writes notes',
      run: (ctx) => ctx.chat({ adapter: child.adapter }),
    })
    const subagents = { agents: [writer] }
    const { persistence, first } = await crashAfterText(
      [() => toolCall('writer', { prompt: 'Notes' })],
      { subagents },
      'Agent notes ',
    )

    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
      subagents,
    })
    await next.session.settled({ inputId: 'in-1' })

    const sent = JSON.stringify(next.calls[0].messages)
    expect(sent).not.toContain('Agent notes')
    expect(sent).not.toContain(CUT_OFF_NOTE)
    await first.host.close().catch(() => {})
    await next.host.close()
  })

  it('runs a call cut before any text again with no note', async () => {
    const persistence = logOnlyPersistence()
    const first = await openCutOff(persistence, [hangs], {}, CRASHING_OWNERSHIP)
    void first.session.send('go', { inputId: 'in-1' }).then(
      () => {},
      () => {},
    )
    await waitFor(() => expect(first.calls).toHaveLength(1))
    await ownershipExpired()

    const next = await openCutOff(persistence, [() => text('42.')], {
      durability: { continueCutOff: true },
    })
    await next.session.settled({ inputId: 'in-1' })

    expect(roles(next.calls[0].messages)).toEqual([['user', 'go']])
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})
