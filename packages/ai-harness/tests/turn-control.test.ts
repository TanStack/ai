import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, isContextOverflow, toolDefinition } from '@tanstack/ai'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, retryTransientErrors } from '../src'
import {
  gate,
  messageTexts,
  mockAdapter,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTool, StreamChunk } from '@tanstack/ai'
import type { HarnessTurnOptions, ProjectOptions } from '../src'
import type { Reply } from './helpers'

const THREAD = 't1'

/** The start of an assistant message that streamed `delta`. */
const partialText = (delta: string): Array<StreamChunk> => [
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'p',
    role: 'assistant',
    timestamp: Date.now(),
  },
  {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'p',
    delta,
    timestamp: Date.now(),
  },
]

/** A model call that ends with a RUN_ERROR. */
const failsWith =
  (message: string, partial?: string): Reply =>
  () => [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: Date.now(),
    },
    ...(partial ? partialText(partial) : []),
    { type: EventType.RUN_ERROR, message, timestamp: Date.now() },
  ]

/** A model call whose adapter throws after some text. */
const throws =
  (message: string, code?: string): Reply =>
  () =>
    (async function* (): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: Date.now(),
      }
      yield* partialText('partial ')
      throw Object.assign(new Error(message), { code })
    })()

/** A model call that says `say`, then calls `lookup`. */
const textThenLookup =
  (say: string): Reply =>
  () => [...text(say).slice(0, -1), ...toolCall('lookup', { q: 'x' }).slice(1)]

/** A tool that runs `during`, then finds something. */
const lookup = (during?: () => Promise<void>) =>
  toolDefinition({
    name: 'lookup',
    description: 'Look something up',
    inputSchema: z.object({ q: z.string() }),
  }).server(async () => {
    await during?.()
    return { found: true }
  })

/** Compaction: the summary replaces the whole transcript. */
const project: ProjectOptions = {
  record: ({ record }) =>
    record.type === 'app.compaction' && typeof record.summary === 'string'
      ? [{ role: 'user', content: record.summary }]
      : undefined,
}

async function open(options: {
  replies: Array<Reply> | Reply
  turn: HarnessTurnOptions
  tools?: Array<AnyTool>
  durable?: boolean
}) {
  const { adapter, calls } = mockAdapter(options.replies)
  const persistence = memoryPersistence()
  const { runs, metadata, interrupts } = persistence.stores
  const log = memoryLogStore()
  const host = options.durable
    ? createHarnessHost({
        persistence: {
          stores: { log, runs, metadata, interrupts },
        },
        project,
      })
    : createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/turn-control',
      adapter,
      tools: options.tools,
      turn: options.turn,
    }),
    { threadId: THREAD },
  )
  return { host, session, calls, runs, log }
}

/** The events of one operation, as `type` or `type:name`. */
async function eventsOf(
  session: Awaited<ReturnType<typeof open>>['session'],
  operationId: string,
) {
  const seen: Array<string> = []
  for await (const entry of session.events({
    signal: AbortSignal.timeout(200),
  })) {
    if (entry.operationId !== operationId) continue
    seen.push(
      entry.event.type === EventType.CUSTOM
        ? `CUSTOM:${entry.event.name}`
        : entry.event.type,
    )
  }
  return seen
}

