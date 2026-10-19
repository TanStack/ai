import { describe, expect, it, vi } from 'vitest'
import { chat, generateImage } from '@tanstack/ai'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'
import {
  MediaError,
  createMediaStore,
  mediaCapture,
  mediaMiddleware,
  toBase64,
} from '../src/media'
import { mediaPart } from '../src/media-ref'
import { logIdOf } from '../src/log'
import { mockAdapter, text } from './helpers'
import type {
  ContentPart,
  ImageAdapter,
  ModelMessage,
  TranscriptionAdapter,
} from '@tanstack/ai'
import type { MediaOptions } from '../src/media'
import type { MediaRecord } from '../src/types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function setup(threadId = 't1', options?: MediaOptions) {
  const persistence = memoryPersistence()
  return {
    persistence,
    store: createMediaStore({ persistence, threadId, options }),
  }
}

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

function userMessage(...parts: Array<ContentPart>): ModelMessage {
  return {
    role: 'user',
    content: [{ type: 'text', content: 'Look' }, ...parts],
  }
}

/** Run one chat turn and return what the adapter got and the saved thread. */
async function runTurn(
  persistence: ReturnType<typeof memoryPersistence>,
  middleware: ReturnType<typeof mediaMiddleware>,
  message: ModelMessage,
) {
  const { adapter, calls } = mockAdapter(() => text('ok'))
  await chat({
    adapter,
    messages: [message],
    threadId: 't1',
    middleware: [withPersistence(persistence), middleware],
    stream: false,
  })
  const [call] = calls
  const sent: Array<ModelMessage> = call?.messages ?? []
  return {
    sent: sent[0]?.content,
    saved: (await persistence.stores.messages.loadThread('t1'))[0]?.content,
    calls,
  }
}

