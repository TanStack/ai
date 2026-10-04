import { describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  HARNESS_EVENTS,
  MediaError,
  createHarnessHost,
  defineHarness,
  mediaPart,
} from '../src'
import { messagesFromTranscript } from '../src/view/reduce'
import { mockAdapter, text, toolCall } from './helpers'
import type {
  AnyTextAdapter,
  ImageAdapter,
  Modality,
  TranscriptionAdapter,
} from '@tanstack/ai'
import type {
  AnyHarness,
  HarnessPersistence,
  MediaKind,
  MediaOptions,
  MediaRecord,
  SessionEvent,
  UserInput,
} from '../src'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

// ponytail: the image and transcription fakes repeat the ones in
// media.test.ts. Move both to helpers.ts when a third file needs them.
function imageAdapter(): ImageAdapter<string> {
  return {
    kind: 'image',
    name: 'fake-image',
    model: 'fake-image-model',
    '~types': {
      providerOptions: {},
      modelProviderOptionsByName: {},
      modelSizeByName: {},
      modelInputModalitiesByName: {},
    },
    // 'aGVsbG8=' is base64 for "hello".
    generateImages: async () => ({
      id: 'image-1',
      model: 'fake-image-model',
      images: [{ b64Json: 'aGVsbG8=' }],
    }),
  }
}

/** A transcription adapter that answers with the text of the audio bytes. */
function transcriptionAdapter(): TranscriptionAdapter<string> {
  return {
    kind: 'transcription',
    name: 'fake-stt',
    model: 'fake-stt-model',
    '~types': { providerOptions: {} },
    transcribe: async ({ audio }) => ({
      id: 'transcript-1',
      model: 'fake-stt-model',
      text: audio instanceof Blob ? await audio.text() : 'not a blob',
    }),
  }
}

/** A text adapter that answers "ok" and reads the `inputs` kinds at runtime. */
function reader(inputs?: ReadonlyArray<Modality>) {
  const { adapter, calls } = mockAdapter(() => text('ok'))
  const withInputs: AnyTextAdapter = { ...adapter, inputModalities: inputs }
  return { adapter: withInputs, calls }
}

/** An agent that makes one image through `ctx.generateImage`. */
const painter = defineAgent({
  name: 'painter',
  description: 'Paints',
  run: async (ctx) => {
    await ctx.generateImage({ adapter: imageAdapter(), prompt: 'a cat' })
    return 'painted'
  },
})

function harnessWith(adapter: AnyTextAdapter, media?: MediaOptions) {
  return defineHarness({ name: 'test/media', adapter, media })
}

async function open<THarness extends AnyHarness>(
  harness: THarness,
  persistence: HarnessPersistence = memoryPersistence(),
) {
  const host = createHarnessHost({ persistence })
  const session = await host.open(harness, { threadId: 't1' })
  return { host, session }
}

/** A prompt that sends `record` with a question. */
function askAbout(record: MediaRecord) {
  const input: UserInput = [
    { type: 'text', content: 'What is this?' },
    mediaPart(record),
  ]
  return input
}

/** A stored user image with the bytes "hello". */
function storedImage(record: Partial<MediaRecord> = {}) {
  return {
    id: expect.any(String),
    threadId: 't1',
    kind: 'image',
    mimeType: 'image/png',
    name: 'cat.png',
    size: 5,
    source: 'user',
    createdAt: expect.any(Number),
    ...record,
  }
}

async function collect(iterable: AsyncIterable<SessionEvent>) {
  const out: Array<SessionEvent> = []
  for await (const entry of iterable) out.push(entry)
  return out
}

/** The values of the `CUSTOM` events named `name`. */
function customValues(events: Array<SessionEvent>, name: string) {
  return events.flatMap(({ event }) =>
    event.type === EventType.CUSTOM && event.name === name ? [event.value] : [],
  )
}

/** The id of the one child run in `events`. */
function childRunId(events: Array<SessionEvent>) {
  const ids = events.flatMap(({ event }) =>
    event.type === EventType.SUBAGENT_STARTED ? [event.subagentRunId] : [],
  )
  const [id] = ids
  if (ids.length !== 1 || id === undefined)
    throw new Error(`Expected one child run, got ${ids.length}`)
  return id
}

