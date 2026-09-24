import { describe, expect, it, vi } from 'vitest'
import { generateSpeech } from '../src/activities/generateSpeech/index'
import { BaseTTSAdapter } from '../src/activities/generateSpeech/adapter'
import type { TTSCapabilities } from '../src/activities/generateSpeech/adapter'
import type { TTSOptions, TTSResult } from '../src/types'

/**
 * Records what the activity hands the adapter, so the tests can assert on the
 * `text` the activity derives from `turns` as well as on the validation that
 * runs before the adapter is reached.
 */
class FakeSpeechAdapter extends BaseTTSAdapter<'fake-model'> {
  readonly name = 'fake'
  readonly seen: Array<TTSOptions> = []
  override readonly capabilities: TTSCapabilities | undefined

  constructor(capabilities?: TTSCapabilities) {
    super('fake-model')
    this.capabilities = capabilities
  }

  generateSpeech(options: TTSOptions): Promise<TTSResult> {
    this.seen.push(options)
    return Promise.resolve({
      id: 'fake-1',
      model: this.model,
      audio: 'QUJD',
      format: 'mp3',
    })
  }
}

const dialogueAdapter = () => new FakeSpeechAdapter({ maxSpeakers: 2 })

describe('generateSpeech turns', () => {
  it('hands the adapter the turns plus the joined script as text', async () => {
    const adapter = dialogueAdapter()

    await generateSpeech({
      adapter,
      turns: [
        { text: 'Knock knock', voice: 'a' },
        { text: 'Who is there?', voice: 'b' },
      ],
    })

    const seen = adapter.seen[0]!
    expect(seen.text).toBe('Knock knock\nWho is there?')
    expect(seen.turns).toEqual([
      { text: 'Knock knock', voice: 'a' },
      { text: 'Who is there?', voice: 'b' },
    ])
  })

  it('rejects turns on an adapter that declares no maxSpeakers', async () => {
    const adapter = new FakeSpeechAdapter()

    await expect(
      generateSpeech({ adapter, turns: [{ text: 'hi', voice: 'a' }] }),
    ).rejects.toThrow(/fake cannot generate dialogue/)
    expect(adapter.seen).toHaveLength(0)
  })

  it('rejects more distinct voices than the adapter accepts', async () => {
    const adapter = dialogueAdapter()

    await expect(
      generateSpeech({
        adapter,
        turns: [
          { text: 'one', voice: 'a' },
          { text: 'two', voice: 'b' },
          { text: 'three', voice: 'c' },
        ],
      }),
    ).rejects.toThrow(/at most 2 distinct voices per request; received 3/)
  })

  it('counts distinct voices, not turns', async () => {
    const adapter = dialogueAdapter()

    await generateSpeech({
      adapter,
      turns: [
        { text: 'one', voice: 'a' },
        { text: 'two', voice: 'b' },
        { text: 'three', voice: 'a' },
      ],
    })

    expect(adapter.seen).toHaveLength(1)
  })

  it('rejects an empty turns array', async () => {
    const adapter = dialogueAdapter()

    await expect(generateSpeech({ adapter, turns: [] })).rejects.toThrow(
      /`turns` must not be empty/,
    )
  })

  it('rejects a call with neither text nor turns', async () => {
    const adapter = dialogueAdapter()

    // Callers can only reach this through an untyped/JS call site; the typed
    // overloads make text and turns mutually exclusive but one is required.
    await expect(
      generateSpeech({ adapter, ...({} as { text: string }) }),
    ).rejects.toThrow(/requires either `text` or `turns`/)
  })
})

describe('generateSpeech timestamps', () => {
  it('forwards the flag to an adapter that declares support', async () => {
    const adapter = new FakeSpeechAdapter({ timestamps: true })

    await generateSpeech({ adapter, text: 'hi', timestamps: true })

    expect(adapter.seen[0]?.timestamps).toBe(true)
  })

  it('rejects the flag on an adapter that cannot return timings', async () => {
    const adapter = new FakeSpeechAdapter()

    await expect(
      generateSpeech({ adapter, text: 'hi', timestamps: true }),
    ).rejects.toThrow(/fake cannot return timestamps/)
    expect(adapter.seen).toHaveLength(0)
  })

  it('leaves a plain text request untouched', async () => {
    const adapter = new FakeSpeechAdapter()
    const spy = vi.spyOn(adapter, 'generateSpeech')

    await generateSpeech({ adapter, text: 'hi', voice: 'a' })

    expect(spy).toHaveBeenCalledTimes(1)
    expect(adapter.seen[0]).toMatchObject({ text: 'hi', voice: 'a' })
    expect(adapter.seen[0]?.turns).toBeUndefined()
  })
})