describe('createMediaStore', () => {
  it('stores a file and reads it back', async () => {
    const { store } = setup()
    const record = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    expect(record).toEqual({
      id: expect.any(String),
      threadId: 't1',
      kind: 'image',
      mimeType: 'image/png',
      name: 'cat.png',
      size: 5,
      source: 'user',
      createdAt: expect.any(Number),
    })
    expect(await store.get(record.id)).toEqual(record)
    expect(decoder.decode(await store.load(record.id))).toBe('hello')
  })

  it.each([
    ['a byte body', encoder.encode('hello')],
    ['a stream body', new Blob(['hello']).stream()],
  ])('refuses %s over maxBytes with 413', async (_label, body) => {
    const { store } = setup('t1', { maxBytes: 4 })
    const put = store.put(body, { mimeType: 'image/png', name: 'cat.png' })
    await expect(put).rejects.toBeInstanceOf(MediaError)
    await expect(put).rejects.toMatchObject({ status: 413 })
  })

  it('keeps nothing when a stream goes over maxBytes', async () => {
    const { persistence, store } = setup('t1', { maxBytes: 4 })
    // A store that keeps a partial write when the body fails.
    const { blobs } = persistence.stores
    const put = blobs.put.bind(blobs)
    vi.spyOn(blobs, 'put').mockImplementation(async (key, body) => {
      await put(key, 'partial')
      return put(key, body)
    })
    await store
      .put(new Blob(['hello']).stream(), { mimeType: 'image/png', name: 'a' })
      .catch(() => undefined)
    expect(
      await persistence.stores.artifacts.listForThread(
        logIdOf({ logId: 't1' }),
      ),
    ).toEqual([])
    expect((await persistence.stores.blobs.list()).objects).toEqual([])
  })

  it.each([
    ['a MIME type with no kind', 'application/zip', undefined],
    ['a kind not in kinds', 'audio/mpeg', ['image'] as const],
    ['a MIME type that is not well formed', 'text/plain,x', undefined],
  ])('refuses %s with 415', async (_label, mimeType, kinds) => {
    const { store } = setup('t1', { kinds })
    await expect(
      store.put(encoder.encode('hello'), { mimeType, name: 'file' }),
    ).rejects.toMatchObject({ status: 415 })
  })

  it.each([
    ['another thread', { threadId: 'b' }],
    ['the same thread id in another tenant', { threadId: 'a', tenantId: 'x' }],
  ])('does not show media of %s', async (_label, other) => {
    const persistence = memoryPersistence()
    const a = createMediaStore({ persistence, threadId: 'a' })
    const b = createMediaStore({ persistence, ...other })
    const record = await a.put(encoder.encode('secret'), {
      mimeType: 'image/png',
      name: 'a.png',
    })
    expect(await b.get(record.id)).toBeNull()
    await expect(b.load(record.id)).rejects.toMatchObject({ status: 404 })
    expect(await b.dataUrl(record.id)).toBeUndefined()
  })

  it('keeps a client thread id inside the upload folder of the blob key', async () => {
    const { persistence, store } = setup('../x')
    const record = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    const blobKey = (await persistence.stores.artifacts.get(record.id))?.blobKey
    expect(blobKey).toBe(`artifacts/upload::..%2Fx/${record.id}`)
  })

  it('puts the tenant in the upload folder of the blob key', async () => {
    const persistence = memoryPersistence()
    const store = createMediaStore({
      persistence,
      threadId: 't1',
      tenantId: 'org/1',
    })
    const record = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    const blobKey = (await persistence.stores.artifacts.get(record.id))?.blobKey
    expect(blobKey).toBe(`artifacts/upload:org%2F1:t1/${record.id}`)
  })

  it('throws 404 for an id that does not exist', async () => {
    const { store } = setup()
    await expect(store.load('nope')).rejects.toMatchObject({ status: 404 })
  })

  it.each([
    [{ offset: 6 }, 'world'],
    [{ offset: 0, length: 5 }, 'hello'],
    [{ offset: 6, length: 100 }, 'world'],
  ])('loads the range %j', async (range, expected) => {
    const { store } = setup()
    const record = await store.put('hello world', {
      mimeType: 'text/plain',
      name: 'a.txt',
    })
    expect(decoder.decode(await store.load(record.id, range))).toBe(expected)
  })

  it.each([[undefined], [{ offset: 6 }], [{ offset: 0, length: 5 }]])(
    'opens the same bytes as a stream for the range %j',
    async (range) => {
      const { store } = setup()
      const record = await store.put('hello world', {
        mimeType: 'text/plain',
        name: 'a.txt',
      })
      const stream = await store.open(record.id, range)
      expect(stream).toBeInstanceOf(ReadableStream)
      expect(new Uint8Array(await new Response(stream).arrayBuffer())).toEqual(
        await store.load(record.id, range),
      )
    },
  )

  it('keeps the base64 of a file, and drops the oldest over the cap', async () => {
    const persistence = memoryPersistence()
    const blobGet = vi.spyOn(persistence.stores.blobs, 'get')
    // Each 5-byte file is 8 characters of base64: two fit in 16.
    const store = createMediaStore({
      persistence,
      threadId: 't1',
      encodedBytes: 16,
    })
    const put = (body: string) =>
      store.put(body, { mimeType: 'image/png', name: `${body}.png` })
    const [a, b, c] = [
      await put('aaaaa'),
      await put('bbbbb'),
      await put('ccccc'),
    ]
    const reads = async (id: string) => {
      const before = blobGet.mock.calls.length
      await store.dataUrl(id)
      return blobGet.mock.calls.length - before
    }

    expect(await reads(a.id)).toBe(1)
    expect(await reads(a.id)).toBe(0)
    expect(await reads(b.id)).toBe(1)
    // `c` pushes out `a`, the oldest.
    expect(await reads(c.id)).toBe(1)
    expect(await reads(b.id)).toBe(0)
    expect(await reads(c.id)).toBe(0)
    expect(await reads(a.id)).toBe(1)
    expect(await store.dataUrl(a.id)).toBe('data:image/png;base64,YWFhYWE=')
  })

  it('keeps one base64 cap for all the threads of a blob store', async () => {
    const persistence = memoryPersistence()
    const blobGet = vi.spyOn(persistence.stores.blobs, 'get')
    // Each 5-byte file is 8 characters of base64: two fit in 16, for both
    // threads together.
    const one = createMediaStore({
      persistence,
      threadId: 't1',
      encodedBytes: 16,
    })
    const two = createMediaStore({
      persistence,
      threadId: 't2',
      encodedBytes: 16,
    })
    const put = (store: typeof one, body: string) =>
      store.put(body, { mimeType: 'image/png', name: `${body}.png` })
    const a = await put(one, 'aaaaa')
    const b = await put(two, 'bbbbb')
    const c = await put(one, 'ccccc')
    const reads = async (store: typeof one, id: string) => {
      const before = blobGet.mock.calls.length
      await store.dataUrl(id)
      return blobGet.mock.calls.length - before
    }

    expect(await reads(one, a.id)).toBe(1)
    expect(await reads(two, b.id)).toBe(1)
    // `c` pushes out `a`, the oldest, though `a` is of the other thread.
    expect(await reads(one, c.id)).toBe(1)
    expect(await reads(two, b.id)).toBe(0)
    expect(await reads(one, a.id)).toBe(1)
  })

  it('takes the largest base64 cap that a store of the blob store asks for', async () => {
    const persistence = memoryPersistence()
    const blobGet = vi.spyOn(persistence.stores.blobs, 'get')
    const one = createMediaStore({
      persistence,
      threadId: 't1',
      encodedBytes: 16,
    })
    // A later store asks for more: three files of 8 characters fit in 24.
    createMediaStore({ persistence, threadId: 't2', encodedBytes: 24 })
    const put = (body: string) =>
      one.put(body, { mimeType: 'image/png', name: `${body}.png` })
    const ids = [
      (await put('aaaaa')).id,
      (await put('bbbbb')).id,
      (await put('ccccc')).id,
    ]
    for (const id of ids) await one.dataUrl(id)
    const before = blobGet.mock.calls.length

    for (const id of ids) await one.dataUrl(id)

    expect(blobGet.mock.calls.length).toBe(before)
  })

  it('makes a data URL up to 1 MB only', async () => {
    const { store } = setup()
    const small = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'small.png',
    })
    const big = await store.put(new Uint8Array(1024 * 1024 + 1), {
      mimeType: 'image/png',
      name: 'big.png',
    })
    expect(await store.dataUrl(small.id)).toBe('data:image/png;base64,aGVsbG8=')
    expect(await store.dataUrl(big.id)).toBeUndefined()
  })
})