describe('session media store', () => {
  it('stores a file and reads it back', async () => {
    const { host, session } = await open(harnessWith(mockAdapter([]).adapter))

    const record = await session.putMedia(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })

    expect(record).toEqual(storedImage())
    expect(await session.getMedia(record.id)).toEqual(record)
    expect(decoder.decode(await session.loadMedia(record.id))).toBe('hello')
    await host.close()
  })

  it('keeps media in memory when the host has no media stores', async () => {
    const { messages } = memoryPersistence().stores
    const { host, session } = await open(harnessWith(mockAdapter([]).adapter), {
      stores: { messages },
    })

    const record = await session.putMedia(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })

    expect(decoder.decode(await session.loadMedia(record.id))).toBe('hello')
    await host.close()
  })

  it('refuses a file over media.maxBytes with a 413 MediaError', async () => {
    const { host, session } = await open(
      harnessWith(mockAdapter([]).adapter, { maxBytes: 4 }),
    )

    const put = session.putMedia(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })

    await expect(put).rejects.toBeInstanceOf(MediaError)
    await expect(put).rejects.toMatchObject({ status: 413 })
    await host.close()
  })

  it('does not show the media of another thread', async () => {
    const harness = harnessWith(mockAdapter([]).adapter)
    const { host, session } = await open(harness)
    const other = await host.open(harness, { threadId: 't2' })

    const record = await session.putMedia(encoder.encode('secret'), {
      mimeType: 'image/png',
      name: 'a.png',
    })

    expect(await other.getMedia(record.id)).toBeNull()
    await host.close()
  })

  it('gives a data URL for a small file, and none for an unknown id', async () => {
    const { host, session } = await open(harnessWith(mockAdapter([]).adapter))
    const record = await session.putMedia(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })

    expect(await session.mediaUrl(record.id)).toEqual({
      url: 'data:image/png;base64,aGVsbG8=',
    })
    expect(await session.mediaUrl('nope')).toStrictEqual({})
    await host.close()
  })
})

