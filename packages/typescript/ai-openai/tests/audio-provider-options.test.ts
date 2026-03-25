import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  validateInstructions,
  validateStreamFormat,
} from '../src/audio/audio-provider-options'

describe('audio provider option validation', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('validateStreamFormat', () => {
    it('warns when stream_format is used with an unknown model', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      expect(() =>
        validateStreamFormat({
          input: 'hello',
          model: 'not-a-real-model',
          stream_format: 'audio',
        }),
      ).not.toThrow()

      expect(warnSpy).toHaveBeenCalledWith(
        'Unknown TTS model: not-a-real-model. stream_format may not be supported.',
      )
    })

    it('throws when streaming is not supported by a known model', () => {
      expect(() =>
        validateStreamFormat({
          input: 'hello',
          model: 'tts-1',
          stream_format: 'sse',
        }),
      ).toThrow('The model tts-1 does not support streaming.')
    })
  })

  describe('validateInstructions', () => {
    it('throws for an unknown model', () => {
      expect(() =>
        validateInstructions({
          input: 'hello',
          model: 'not-a-real-model',
          instructions: 'speak calmly',
        }),
      ).toThrow('Unknown TTS model: not-a-real-model')
    })

    it('throws when instructions are not supported by a known model', () => {
      expect(() =>
        validateInstructions({
          input: 'hello',
          model: 'tts-1',
          instructions: 'speak calmly',
        }),
      ).toThrow('The model tts-1 does not support instructions.')
    })
  })
})