describe('toBase64', () => {
  it('encodes in chunks where there is no Buffer', () => {
    const bytes = Uint8Array.from({ length: 100_000 }, (_, i) => i % 256)
    const expected = Buffer.from(bytes).toString('base64')
    vi.stubGlobal('Buffer', undefined)
    const btoa = vi.spyOn(globalThis, 'btoa')
    try {
      expect(toBase64(bytes)).toBe(expected)
      const longest = Math.max(
        ...btoa.mock.calls.map(([input]) => input.length),
      )
      expect(longest).toBeLessThanOrEqual(0x8000)
    } finally {
      btoa.mockRestore()
      vi.unstubAllGlobals()
    }
  })
})

describe('mediaCapture', () => {
  it.each([
    ['a child run', 'op-chat-1:subagent-9:image-1', 'op-chat-1', 'subagent-9'],
    [
      'a nested child run',
      'op-chat-2:subagent-a:subagent-b:image-3',
      'op-chat-2',
      'subagent-b',
    ],
    ['a plain run', 'run-7', 'run-7', undefined],
  ])(
    'publishes generated media of %s',
    async (_label, generationRunId, runId, subagentRunId) => {
      const persistence = memoryPersistence()
      const published: Array<MediaRecord> = []
      const result = await generateImage({
        adapter: imageAdapter(),
        prompt: 'a cat',
        // A background agent runs under its own thread id. Media still goes
        // to the session thread.
        threadId: 't1:painter',
        runId: generationRunId,
        middleware: mediaCapture({
          persistence,
          threadId: 't1',
          publish: (record) => {
            published.push(record)
          },
        }),
      })
      expect(result.images).toHaveLength(1)
      expect(published).toEqual([
        {
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
        },
      ])
      const store = createMediaStore({ persistence, threadId: 't1' })
      const bytes = await store.load(published[0]?.id ?? '')
      expect(decoder.decode(bytes)).toBe('hello')
    },
  )

  it('keeps the generation result when publish throws', async () => {
    const onError = vi.fn()
    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'a cat',
      runId: 'op-chat-1:subagent-1:image-1',
      middleware: mediaCapture({
        persistence: memoryPersistence(),
        threadId: 't1',
        publish: () => {
          throw new Error('feed closed')
        },
        onError,
      }),
    })
    expect(result.images).toHaveLength(1)
    expect(onError).toHaveBeenCalledWith(new Error('feed closed'))
  })

  it('keeps the generation result when the blob store fails', async () => {
    const persistence = memoryPersistence()
    vi.spyOn(persistence.stores.blobs, 'put').mockRejectedValue(
      new Error('disk full'),
    )
    const onError = vi.fn()
    const publish = vi.fn()
    const result = await generateImage({
      adapter: imageAdapter(),
      prompt: 'a cat',
      runId: 'op-chat-1:subagent-1:image-1',
      middleware: mediaCapture({
        persistence,
        threadId: 't1',
        publish,
        onError,
      }),
    })
    expect(result.images).toEqual([{ b64Json: 'aGVsbG8=' }])
    expect(onError).toHaveBeenCalledWith(new Error('disk full'))
    expect(publish).not.toHaveBeenCalled()
  })
})

