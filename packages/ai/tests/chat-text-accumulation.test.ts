import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { StreamChunk } from '../src/types'
import type { AdapterYieldChunk } from '../src/utilities/adapter-yield-chunk'

async function assistantContent(
  chunks: AsyncIterable<AdapterYieldChunk>,
): Promise<unknown> {
  const { adapter } = createMockAdapter({ chatStreamFn: () => chunks })
  let content: unknown
  await collectChunks(
    chat({
      threadId: 'thread-1',
      adapter,
      messages: [{ role: 'user', content: 'go' }],
      middleware: [
        defineChatMiddleware({
          name: 'test/text-accumulation',
          onFinish(ctx) {
            content = ctx.messages.find(
              (message) => message.role === 'assistant',
            )?.content
          },
        }),
      ],
    }) as AsyncIterable<StreamChunk>,
  )
  return content
}

/** Enough chunks to build a real rope, few enough that chat() stays quick. */
const PIECE = 'abcd'
const COUNT = 2_000

function longAnswer(withContent: boolean): AsyncIterable<AdapterYieldChunk> {
  return (async function* () {
    yield ev.runStarted()
    yield ev.textStart()
    let full = ''
    for (let i = 0; i < COUNT; i++) {
      full += PIECE
      yield withContent
        ? { ...ev.textContent(PIECE), content: full }
        : ev.textContent(PIECE)
    }
    yield ev.textEnd()
    yield ev.runFinished('stop')
  })()
}

describe('handleTextMessageContentEvent', () => {
  it.each([
    ['cumulative content snapshots', true],
    ['plain deltas', false],
  ])('joins a long answer of small %s', async (_label, withContent) => {
    const content = await assistantContent(longAnswer(withContent))
    expect(content).toBe(PIECE.repeat(COUNT))
  })

  it('keeps a cumulative snapshot that rewrites earlier text', async () => {
    const content = await assistantContent(
      (async function* () {
        yield ev.runStarted()
        yield ev.textStart()
        yield { ...ev.textContent('Hello'), content: 'Hello' }
        yield { ...ev.textContent('bye'), content: 'Goodbye' }
        yield ev.textEnd()
        yield ev.runFinished('stop')
      })(),
    )

    expect(content).toBe('Goodbye')
  })

  it('uses the snapshot suffix when it is longer than delta', async () => {
    const content = await assistantContent(
      (async function* () {
        yield ev.runStarted()
        yield ev.textStart()
        yield { ...ev.textContent('ab'), content: 'ab' }
        yield { ...ev.textContent('c'), content: 'abcd' }
        yield ev.textEnd()
        yield ev.runFinished('stop')
      })(),
    )

    expect(content).toBe('abcd')
  })
})
