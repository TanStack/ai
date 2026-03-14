import {
  describe,
  it,
  expect,
  vi,
  afterEach,
  beforeEach,
  type Mock,
} from 'vitest'
import { createGroqSpeech, groqSpeech } from '../src/adapters/tts'
import type { TTSResult } from '@tanstack/ai'

// Declare mockCreate at module level
let mockSpeechCreate: Mock<(...args: Array<unknown>) => unknown>

// Mock the Groq SDK
vi.mock('groq-sdk', () => {
  return {
    default: class {
      audio = {
        speech: {
          create: (...args: Array<unknown>) => mockSpeechCreate(...args),
        },
      }
    },
  }
})

// Helper to create a mock audio response
function createMockAudioResponse(audioContent = 'mock-audio-data') {
  const encoder = new TextEncoder()
  const buffer = encoder.encode(audioContent)
  return {
    arrayBuffer: () => Promise.resolve(buffer.buffer),
  }
}

describe('Groq TTS adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  describe('Adapter creation', () => {
    it('creates a TTS adapter with explicit API key', () => {
      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('tts')
      expect(adapter.name).toBe('groq')
      expect(adapter.model).toBe('canopylabs/orpheus-v1-english')
    })

    it('creates a TTS adapter from environment variable', () => {
      vi.stubEnv('GROQ_API_KEY', 'env-api-key')

      const adapter = groqSpeech('canopylabs/orpheus-arabic-saudi')

      expect(adapter).toBeDefined()
      expect(adapter.kind).toBe('tts')
      expect(adapter.model).toBe('canopylabs/orpheus-arabic-saudi')
    })

    it('throws if GROQ_API_KEY is not set when using groqSpeech', () => {
      vi.stubEnv('GROQ_API_KEY', '')

      expect(() => groqSpeech('canopylabs/orpheus-v1-english')).toThrow(
        'GROQ_API_KEY is required',
      )
    })

    it('allows custom baseURL override', () => {
      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
        {
          baseURL: 'https://custom.api.example.com/v1',
        },
      )

      expect(adapter).toBeDefined()
    })
  })

  describe('generateSpeech', () => {
    it('generates speech and returns base64 audio', async () => {
      mockSpeechCreate = vi
        .fn()
        .mockResolvedValueOnce(createMockAudioResponse('test-audio-bytes'))

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      const result: TTSResult = await adapter.generateSpeech({
        model: 'canopylabs/orpheus-v1-english',
        text: 'Hello, world!',
        voice: 'autumn',
        format: 'wav',
        speed: 1,
      })

      expect(result).toBeDefined()
      expect(result.model).toBe('canopylabs/orpheus-v1-english')
      expect(result.format).toBe('wav')
      expect(result.contentType).toBe('audio/wav')
      expect(result.audio).toBeDefined()
      expect(result.id).toMatch(/^groq-/)
    })

    it('passes correct parameters to the SDK', async () => {
      mockSpeechCreate = vi
        .fn()
        .mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      await adapter.generateSpeech({
        model: 'canopylabs/orpheus-v1-english',
        text: 'Test speech',
        voice: 'daniel',
        format: 'wav',
        speed: 1.5,
        modelOptions: {
          sample_rate: 24000,
        },
      })

      expect(mockSpeechCreate).toHaveBeenCalledTimes(1)
      const [params] = mockSpeechCreate.mock.calls[0] as [
        Record<string, unknown>,
      ]

      expect(params).toMatchObject({
        model: 'canopylabs/orpheus-v1-english',
        input: 'Test speech',
        voice: 'daniel',
        response_format: 'wav',
        speed: 1.5,
        sample_rate: 24000,
      })
    })

    it('defaults to wav format when no format is specified', async () => {
      mockSpeechCreate = vi
        .fn()
        .mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      const result = await adapter.generateSpeech({
        model: 'canopylabs/orpheus-v1-english',
        text: 'Hello!',
      })

      expect(result.format).toBe('wav')
      expect(result.contentType).toBe('audio/wav')
    })

    it('defaults to autumn voice when no voice is specified', async () => {
      mockSpeechCreate = vi
        .fn()
        .mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      await adapter.generateSpeech({
        model: 'canopylabs/orpheus-v1-english',
        text: 'Hello!',
      })

      const [params] = mockSpeechCreate.mock.calls[0] as [
        Record<string, unknown>,
      ]
      expect(params.voice).toBe('autumn')
    })

    it('throws error when input exceeds 200 characters', async () => {
      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      const longText = 'a'.repeat(201)

      await expect(
        adapter.generateSpeech({
          model: 'canopylabs/orpheus-v1-english',
          text: longText,
        }),
      ).rejects.toThrow('Input text exceeds maximum length of 200 characters.')
    })

    it('returns correct content type for different formats', async () => {
      const formatContentTypes: Array<[string, string]> = [
        ['mp3', 'audio/mpeg'],
        ['flac', 'audio/flac'],
        ['ogg', 'audio/ogg'],
        ['wav', 'audio/wav'],
      ]

      for (const [format, expectedContentType] of formatContentTypes) {
        mockSpeechCreate = vi
          .fn()
          .mockResolvedValueOnce(createMockAudioResponse())

        const adapter = createGroqSpeech(
          'canopylabs/orpheus-v1-english',
          'test-api-key',
        )

        const result = await adapter.generateSpeech({
          model: 'canopylabs/orpheus-v1-english',
          text: 'Test',
          format: format as 'mp3' | 'flac' | 'wav',
        })

        expect(result.contentType).toBe(expectedContentType)
      }
    })

    it('works with Arabic model and voices', async () => {
      mockSpeechCreate = vi
        .fn()
        .mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-arabic-saudi',
        'test-api-key',
      )

      const result = await adapter.generateSpeech({
        model: 'canopylabs/orpheus-arabic-saudi',
        text: 'مرحبا',
        voice: 'fahad',
        format: 'wav',
      })

      expect(result).toBeDefined()
      expect(result.model).toBe('canopylabs/orpheus-arabic-saudi')

      const [params] = mockSpeechCreate.mock.calls[0] as [
        Record<string, unknown>,
      ]
      expect(params.voice).toBe('fahad')
    })
  })
})