describe('mediaMiddleware', () => {
  it('sends the bytes to the model and saves the harness-media URL', async () => {
    const { persistence, store } = setup()
    const record = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    // withPersistence comes first, as in a harness turn.
    const { sent, saved } = await runTurn(
      persistence,
      mediaMiddleware({ store }),
      userMessage(mediaPart(record)),
    )
    expect(sent).toEqual([
      { type: 'text', content: 'Look' },
      {
        type: 'image',
        source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
      },
    ])
    expect(saved).toEqual([
      { type: 'text', content: 'Look' },
      {
        type: 'image',
        source: {
          type: 'url',
          value: `harness-media:${record.id}`,
          mimeType: 'image/png',
        },
      },
    ])
  })

  it('does not load or encode the file again at the next turn', async () => {
    const { persistence, store } = setup()
    const record = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    const blobGet = vi.spyOn(persistence.stores.blobs, 'get')
    // A harness makes a new middleware at each turn, on the same store.
    const first = await runTurn(
      persistence,
      mediaMiddleware({ store }),
      userMessage(mediaPart(record)),
    )
    const second = await runTurn(
      persistence,
      mediaMiddleware({ store }),
      userMessage(mediaPart(record)),
    )
    expect(blobGet).toHaveBeenCalledTimes(1)
    expect(second.sent).toEqual(first.sent)
    expect(second.sent).toContainEqual({
      type: 'image',
      source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
    })
  })

  it.each([
    [
      'audio when transcribe is not set',
      'audio/mpeg',
      undefined,
      'test-model cannot read audio files. Add media.transcribe, or send a text summary.',
    ],
    [
      'video, also when transcribe is set',
      'video/mp4',
      transcriptionAdapter(),
      'test-model cannot read video files. Use a model that reads video files, or send a text summary.',
    ],
  ])(
    'refuses %s before the model call',
    async (_label, mimeType, transcribe, message) => {
      const { persistence, store } = setup()
      const record = await store.put(encoder.encode('hello'), {
        mimeType,
        name: 'clip',
      })
      const { adapter, calls } = mockAdapter(() => text('ok'))
      await expect(
        chat({
          adapter,
          messages: [userMessage(mediaPart(record))],
          threadId: 't1',
          middleware: [
            withPersistence(persistence),
            mediaMiddleware({ store, accepted: ['text', 'image'], transcribe }),
          ],
          stream: false,
        }),
      ).rejects.toThrow(message)
      expect(calls).toHaveLength(0)
    },
  )

  it('turns audio into a transcript when the model cannot read audio', async () => {
    const { persistence, store } = setup()
    const record = await store.put(encoder.encode('meow meow'), {
      mimeType: 'audio/mpeg',
      name: 'voice.mp3',
    })
    const { sent } = await runTurn(
      persistence,
      mediaMiddleware({
        store,
        accepted: ['text', 'image'],
        transcribe: transcriptionAdapter(),
      }),
      userMessage(mediaPart(record)),
    )
    expect(sent).toEqual([
      { type: 'text', content: 'Look' },
      { type: 'text', content: '[audio transcript: voice.mp3] meow meow' },
    ])
  })

  it('sends a text note when the bytes are gone', async () => {
    const { persistence, store } = setup()
    const record = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    const blobKey = (await persistence.stores.artifacts.get(record.id))?.blobKey
    await persistence.stores.blobs.delete(blobKey ?? '')
    const { sent, calls } = await runTurn(
      persistence,
      mediaMiddleware({ store }),
      userMessage(mediaPart(record)),
    )
    expect(calls).toHaveLength(1)
    expect(sent).toEqual([
      { type: 'text', content: 'Look' },
      { type: 'text', content: '[image not found: cat.png]' },
    ])
  })

  it('sends the stored kind when a part has another type', async () => {
    const { persistence, store } = setup()
    const record = await store.put(encoder.encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    const { sent } = await runTurn(
      persistence,
      mediaMiddleware({ store }),
      userMessage({
        type: 'video',
        source: { type: 'url', value: `harness-media:${record.id}` },
      }),
    )
    expect(sent).toEqual([
      { type: 'text', content: 'Look' },
      {
        type: 'image',
        source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
      },
    ])
  })

  it('sends a text note when the record is gone', async () => {
    const { persistence, store } = setup()
    const { sent } = await runTurn(
      persistence,
      mediaMiddleware({ store }),
      userMessage({
        type: 'image',
        source: { type: 'url', value: 'harness-media:deleted-1' },
      }),
    )
    expect(sent).toEqual([
      { type: 'text', content: 'Look' },
      { type: 'text', content: '[image not found: deleted-1]' },
    ])
  })
})