describe('turn.onModelError', () => {
  it('compacts after an overflow, retries once, and succeeds', async () => {
    const { host, session, calls } = await open({
      durable: true,
      replies: [
        failsWith('prompt is too long: 250000 tokens > 200000 maximum'),
        () => text('fits now'),
      ],
      turn: {
        onModelError: async ({ session: current, error, retries }) => {
          if (retries > 0 || !isContextOverflow({ error: error.message }))
            return
          await current.append([
            { type: 'app.compaction', summary: 'summary of the chat' },
          ])
          return 'retry'
        },
      },
    })

    expect(await session.prompt('a very long chat')).toEqual({
      text: 'fits now',
    })
    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1])).toEqual(['summary of the chat'])
    await host.close()
  })

  it('retries a transient error with the backoff, then fails after the limit', async () => {
    const { host, session, calls } = await open({
      replies: failsWith('503 Service Unavailable'),
      turn: {
        onModelError: retryTransientErrors({ maxRetries: 2, baseDelayMs: 1 }),
      },
    })

    const turn = session.prompt('go')
    await expect(turn).rejects.toThrow('503 Service Unavailable')

    expect(calls).toHaveLength(3)
    const events = await eventsOf(session, turn.id)
    expect(
      events.filter((type) => type === 'CUSTOM:harness.turn.retry'),
    ).toHaveLength(2)
    expect(events.filter((type) => type === EventType.RUN_ERROR)).toHaveLength(
      1,
    )
    await host.close()
  })

  it('stops at the limit when each failed call streamed text', async () => {
    const { host, session, calls } = await open({
      replies: failsWith('overloaded', 'partial '),
      turn: {
        onModelError: retryTransientErrors({ maxRetries: 2, baseDelayMs: 1 }),
      },
    })

    await expect(session.prompt('go')).rejects.toThrow('overloaded')

    expect(calls).toHaveLength(3)
    await host.close()
  })

  it('retries an error that the adapter throws, and drops the failed text', async () => {
    const { host, session } = await open({
      replies: [throws('fetch failed'), () => text('second try')],
      turn: { onModelError: retryTransientErrors({ baseDelayMs: 1 }) },
    })

    expect(await session.prompt('go')).toEqual({ text: 'second try' })
    await host.close()
  })

  it('gives the hook the code of an error that the adapter throws', async () => {
    const seen: Array<unknown> = []
    const { host, session } = await open({
      replies: throws('boom', 'overloaded_error'),
      turn: {
        onModelError: ({ error }) => {
          seen.push(error)
          return undefined
        },
      },
    })

    await expect(session.prompt('go')).rejects.toThrow('boom')
    expect(seen).toEqual([{ message: 'boom', code: 'overloaded_error' }])
    await host.close()
  })

  it('keeps the text of the model calls before the failed one', async () => {
    const { host, session } = await open({
      tools: [lookup()],
      replies: [
        textThenLookup('Let me check. '),
        failsWith('503 Service Unavailable'),
        () => text('It is sunny.'),
      ],
      turn: { onModelError: retryTransientErrors({ baseDelayMs: 1 }) },
    })

    expect(await session.prompt('weather?')).toEqual({
      text: 'Let me check. It is sunny.',
    })
    await host.close()
  })

  it.each([false, true])(
    'retries a resumed turn and runs the approved tool once (durable: %s)',
    async (durable) => {
      const execute = vi.fn(async () => ({ ok: true }))
      const remove = toolDefinition({
        name: 'remove',
        description: 'Remove a file',
        needsApproval: true,
        inputSchema: z.object({ path: z.string() }),
      }).server(execute)
      const { host, session } = await open({
        durable,
        tools: [remove],
        replies: [
          () => toolCall('remove', { path: 'a.txt' }, 'call_1'),
          failsWith('503 Service Unavailable'),
          () => text('removed'),
        ],
        turn: { onModelError: retryTransientErrors({ baseDelayMs: 1 }) },
      })

      const first = await session.prompt('remove a.txt')
      const receipt = await session.resolve([
        {
          interruptId: first.interrupts![0]!.id,
          status: 'resolved',
          payload: true,
        },
      ])

      expect(await session.operation(receipt.operationId!)).toEqual({
        text: 'removed',
      })
      expect(execute).toHaveBeenCalledTimes(1)
      await host.close()
    },
  )

  it('gives the retry a steer that joined the failed call, on a host without a log', async () => {
    const started = gate()
    const release = gate()
    const { host, session, calls } = await open({
      tools: [
        lookup(async () => {
          started.open()
          await release.opened
        }),
      ],
      replies: [
        () => toolCall('lookup', { q: 'x' }),
        failsWith('503 Service Unavailable'),
        () => text('done'),
      ],
      turn: { onModelError: retryTransientErrors({ baseDelayMs: 1 }) },
    })

    const turn = session.prompt('find x')
    await started.opened
    await session.steer('also check y')
    release.open()

    expect(await turn).toEqual({ text: 'done' })
    expect(messageTexts(calls[2]).at(-1)).toBe('also check y')
    await host.close()
  })

  it('ends a turn cancelled during the hook without the held error', async () => {
    const waiting = gate()
    const { host, session } = await open({
      replies: failsWith('503 Service Unavailable'),
      turn: {
        onModelError: async ({ signal }) => {
          waiting.open()
          await new Promise((resolve) =>
            signal.addEventListener('abort', resolve, { once: true }),
          )
          return 'retry' as const
        },
      },
    })

    const turn = session.prompt('go')
    await waiting.opened
    await turn.cancel()

    await expect(turn).rejects.toThrow('Cancelled.')
    expect(turn.status()).toBe('cancelled')
    expect(await eventsOf(session, turn.id)).not.toContain(EventType.RUN_ERROR)
    await host.close()
  })

  it('clears the error of the run record after a successful retry', async () => {
    const { host, session, runs } = await open({
      replies: [failsWith('503 Service Unavailable'), () => text('ok')],
      turn: { onModelError: retryTransientErrors({ baseDelayMs: 1 }) },
    })

    const turn = session.prompt('go')
    await turn

    const record = await runs.get(turn.id)
    expect(record?.status).toBe('completed')
    expect(record?.error).toBeUndefined()
    await host.close()
  })

  it('keeps today behavior without the hook', async () => {
    const { host, session, calls } = await open({
      replies: [failsWith('overloaded'), () => text('never')],
      turn: {},
    })

    await expect(session.prompt('go')).rejects.toThrow('overloaded')
    expect(calls).toHaveLength(1)
    await host.close()
  })

  describe('after a restart', () => {
    /**
     * Hosts on one durable store set that retry every model error. `seen`
     * has the `retries` that each host's hook got.
     */
    function durableHosts() {
      const { runs, metadata } = memoryPersistence().stores
      const persistence = { stores: { log: memoryLogStore(), runs, metadata } }
      const openOn = async (replies: Array<Reply>) => {
        const seen: Array<number> = []
        const { adapter, calls } = mockAdapter(replies)
        const host = createHarnessHost({ persistence })
        const session = await host.open(
          defineHarness({
            name: 'test/turn-control',
            adapter,
            tools: [lookup()],
            turn: {
              onModelError: ({ retries }) => {
                seen.push(retries)
                return 'retry'
              },
            },
          }),
          { threadId: THREAD },
        )
        return { host, session, calls, seen }
      }
      /** Run `replies`, then a call that hangs, and stop that host there. */
      const crashAfter = async (replies: Array<Reply>) => {
        const first = await openOn([...replies, untilAborted()])
        const turn = first.session.prompt('go', { inputId: 'in-1' })
        await vi.waitFor(() =>
          expect(first.calls).toHaveLength(replies.length + 1),
        )
        await runs.update(turn.id, { leaseExpiresAt: Date.now() - 1 })
        return first
      }
      return { openOn, crashAfter }
    }

    it('goes on from the retries of the attempt that stopped', async () => {
      const { openOn, crashAfter } = durableHosts()
      const first = await crashAfter([
        failsWith('503 Service Unavailable'),
        failsWith('503 Service Unavailable'),
      ])
      expect(first.seen).toEqual([0, 1])

      const next = await openOn([failsWith('503 Service Unavailable')])
      await next.session.settled('in-1')

      expect(next.seen).toEqual([2])
      await first.host.close().catch(() => {})
      await next.host.close()
    })

    it('starts from 0 after a finished tool phase', async () => {
      const { openOn, crashAfter } = durableHosts()
      const first = await crashAfter([
        failsWith('503 Service Unavailable'),
        () => toolCall('lookup', { q: 'x' }),
      ])
      expect(first.seen).toEqual([0])

      const next = await openOn([failsWith('503 Service Unavailable')])
      await next.session.settled('in-1')

      expect(next.seen).toEqual([0])
      await first.host.close().catch(() => {})
      await next.host.close()
    })
  })
})

