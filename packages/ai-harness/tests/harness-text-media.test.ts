import { describe, expect, it } from 'vitest'
import { chat } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, harnessText } from '../src'
import { mockAdapter, text } from './helpers'
import type { AnyTextAdapter, ContentPart, Modality } from '@tanstack/ai'
import type { MediaKind } from '../src'

// 'aGVsbG8=' is base64 for "hello".
const image: ContentPart = {
  type: 'image',
  source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
}
const question: Array<ContentPart> = [
  { type: 'text', content: 'What is this?' },
  image,
]

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _chunk of stream) {
    // Runs the outer chat to its end.
  }
}

/** A mock inner model that reads `inputs` at runtime. */
function innerAdapter(inputs?: ReadonlyArray<Modality>) {
  const { adapter, calls } = mockAdapter(() => text('a cat'))
  const withInputs: AnyTextAdapter = { ...adapter, inputModalities: inputs }
  return { adapter: withInputs, calls }
}

describe('harnessText media', () => {
  it('passes the parts of the last user message to the inner session', async () => {
    const inner = innerAdapter()
    const studio = defineHarness({ name: 'test/inner', adapter: inner.adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })

    await drain(
      chat({
        adapter: harnessText(studio, { host }),
        messages: [
          { role: 'user', content: 'an older question' },
          { role: 'user', content: question },
        ],
        threadId: 'outer',
      }),
    )

    expect(inner.calls[0].messages).toHaveLength(1)
    expect(inner.calls[0].messages[0].content).toEqual(question)
    await host.close()
  })

  const inputs: Array<{
    label: string
    reads?: ReadonlyArray<Modality>
    accepts?: ReadonlyArray<MediaKind>
    expected: ReadonlyArray<Modality> | undefined
  }> = [
    {
      label: 'the inner adapter list',
      reads: ['text', 'image', 'audio'],
      expected: ['text', 'image', 'audio'],
    },
    {
      label: 'the inner adapter list narrowed by media.accepts',
      reads: ['text', 'image', 'audio'],
      accepts: ['image', 'video'],
      expected: ['text', 'image'],
    },
    {
      label: 'text plus media.accepts when the adapter has no list',
      accepts: ['audio'],
      expected: ['text', 'audio'],
    },
    { label: 'unknown when neither is known', expected: undefined },
  ]

  it.each(inputs)('reads $label', ({ reads, accepts, expected }) => {
    const studio = defineHarness({
      name: 'test/inputs',
      adapter: innerAdapter(reads).adapter,
      media: { accepts },
    })

    expect(harnessText(studio).inputModalities).toEqual(expected)
  })

  it('reads the inputModalities option, for a harness without an adapter', () => {
    const plain = defineHarness({ name: 'test/no-adapter' })
    const studio = defineHarness({
      name: 'test/picked',
      adapter: innerAdapter(['text', 'image', 'audio']).adapter,
      media: { accepts: ['image', 'audio'] },
    })

    expect(harnessText(plain).inputModalities).toBe(undefined)
    expect(
      harnessText(plain, { inputModalities: ['text', 'image'] })
        .inputModalities,
    ).toEqual(['text', 'image'])
    // The option wins over the adapter list, and media.accepts narrows it.
    expect(
      harnessText(studio, { inputModalities: ['text', 'image', 'video'] })
        .inputModalities,
    ).toEqual(['text', 'image'])
  })

  it('does not know what a remote harness reads', () => {
    expect(harnessText({ url: 'http://remote.test' }).inputModalities).toBe(
      undefined,
    )
  })

  it('posts the parts of the last user message to a remote harness as AG-UI parts', async () => {
    const bodies: Array<unknown> = []
    const remote = harnessText({
      url: 'http://remote.test/api/harness',
      fetch: async (_input, init) => {
        bodies.push(JSON.parse(String(init?.body)))
        return new Response(null, { status: 200 })
      },
    })

    await drain(
      chat({
        adapter: remote,
        messages: [{ role: 'user', content: question }],
        threadId: 'outer',
      }),
    )

    expect(bodies).toEqual([
      {
        threadId: 'outer',
        runId: expect.any(String),
        messages: [
          {
            id: expect.any(String),
            role: 'user',
            content: [{ type: 'text', text: 'What is this?' }, image],
          },
        ],
        tools: [],
        context: [],
        state: {},
        forwardedProps: {},
      },
    ])
  })
})
