import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { HARNESS_EVENTS } from '../src'
import { createSessionView, mediaPart } from '../src/view'
import {
  applyEvent,
  emptyState,
  messagesFromTranscript,
} from '../src/view/reduce'
import { at, sessionSnapshot } from './view-fixtures'
import type { ModelMessage } from '@tanstack/ai'
import type { MediaRecord, Receipt, SessionEvent, UserInput } from '../src'
import type {
  MediaPart,
  SessionView,
  SessionViewSource,
  SessionViewState,
  ViewPart,
} from '../src/view'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const receipt: Receipt = { inputId: 'i', status: 'accepted' }

function record(over: Partial<MediaRecord> = {}): MediaRecord {
  return {
    id: 'm1',
    threadId: 't',
    kind: 'image',
    mimeType: 'image/png',
    name: 'cat.png',
    size: 3,
    source: 'generated',
    createdAt: 0,
    ...over,
  }
}

/** The media part the view shows for `record()`, with `over` on top. */
function shown(over: Partial<MediaPart> = {}) {
  return {
    type: 'media',
    id: 'm1',
    kind: 'image',
    mimeType: 'image/png',
    name: 'cat.png',
    size: 3,
    load: expect.any(Function),
    ...over,
  }
}

/** The `harness.media` event of a turn. */
function mediaEvent(media: MediaRecord) {
  return at({
    type: EventType.CUSTOM,
    name: HARNESS_EVENTS.media,
    value: media,
  })
}

function savedAnswer(media: Array<MediaRecord>): ModelMessage {
  return {
    role: 'assistant',
    content: 'Here it is.',
    metadata: { harness: { media } },
  }
}

const fold = (events: Array<SessionEvent>) =>
  events.reduce(applyEvent, emptyState())

function assistantParts(state: SessionViewState) {
  const message = state.messages.find((item) => item.role === 'assistant')
  return message?.role === 'assistant' ? message.parts : []
}

function mediaOfParts(parts: ReadonlyArray<ViewPart>): Array<MediaPart> {
  return parts.flatMap((part) => {
    if (part.type === 'media') return [part]
    return part.type === 'agent' ? mediaOfParts(part.parts) : []
  })
}

/** Every media part in the view, in message order. */
function mediaIn(view: SessionView) {
  return view.store
    .get()
    .messages.flatMap((message) =>
      message.role === 'assistant'
        ? mediaOfParts(message.parts)
        : message.role === 'user'
          ? (message.media ?? [])
          : [],
    )
}

/** `entries`, then nothing until the view stops reading. */
async function* replay(
  entries: Array<SessionEvent>,
  signal: AbortSignal | undefined,
) {
  yield* entries
  await new Promise((resolve) => signal?.addEventListener('abort', resolve))
}

/** A view on a source that records what the view sends. */
async function openView(over: Partial<SessionViewSource> = {}) {
  const sent: Array<UserInput> = []
  const commands: Array<{ name: string; input: unknown }> = []
  const source: SessionViewSource = {
    prompt: (message) => {
      sent.push(message)
    },
    steer: async (message) => {
      sent.push(message)
      return receipt
    },
    resolve: async () => receipt,
    cancel: async () => receipt,
    answer: async () => receipt,
    command: (name, input) => {
      commands.push({ name, input })
    },
    setConfig: async () => receipt,
    events: ({ signal }) => replay([], signal),
    snapshot: () => sessionSnapshot(),
    transcript: async () => [],
    describe: () => ({ commands: [], config: [], tools: [] }),
    ...over,
  }
  const view = createSessionView(source)
  await view.ready
  return { view, sent, commands }
}