describe('turn.beforeFinish', () => {
  const REMINDER = 'You did not post the answer. Post it now.'

  it('sends the model back to work in the same operation', async () => {
    const { host, session, calls } = await open({
      replies: [() => text('draft'), () => text('posted')],
      turn: {
        beforeFinish: ({ messages }) =>
          messages.some((message) => message.content === REMINDER)
            ? undefined
            : { messages: [{ role: 'user', content: REMINDER }] },
      },
    })

    const turn = session.prompt('answer the user')
    expect(await turn).toEqual({ text: 'draftposted' })

    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1]).at(-1)).toBe(REMINDER)
    const started = (await eventsOf(session, turn.id)).filter(
      (type) => type === 'CUSTOM:harness.operation.started',
    )
    expect(started).toHaveLength(1)
    await host.close()
  })

  it('continues for a record that projects to a message', async () => {
    const signalProject: ProjectOptions = {
      record: ({ messages, record }) =>
        record.type === 'app.signal' && typeof record.text === 'string'
          ? [...messages, { role: 'user', content: record.text }]
          : undefined,
    }
    const { adapter, calls } = mockAdapter([
      () => text('one'),
      () => text('two'),
    ])
    const { runs } = memoryPersistence().stores
    const host = createHarnessHost({
      persistence: { stores: { log: memoryLogStore(), runs } },
      project: signalProject,
    })
    let cycles = 0
    const session = await host.open(
      defineHarness({
        name: 'test/turn-control',
        adapter,
        turn: {
          beforeFinish: ({ cycle }) => {
            cycles = cycle
            return cycle === 0
              ? { records: [{ type: 'app.signal', text: 'check the result' }] }
              : undefined
          },
        },
      }),
      { threadId: THREAD },
    )

    expect(await session.prompt('go')).toEqual({ text: 'onetwo' })
    expect(messageTexts(calls[1]).at(-1)).toBe('check the result')
    expect(cycles).toBe(1)
    await host.close()
  })

  it('completes for a record that changes no message', async () => {
    const { host, session, calls, log } = await open({
      durable: true,
      replies: [() => text('done'), () => text('never')],
      turn: {
        beforeFinish: ({ cycle }) =>
          cycle === 0
            ? { records: [{ type: 'app.state_write', name: 'x', value: 1 }] }
            : undefined,
      },
    })

    expect(await session.prompt('go')).toEqual({ text: 'done' })
    expect(calls).toHaveLength(1)
    expect(
      (await log.read(THREAD)).map((entry) => entry.record.type),
    ).toContain('app.state_write')
    await host.close()
  })

  it.each([false, true])(
    'adds nothing when the turn is cancelled during the hook (durable: %s)',
    async (durable) => {
      const waiting = gate()
      const { host, session, calls } = await open({
        durable,
        replies: [() => text('done'), () => text('never')],
        turn: {
          beforeFinish: async ({ signal }) => {
            waiting.open()
            await new Promise((resolve) =>
              signal.addEventListener('abort', resolve, { once: true }),
            )
            return { messages: [{ role: 'user', content: REMINDER }] }
          },
        },
      })

      const turn = session.prompt('go')
      await waiting.opened
      await turn.cancel()

      await expect(turn).rejects.toThrow('Cancelled.')
      expect(turn.status()).toBe('cancelled')
      expect(calls).toHaveLength(1)
      expect(
        (await session.transcript()).some(
          (message) => message.content === REMINDER,
        ),
      ).toBe(false)
      await host.close()
    },
  )

  it('fails the turn at the cycle limit', async () => {
    const { host, session, calls } = await open({
      replies: () => text('again'),
      turn: {
        maxFinishCycles: 2,
        beforeFinish: () => ({
          messages: [{ role: 'user', content: 'once more' }],
        }),
      },
    })

    await expect(session.prompt('go')).rejects.toThrow('2 times')
    expect(calls).toHaveLength(3)
    await host.close()
  })

  it('gives the next model call ephemeral messages that no store keeps', async () => {
    const { host, session, calls, log } = await open({
      durable: true,
      replies: [() => text('draft'), () => text('posted'), () => text('never')],
      turn: {
        beforeFinish: ({ cycle }) =>
          cycle === 0
            ? { ephemeral: [{ role: 'user', content: REMINDER }] }
            : undefined,
      },
    })

    expect(await session.prompt('answer the user')).toEqual({
      text: 'draftposted',
    })

    expect(calls).toHaveLength(2)
    expect(messageTexts(calls[1])).toEqual([
      'answer the user',
      'draft',
      REMINDER,
    ])
    expect(JSON.stringify(await session.transcript())).not.toContain(REMINDER)
    expect(JSON.stringify(await log.read(THREAD))).not.toContain(REMINDER)
    await host.close()
  })

  it('counts a continue with only ephemeral messages for the cycle limit', async () => {
    const { host, session, calls } = await open({
      replies: () => text('again'),
      turn: {
        maxFinishCycles: 2,
        beforeFinish: () => ({
          ephemeral: [{ role: 'user', content: 'once more' }],
        }),
      },
    })

    await expect(session.prompt('go')).rejects.toThrow('2 times')
    expect(calls).toHaveLength(3)
    await host.close()
  })

  it('refuses records without a log', async () => {
    const { host, session } = await open({
      replies: [() => text('done')],
      turn: { beforeFinish: () => ({ records: [{ type: 'app.note' }] }) },
    })

    await expect(session.prompt('go')).rejects.toThrow('durable host')
    await host.close()
  })

  it('answers the added message after a crash before the next model call', async () => {
    const { runs, metadata } = memoryPersistence().stores
    const persistence = { stores: { log: memoryLogStore(), runs, metadata } }
    const beforeFinish: HarnessTurnOptions['beforeFinish'] = ({ messages }) =>
      messages.some((message) => message.content === REMINDER)
        ? undefined
        : { messages: [{ role: 'user', content: REMINDER }] }
    const openOn = async (replies: Array<Reply>) => {
      const { adapter, calls } = mockAdapter(replies)
      const host = createHarnessHost({ persistence })
      const session = await host.open(
        defineHarness({
          name: 'test/turn-control',
          adapter,
          turn: { beforeFinish },
        }),
        { threadId: THREAD },
      )
      return { host, session, calls }
    }
    const first = await openOn([() => text('draft'), untilAborted()])
    const turn = first.session.prompt('answer the user', { inputId: 'in-1' })
    await vi.waitFor(() => expect(first.calls).toHaveLength(2))
    await runs.update(turn.id, { leaseExpiresAt: Date.now() - 1 })

    const next = await openOn([() => text('posted')])

    expect(await next.session.settled('in-1')).toMatchObject({
      outcome: 'completed',
    })
    expect(next.calls).toHaveLength(1)
    expect(messageTexts(next.calls[0]).at(-1)).toBe(REMINDER)
    await first.host.close().catch(() => {})
    await next.host.close()
  })
})