describe('media sent to a turn', () => {
  /** Send a stored image to a turn of a model with no input list. */
  async function sendImage() {
    const { adapter, calls } = reader()
    const { host, session } = await open(harnessWith(adapter))
    const record = await session.putMedia(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    await session.prompt(askAbout(record))
    return { host, session, record, calls }
  }

  it('sends the bytes when nothing limits the kinds, and saves the harness-media URL', async () => {
    const { host, session, record, calls } = await sendImage()

    expect(calls[0].messages[0].content).toEqual([
      { type: 'text', content: 'What is this?' },
      {
        type: 'image',
        source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
      },
    ])
    const [saved] = await session.transcript()
    expect(saved).toMatchObject({
      role: 'user',
      content: [
        { type: 'text', content: 'What is this?' },
        {
          type: 'image',
          source: {
            type: 'url',
            value: `harness-media:${record.id}`,
            mimeType: 'image/png',
          },
        },
      ],
      metadata: { harness: { media: [record] } },
    })
    await host.close()
  })

  it('gives the view the name and size of a file from the saved user message', async () => {
    const { host, session, record } = await sendImage()

    const [user] = messagesFromTranscript(await session.transcript())

    expect(user).toMatchObject({
      role: 'user',
      text: 'What is this?',
      media: [
        {
          type: 'media',
          id: record.id,
          kind: 'image',
          mimeType: 'image/png',
          name: 'cat.png',
          size: 5,
        },
      ],
    })
    await host.close()
  })

  const refusals: Array<{
    label: string
    inputs?: ReadonlyArray<Modality>
    accepts?: ReadonlyArray<MediaKind>
    mimeType: string
    message: string
  }> = [
    {
      label: 'an adapter that reads only text refuses an image',
      inputs: ['text'],
      mimeType: 'image/png',
      message:
        'test-model cannot read image files. Use a model that reads image files, or send a text summary.',
    },
    {
      label: 'media.accepts refuses audio when the adapter has no list',
      accepts: ['image'],
      mimeType: 'audio/mpeg',
      message:
        'test-model cannot read audio files. Add media.transcribe, or send a text summary.',
    },
    {
      label: 'media.accepts narrows the adapter list',
      inputs: ['text', 'image'],
      accepts: ['audio'],
      mimeType: 'image/png',
      message:
        'test-model cannot read image files. Use a model that reads image files, or send a text summary.',
    },
    {
      label: 'the adapter list narrows media.accepts',
      inputs: ['text', 'image'],
      accepts: ['audio'],
      mimeType: 'audio/mpeg',
      message:
        'test-model cannot read audio files. Add media.transcribe, or send a text summary.',
    },
  ]

  it.each(refusals)(
    '$label before the model call',
    async ({ inputs, accepts, mimeType, message }) => {
      const { adapter, calls } = reader(inputs)
      const { host, session } = await open(harnessWith(adapter, { accepts }))
      const record = await session.putMedia(encoder.encode('hello'), {
        mimeType,
        name: 'file',
      })

      await expect(session.prompt(askAbout(record))).rejects.toThrow(message)
      expect(calls).toHaveLength(0)
      await host.close()
    },
  )

  it('turns audio into a transcript with media.transcribe', async () => {
    const { adapter, calls } = reader(['text'])
    const { host, session } = await open(
      harnessWith(adapter, { transcribe: transcriptionAdapter() }),
    )
    const record = await session.putMedia(encoder.encode('meow meow'), {
      mimeType: 'audio/mpeg',
      name: 'voice.mp3',
    })

    await session.prompt(askAbout(record))

    expect(calls[0].messages[0].content).toEqual([
      { type: 'text', content: 'What is this?' },
      { type: 'text', content: '[audio transcript: voice.mp3] meow meow' },
    ])
    await host.close()
  })
})

describe('media an agent makes', () => {
  /** A generated image with the bytes "hello". */
  function generatedImage(runId: string, subagentRunId: string) {
    return {
      id: expect.any(String),
      threadId: 't1',
      kind: 'image',
      mimeType: 'image/png',
      name: expect.any(String),
      size: 5,
      source: 'generated',
      createdAt: expect.any(Number),
      runId,
      subagentRunId,
    }
  }

  it('publishes the media of a subagent and saves it on the last assistant message', async () => {
    const lead = mockAdapter([
      () => toolCall('painter', {}),
      () => text('Here is your cat.'),
    ])
    const { host, session } = await open(
      defineHarness({
        name: 'test/media',
        adapter: lead.adapter,
        subagents: { agents: [painter] },
      }),
    )

    const turn = session.prompt('Paint a cat')
    await turn
    const events = await collect(turn.events({ from: '0' }))

    const media = customValues(events, HARNESS_EVENTS.media)
    expect(media).toEqual([generatedImage(turn.id, childRunId(events))])
    expect((await session.transcript()).at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Here is your cat.',
      metadata: { harness: { media } },
    })
    await host.close()
  })

  it('publishes the media of a background agent', async () => {
    const { host, session } = await open(
      defineHarness({
        name: 'test/media',
        adapter: mockAdapter([]).adapter,
        agents: [painter],
      }),
    )

    const run = session.agents.painter.run()
    await expect(run).resolves.toBe('painted')
    const events = await collect(run.events({ from: '0' }))

    expect(customValues(events, HARNESS_EVENTS.media)).toEqual([
      generatedImage(run.id, childRunId(events)),
    ])
    await host.close()
  })

  it('warns and keeps the agent result when the media store fails', async () => {
    const persistence = memoryPersistence()
    vi.spyOn(persistence.stores.blobs, 'put').mockRejectedValue(
      new Error('disk full'),
    )
    const { host, session } = await open(
      defineHarness({
        name: 'test/media',
        adapter: mockAdapter([]).adapter,
        agents: [painter],
      }),
      persistence,
    )

    const run = session.agents.painter.run()
    await expect(run).resolves.toBe('painted')
    const events = await collect(run.events({ from: '0' }))

    expect(customValues(events, 'harness.plugin.warning')).toEqual([
      {
        plugin: 'harness:media',
        message: 'The media was not kept. Error: disk full',
      },
    ])
    expect(customValues(events, HARNESS_EVENTS.media)).toEqual([])
    await host.close()
  })
})