/** A source whose URLs expire an hour after each call, and the ids it was asked for. */
function expiringUrls() {
  const asked: Array<string> = []
  const mediaUrl = async (id: string) => {
    asked.push(id)
    return {
      url: `https://media.test/${id}?v=${asked.length}`,
      expiresAt: Date.now() + HOUR,
    }
  }
  return { asked, mediaUrl }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('media in the view reducer', () => {
  it('puts generated media inside the child agent part that made it', () => {
    const state = fold([
      at({
        subagentRunId: 'child-1',
        type: EventType.SUBAGENT_STARTED,
        name: 'painter',
      }),
      mediaEvent(record({ subagentRunId: 'child-1' })),
    ])
    expect(assistantParts(state)).toEqual([
      {
        type: 'agent',
        id: 'child-1',
        name: 'painter',
        status: 'running',
        parts: [shown()],
      },
    ])
  })

  it('puts media with no known child in the lead parts of its turn, once per id', () => {
    const state = fold([
      at({ type: EventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'Hi' }),
      mediaEvent(record()),
      mediaEvent(record({ id: 'm2', name: 'dog.png', subagentRunId: 'gone' })),
      mediaEvent(record()),
    ])
    expect(assistantParts(state)).toEqual([
      { type: 'text', text: 'Hi' },
      shown(),
      shown({ id: 'm2', name: 'dog.png' }),
    ])
  })

  it('reads user media parts and the media saved on an assistant message', () => {
    const messages = messagesFromTranscript([
      {
        role: 'user',
        content: [
          { type: 'text', content: 'What is this?' },
          mediaPart(record({ id: 'u1', source: 'user' })),
        ],
      },
      savedAnswer([record({ id: 'm2', name: 'dog.png' })]),
    ])
    expect(messages).toEqual([
      {
        id: 'history-0',
        role: 'user',
        text: 'What is this?',
        // A saved part keeps only its id and MIME type.
        media: [shown({ id: 'u1', name: 'u1', size: 0 })],
      },
      {
        id: 'history-1',
        role: 'assistant',
        parts: [
          { type: 'text', text: 'Here it is.' },
          shown({ id: 'm2', name: 'dog.png' }),
        ],
      },
    ])
  })
})

describe('media in createSessionView', () => {
  it('sends attachments as media parts and shows them on the user message', async () => {
    const { view, sent } = await openView()

    await view.send('What is this?', [record({ id: 'u1', source: 'user' })])
    await view.send('', [record({ id: 'u2', source: 'user' })])

    expect(sent).toEqual([
      [
        { type: 'text', content: 'What is this?' },
        {
          type: 'image',
          source: {
            type: 'url',
            value: 'harness-media:u1',
            mimeType: 'image/png',
          },
        },
      ],
      [
        {
          type: 'image',
          source: {
            type: 'url',
            value: 'harness-media:u2',
            mimeType: 'image/png',
          },
        },
      ],
    ])
    expect(view.store.get().messages).toEqual([
      {
        id: 'user-0',
        role: 'user',
        text: 'What is this?',
        media: [shown({ id: 'u1' })],
      },
      { id: 'user-1', role: 'user', text: '', media: [shown({ id: 'u2' })] },
    ])
    view.dispose()
  })

  it('runs a /command and drops its attachments', async () => {
    const { view, sent, commands } = await openView()

    await view.send('/ping now', [record()])

    expect(commands).toEqual([{ name: 'ping', input: 'now' }])
    expect(sent).toEqual([])
    expect(view.store.get().messages).toEqual([])
    view.dispose()
  })

  it('fills in each url once, then gets a new one a minute before it expires', async () => {
    vi.useFakeTimers({ now: 0 })
    const { asked, mediaUrl } = expiringUrls()
    const { view } = await openView({
      transcript: async () => [
        savedAnswer([record()]),
        savedAnswer([record()]),
      ],
      mediaUrl,
    })
    const urls = () => mediaIn(view).map((part) => part.url)

    await vi.waitFor(() =>
      expect(urls()).toEqual([
        'https://media.test/m1?v=1',
        'https://media.test/m1?v=1',
      ]),
    )
    expect(asked).toEqual(['m1'])

    await vi.advanceTimersByTimeAsync(HOUR - MINUTE - 1 - Date.now())
    expect(asked).toEqual(['m1'])
    await vi.advanceTimersByTimeAsync(1)

    await vi.waitFor(() =>
      expect(urls()).toEqual([
        'https://media.test/m1?v=2',
        'https://media.test/m1?v=2',
      ]),
    )
    expect(asked).toEqual(['m1', 'm1'])
    view.dispose()
  })

  it('shows an error when the source cannot give a url', async () => {
    const { view } = await openView({
      transcript: async () => [savedAnswer([record()])],
      mediaUrl: async () => {
        throw new Error('Media not found.')
      },
    })

    await vi.waitFor(() =>
      expect(view.store.get().messages.at(-1)).toMatchObject({
        role: 'notice',
        kind: 'error',
        text: 'Media not found.',
      }),
    )
    expect(mediaIn(view)).toEqual([shown()])
    view.dispose()
  })

  it('loads the bytes of media inside a child agent part', async () => {
    const { view } = await openView({
      events: ({ signal }) =>
        replay(
          [
            at({
              subagentRunId: 'child-1',
              type: EventType.SUBAGENT_STARTED,
              name: 'painter',
            }),
            mediaEvent(record({ subagentRunId: 'child-1' })),
          ],
          signal,
        ),
      loadMedia: async (id) => new TextEncoder().encode(`bytes of ${id}`),
    })

    await vi.waitFor(() => expect(mediaIn(view)).toHaveLength(1))
    const [part] = mediaIn(view)

    expect(new TextDecoder().decode(await part?.load())).toBe('bytes of m1')
    view.dispose()
  })

  it('rejects load() when the source cannot load media', async () => {
    const { view } = await openView({
      transcript: async () => [savedAnswer([record()])],
    })
    const [part] = mediaIn(view)

    await expect(part?.load()).rejects.toThrow('cannot load media')
    view.dispose()
  })

  it('clears the url refresh timers on dispose', async () => {
    vi.useFakeTimers({ now: 0 })
    const { asked, mediaUrl } = expiringUrls()
    const { view } = await openView({
      transcript: async () => [savedAnswer([record()])],
      mediaUrl,
    })
    await vi.waitFor(() => expect(vi.getTimerCount()).toBe(1))

    view.dispose()
    await vi.advanceTimersByTimeAsync(HOUR)

    expect(vi.getTimerCount()).toBe(0)
    expect(asked).toEqual(['m1'])
  })
})
