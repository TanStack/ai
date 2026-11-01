import { describe, expect, it } from 'vitest'
import {
  createAudioConverter,
  pickAudioFormat,
  transcriptionSession,
} from '../src/activities/index'
import type {
  LiveAudioFormat,
  LiveAudioInput,
  LiveTranscriptionAdapter,
  LiveTranscriptionConnectOptions,
  LiveTranscriptionEvent,
} from '../src/activities/index'

const pcm = (bytes: Uint8Array) =>
  Array.from(new Int16Array(bytes.slice().buffer))

function fakeAdapter(audioInputs: Array<LiveAudioInput>) {
  const sent: Array<Uint8Array> = []
  let opts!: LiveTranscriptionConnectOptions
  const adapter: LiveTranscriptionAdapter<'fake'> = {
    kind: 'liveTranscription',
    name: 'fake',
    model: 'fake',
    audioInputs,
    '~types': {} as never,
    connect: async (o) => {
      opts = o
      return {
        send: (audio) => sent.push(audio),
        close: async () => {
          o.emit({ type: 'final', text: 'flushed' })
          o.end()
        },
      }
    },
  }
  return { adapter, sent, options: () => opts }
}

describe('G.711 decode', () => {
  it('decodes μ-law and A-law reference values', () => {
    const to: LiveAudioFormat = { encoding: 'linear16', sampleRate: 8000 }
    const mulaw = createAudioConverter({ encoding: 'mulaw', sampleRate: 8000 }, to)
    expect(pcm(mulaw(new Uint8Array([0xff, 0x7f, 0x00, 0x80])))).toEqual([
      0, 0, -32124, 32124,
    ])
    const alaw = createAudioConverter({ encoding: 'alaw', sampleRate: 8000 }, to)
    expect(pcm(alaw(new Uint8Array([0xd5, 0x55, 0xaa, 0x2a])))).toEqual([
      8, -8, 32256, -32256,
    ])
  })
})

describe('createAudioConverter', () => {
  it('passes the same format through untouched', () => {
    const f: LiveAudioFormat = { encoding: 'mulaw', sampleRate: 8000 }
    const chunk = new Uint8Array([1, 2, 3])
    expect(createAudioConverter(f, f)(chunk)).toBe(chunk)
  })

  it('carries an odd byte across linear16 chunks', () => {
    const convert = createAudioConverter(
      { encoding: 'linear16', sampleRate: 8000 },
      { encoding: 'linear16', sampleRate: 16000 },
    )
    // 1000 as little-endian is e8 03, split across two chunks.
    const a = convert(new Uint8Array([0, 0, 0xe8]))
    const b = convert(new Uint8Array([0x03, 0xd0, 0x07]))
    expect([...pcm(a), ...pcm(b)]).toEqual([0, 500, 1000, 1500])
  })

  it('upsamples 8 kHz to 24 kHz with 3 samples per input sample', () => {
    const convert = createAudioConverter(
      { encoding: 'linear16', sampleRate: 8000 },
      { encoding: 'linear16', sampleRate: 24000 },
    )
    const input = new Int16Array(160).map((_, i) => i * 3)
    let total = 0
    for (let i = 0; i < 10; i++) total += convert(new Uint8Array(input.buffer)).length / 2
    // The last input frame waits for the next chunk.
    expect(total).toBe(160 * 10 * 3 - 3)
  })
})

describe('pickAudioFormat', () => {
  const mulaw: LiveAudioFormat = { encoding: 'mulaw', sampleRate: 8000 }
  it('keeps a format the provider takes', () => {
    expect(pickAudioFormat(mulaw, [{ encoding: 'mulaw' }])).toBe(mulaw)
  })
  it('falls back to linear16 at the nearest higher rate', () => {
    expect(
      pickAudioFormat(mulaw, [{ encoding: 'linear16', sampleRates: [24000] }]),
    ).toEqual({ encoding: 'linear16', sampleRate: 24000 })
  })
  it('throws when the provider takes no linear16', () => {
    expect(() => pickAudioFormat(mulaw, [{ encoding: 'alaw' }])).toThrow()
  })
})

describe('transcriptionSession', () => {
  it('converts audio, yields events, and ends after close', async () => {
    const fake = fakeAdapter([{ encoding: 'linear16', sampleRates: [8000] }])
    const session = await transcriptionSession({
      adapter: fake.adapter,
      audio: { encoding: 'mulaw', sampleRate: 8000 },
    })
    expect(fake.options().audio).toEqual({
      encoding: 'linear16',
      sampleRate: 8000,
    })

    session.send('/38=') // base64 for ff 7f
    expect(pcm(fake.sent[0]!)).toEqual([0, 0])

    fake.options().emit({ type: 'interim', text: 'hel' })
    fake.options().emit({ type: 'turn-end' })
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    await session.close()
    await reading
    expect(events).toEqual([
      { type: 'interim', text: 'hel' },
      { type: 'turn-end' },
      { type: 'final', text: 'flushed' },
    ])
  })

  it('closes the connection when the consumer breaks early', async () => {
    const fake = fakeAdapter([{ encoding: 'mulaw' }])
    const session = await transcriptionSession({
      adapter: fake.adapter,
      audio: { encoding: 'mulaw', sampleRate: 8000 },
    })
    fake.options().emit({ type: 'interim', text: 'a' })
    for await (const _ of session) break
    // close() ran, so a later send is dropped.
    session.send(new Uint8Array([1]))
    expect(fake.sent).toEqual([])
  })
})
