import { describe, expect, it } from 'vitest'
import { EventType, chat } from '../src'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type {
  ActivityRecord,
  AdapterYieldChunk,
  ChatMiddleware,
  StreamChunk,
} from '../src'

const snapshot = (
  messageId: string,
  content: Record<string, unknown>,
): AdapterYieldChunk => ({
  type: EventType.ACTIVITY_SNAPSHOT,
  messageId,
  activityType: 'search',
  content,
  timestamp: 1,
})

const delta = (
  messageId: string,
  patch: Extract<StreamChunk, { type: 'ACTIVITY_DELTA' }>['patch'],
): AdapterYieldChunk => ({
  type: EventType.ACTIVITY_DELTA,
  messageId,
  activityType: 'search',
  patch,
  timestamp: 1,
})

/** Run one model turn and return `ctx.activities` as `onFinish` sees it. */
async function finalActivities(
  activityChunks: Array<AdapterYieldChunk>,
  middleware: Array<ChatMiddleware> = [],
) {
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ...activityChunks,
        ev.textStart(),
        ev.textContent('a'),
        ev.textEnd(),
        ev.runFinished(),
      ],
    ],
  })
  let seen: ReadonlyArray<ActivityRecord> = []
  const probe: ChatMiddleware = {
    name: 'probe',
    onFinish(ctx) {
      seen = ctx.activities ?? []
    },
  }
  await collectChunks(
    chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      middleware: [probe, ...middleware],
    }) as AsyncIterable<StreamChunk>,
  )
  return seen
}

describe('chat activity records', () => {
  it('applies activity events that middleware adds (#1803)', async () => {
    const added: ChatMiddleware = {
      name: 'added',
      onChunk(_ctx, chunk) {
        if (chunk.type === EventType.TEXT_MESSAGE_START) {
          return [snapshot('mw-1', { status: 'done' }), chunk]
        }
        return [chunk]
      },
    }
    const activities = await finalActivities([], [added])
    expect(activities).toEqual([
      expect.objectContaining({ id: 'mw-1', content: { status: 'done' } }),
    ])
  })

  it('applies an adapter delta once when middleware passes on a copy', async () => {
    const copy: ChatMiddleware = {
      name: 'copy',
      onChunk: (_ctx, chunk) => [{ ...chunk }],
    }
    const activities = await finalActivities(
      [
        snapshot('a-1', { items: [] }),
        delta('a-1', [{ op: 'add', path: '/items/-', value: 'x' }]),
      ],
      [copy],
    )
    expect(activities[0]?.content).toEqual({ items: ['x'] })
  })

  it('applies identical adapter deltas each time', async () => {
    const append = () =>
      delta('a-1', [{ op: 'add', path: '/items/-', value: 'x' }])
    const activities = await finalActivities([
      snapshot('a-1', { items: [] }),
      append(),
      append(),
    ])
    expect(activities[0]?.content).toEqual({ items: ['x', 'x'] })
  })

  it('applies a repeated adapter snapshot that resets content', async () => {
    const activities = await finalActivities([
      snapshot('a-1', { n: 0 }),
      delta('a-1', [{ op: 'replace', path: '/n', value: 1 }]),
      snapshot('a-1', { n: 0 }),
    ])
    expect(activities[0]?.content).toEqual({ n: 0 })
  })
})
