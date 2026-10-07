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
import { createSessionView } from '../src/view'
import { mockAdapter, text, toolCall } from './helpers'
import type { HarnessSession } from '../src'

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
    { threadId: 't' },
  )
  const turn = session.prompt('ask me')
  return { host, session, calls, turn }
}

/** Wait for the one open question, then answer it. Returns the question. */
async function reply(session: HarnessSession, value: unknown) {
  await vi.waitFor(() =>
    expect(session.snapshot().pendingQuestions).toHaveLength(1),
  )
  const [pending] = session.snapshot().pendingQuestions
  if (!pending) throw new Error('No question.')
  await session.answer(pending.questionId, value)
  return pending
}

/** The tool result the model got on its second call. */
function toolResult(
  calls: Array<{ messages: Array<{ role: string; content: unknown }> }>,
) {
  return calls[1]?.messages.find((message) => message.role === 'tool')?.content
}

describe('question()', () => {
  it('asks each question in turn and gives the model the picked labels', async () => {
    const { host, session, calls, turn } = await open([database, features])

    const first = await reply(session, '2')
    const second = await reply(session, ['billing', 'Auth'])
    await turn

    expect(first.message).toBe(
      'Database: Which database?\n1. Postgres - Relational, the default\n2. SQLite\nType a number or a label, or your own answer.',
    )
    expect(first.schema).toEqual({
      type: 'string',
      enum: ['Postgres', 'SQLite'],
    })
    expect(second.message).toContain('3. Billing')
    expect(second.schema).toEqual({
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

    await reply(session, value)
    await turn

    expect(toolResult(calls)).toBe(`${asked.question}\n${expected}`)
    await host.close()
  })

  it('gives the model a tool error when the reply is empty', async () => {
    const { host, session, calls, turn } = await open([database, features])

    await reply(session, '   ')
    await turn

    expect(toolResult(calls)).toContain('The user did not answer.')
    // The second question is not asked.
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
    await host.close()
  })
})

describe('ask with a url', () => {
  it('sends the url in the event, the snapshot, and the view', async () => {
    const asker = definePlugin({
      name: 'test/url-asker',
      setup: (ctx) => ({
        commands: {
          verify: defineCommand({
            description: 'Asks the user to open a page',
            run: () =>
              ctx.session.ask({
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
      { threadId: 't' },
    )
    const view = createSessionView(session)
    await view.ready
    const running = session.command('verify')

    await vi.waitFor(() => expect(view.store.get().questions).toHaveLength(1))
    expect(view.store.get().questions[0]?.url).toBe(
      'https://example.com/verify',
    )
    const pending = await reply(session, 'done')
    expect(pending.url).toBe('https://example.com/verify')
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
    view.dispose()
    await host.close()
  })
})
