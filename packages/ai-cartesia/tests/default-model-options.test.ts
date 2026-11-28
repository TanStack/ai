import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCartesiaSpeech, createCartesiaTranscription } from '../src/index'
import type { ClientOptions } from '@cartesia/cartesia-js'

const sdkOptions = vi.fn((_options: ClientOptions) => undefined)

// The Cartesia SDK boundary: record the options each adapter passes to it.
vi.mock('@cartesia/cartesia-js', () => ({
  Cartesia: class {
    constructor(options: ClientOptions) {
      sdkOptions(options)
    }
  },
}))

const factories = [
  {
    kind: 'speech',
    create: () =>
      createCartesiaSpeech('sonic-3.6', 'test-key', {
        defaultModelOptions: { language: 'en' },
      }),
    defaults: { language: 'en' },
  },
  {
    kind: 'transcription',
    create: () =>
      createCartesiaTranscription('ink-whisper', 'test-key', {
        defaultModelOptions: { timestamp_granularities: ['word'] },
      }),
    defaults: { timestamp_granularities: ['word'] },
  },
]

describe('Cartesia adapters: defaultModelOptions', () => {
  beforeEach(() => {
    sdkOptions.mockClear()
  })

  it.each(factories)(
    '$kind adapter stores the defaults and keeps them out of the SDK client',
    ({ create, defaults }) => {
      const adapter = create()

      expect(adapter.defaultModelOptions).toEqual(defaults)
      expect(sdkOptions).toHaveBeenCalledTimes(1)
      expect(sdkOptions.mock.calls[0]![0]).toStrictEqual({ apiKey: 'test-key' })
    },
  )
})
