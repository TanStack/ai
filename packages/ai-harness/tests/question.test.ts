import { describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { EventType } from '@tanstack/ai'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { question } from '../src/first-party/question'
import { mockAdapter, questionsOf, text, toolCall } from './helpers'
import type { ChatTurnResult, HarnessSession, Operation } from '../src'

const database = {
  question: 'Which database?',
  header: 'Database',
  options: [
    { label: 'Postgres', description: 'Relational, the default' },
    { label: 'SQLite' },
  ],
}

const features = {
  question: 'Which features?',
  options: [{ label: 'Auth' }, { label: 'Search' }, { label: 'Billing' }],
  multiple: true,
}

/** The model calls `question` with `questions`, then ends the turn. */
async function open(questions: Array<object>) {
  const { adapter, calls } = mockAdapter([
    () => toolCall('question', { questions }, 'c1'),
    () => text('done'),
  ])
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/question',
      adapter,
      plugins: () => [question()],
    }),
    {
      threadId: 't',
    },
  )
  const turn = session.send('ask me')
  return { host, session, calls, turn }
}

/**
 * Wait for the turn to stop for its question waits, then answer each one
 * with `values`, in order, and wait for the turn that goes on. Returns the
 * waits.
 */
async function reply(
  session: HarnessSession,
  turn: Operation<ChatTurnResult>,
  values: Array<unknown>,
  status: 'resolved' | 'cancelled' = 'resolved',
) {
  await turn
  const pending = session.snapshot().pendingWaits
  expect(pending.map((wait) => wait.kind)).toEqual(values.map(() => 'question'))
  await session.resolve({
    resume: pending.map((wait, index) => ({
      interruptId: wait.waitId,
      status,
      ...(status === 'resolved' ? { payload: values[index] } : {}),
    })),
    inputId: 'answers',
  })
  expect(await session.settled({ inputId: 'answers' })).toMatchObject({
    outcome: 'completed',
  })
  return pending
}

/** The tool result the model got on its second call. */
function toolResult(
  calls: Array<{ messages: Array<{ role: string; content: unknown }> }>,
) {
  return calls[1]?.messages.find((message) => message.role === 'tool')?.content
}

describe('question()', () => {
  it('stops the turn before the tool runs, with a wait for each question, and gives the model the picked labels', async () => {
    const { host, session, calls, turn } = await open([database, features])

    expect((await turn).interrupts).toHaveLength(2)
    // The tool did not run: the model got no result yet.
    expect(calls).toHaveLength(1)
    const [first, second] = await reply(session, turn, [
      '2',
      ['billing', 'Auth'],
    ])

    expect(first?.message).toBe(
      'Database: Which database?\n1. Postgres - Relational, the default\n2. SQLite\nType a number or a label, or your own answer.',
    )
    expect(first?.schema).toEqual({
      type: 'string',
      enum: ['Postgres', 'SQLite'],
    })
    expect(second?.message).toContain('3. Billing')
    expect(second?.schema).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['Auth', 'Search', 'Billing'] },
      minItems: 1,
      uniqueItems: true,
    })
    expect(toolResult(calls)).toBe(
      'Which database?\nAnswer: SQLite\n\nWhich features?\nAnswer: Billing, Auth',
    )
    await host.close()
  })

  it.each([
    ['a label in another case', database, ' postgres ', 'Answer: Postgres'],
    [
      'numbers and labels split by commas',
      features,
      'auth, 3',
      'Answer: Auth, Billing',
    ],
    [
      'text that names no option',
      database,
      'We use Mongo',
      'Own answer: We use Mongo',
    ],
  ])('reads %s', async (_name, asked, value, expected) => {
    const { host, session, calls, turn } = await open([asked])

    await reply(session, turn, [value])

    expect(toolResult(calls)).toBe(`${asked.question}\n${expected}`)
    await host.close()
  })

  it('gives the model a tool error when a reply is empty', async () => {
    const { host, session, calls, turn } = await open([database, features])

    await reply(session, turn, ['   ', 'Auth'])

    expect(toolResult(calls)).toContain('The user did not answer.')
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('gives the model a tool error when the user cancels the questions', async () => {
    const { host, session, calls, turn } = await open([database])

    await reply(session, turn, [undefined], 'cancelled')

    expect(toolResult(calls)).toContain('The user did not answer.')
    await host.close()
  })

  it('asks nothing for input that is not valid, and gives the model a tool error', async () => {
    const { host, session, calls, turn } = await open([{ question: 'Hm?' }])

    expect((await turn).interrupts ?? []).toEqual([])
    expect(toolResult(calls)).toContain('Input validation failed')
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })
})

describe('ask with a url', () => {
  it('sends the url in the event and the snapshot', async () => {
    const asker = definePlugin({
      name: 'test/url-asker',
      setup: () => ({
        commands: {
          verify: defineCommand({
            description: 'Asks the user to open a page',
            run: (_input, { step }) =>
              step.ask({
                name: 'verify',
                message: 'Open the page, then type done.',
                url: 'https://example.com/verify',
              }),
          }),
        },
      }),
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/url-question',
        adapter: mockAdapter([]).adapter,
        plugins: () => [asker],
      }),
      {
        threadId: 't',
      },
    )
    const running = session.runCommand({ name: 'verify' })

    await vi.waitFor(() =>
      expect(questionsOf(session.snapshot())).toHaveLength(1),
    )
    expect(questionsOf(session.snapshot())[0]?.url).toBe(
      'https://example.com/verify',
    )
    const [pending] = questionsOf(session.snapshot())
    if (!pending) throw new Error('No question.')
    await session.answer({ questionId: pending.questionId, value: 'done' })
    expect(await running).toBe('done')

    const controller = new AbortController()
    let url: unknown
    for await (const { event } of session.events({
      from: '0',
      signal: controller.signal,
    })) {
      if (
        event.type === EventType.CUSTOM &&
        event.name === HARNESS_EVENTS.question &&
        event.value !== null &&
        typeof event.value === 'object' &&
        'url' in event.value
      ) {
        url = event.value.url
        controller.abort()
      }
    }
    expect(url).toBe('https://example.com/verify')
    await host.close()
  })
})
