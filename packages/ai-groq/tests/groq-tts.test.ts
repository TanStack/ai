import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { generateSpeech } from '@tanstack/ai'
import {
  GroqTTSAdapter,
  createGroqSpeech,
  groqSpeech,
} from '../src/adapters/tts'

const mockSpeechCreate = vi.fn()

// Groq drives the OpenAI-compatible /audio/speech endpoint via the OpenAI SDK.
vi.mock('openai', () => {
  class OpenAI {
    audio = {
      speech: {
        create: (...args: Array<unknown>) => mockSpeechCreate(...args),
      },
    }
  }
  return { default: OpenAI }
})

// Helper to create a mock audio response (mirrors the SDK's Response shape).
function createMockAudioResponse(audioContent = 'mock-audio-data') {
  const buffer = new TextEncoder().encode(audioContent)
  return {
    arrayBuffer: () => Promise.resolve(buffer.buffer),
  }
}

describe('Groq TTS adapter', () => {
  beforeEach(() => {
    mockSpeechCreate.mockReset()
  })

  afterEach(() => {
    delete process.env['GROQ_API_KEY']
  })

  describe('Adapter creation', () => {
    it('creates a TTS adapter with explicit API key', () => {
      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      expect(adapter).toBeInstanceOf(GroqTTSAdapter)
      expect(adapter.kind).toBe('tts')
      expect(adapter.name).toBe('groq')
      expect(adapter.model).toBe('canopylabs/orpheus-v1-english')
    })

    it('creates a TTS adapter from environment variable', () => {
      process.env['GROQ_API_KEY'] = 'env-api-key'

      const adapter = groqSpeech('canopylabs/orpheus-arabic-saudi')

      expect(adapter.kind).toBe('tts')
      expect(adapter.model).toBe('canopylabs/orpheus-arabic-saudi')
    })

    it('throws if GROQ_API_KEY is not set when using groqSpeech', () => {
      delete process.env['GROQ_API_KEY']

      expect(() => groqSpeech('canopylabs/orpheus-v1-english')).toThrow(
        'GROQ_API_KEY is required',
      )
    })

    it('allows custom baseURL override', () => {
      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
        { baseURL: 'https://custom.api.example.com/v1' },
      )

      expect(adapter).toBeInstanceOf(GroqTTSAdapter)
    })
  })

  describe('generateSpeech', () => {
    it('generates speech and returns base64 audio', async () => {
      mockSpeechCreate.mockResolvedValueOnce(
        createMockAudioResponse('test-audio-bytes'),
      )

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      const result = await generateSpeech({
        adapter,
        text: 'Hello, world!',
        voice: 'autumn',
        format: 'wav',
        speed: 1,
      })

      expect(result.model).toBe('canopylabs/orpheus-v1-english')
      expect(result.format).toBe('wav')
      expect(result.contentType).toBe('audio/wav')
      expect(result.audio).toBeDefined()
      expect(result.id).toMatch(/^groq-/)
    })

    it('passes correct parameters to the SDK', async () => {
      mockSpeechCreate.mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      await generateSpeech({
        adapter,
        text: 'Test speech',
        voice: 'daniel',
        format: 'wav',
        speed: 1.5,
        modelOptions: { sample_rate: 24000 },
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
      mockSpeechCreate.mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      const result = await generateSpeech({ adapter, text: 'Hello!' })

      expect(result.format).toBe('wav')
      expect(result.contentType).toBe('audio/wav')
    })

    it('defaults to autumn voice when no voice is specified', async () => {
      mockSpeechCreate.mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-v1-english',
        'test-api-key',
      )

      await generateSpeech({ adapter, text: 'Hello!' })

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

      await expect(
        generateSpeech({ adapter, text: 'a'.repeat(201) }),
      ).rejects.toThrow('Input text exceeds maximum length of 200 characters.')
    })

    it('returns correct content type for different formats', async () => {
      const formatContentTypes: Array<['mp3' | 'flac' | 'wav', string]> = [
        ['mp3', 'audio/mpeg'],
        ['flac', 'audio/flac'],
        ['wav', 'audio/wav'],
      ]

      for (const [format, expectedContentType] of formatContentTypes) {
        mockSpeechCreate.mockResolvedValueOnce(createMockAudioResponse())

        const adapter = createGroqSpeech(
          'canopylabs/orpheus-v1-english',
          'test-api-key',
        )

        const result = await generateSpeech({ adapter, text: 'Test', format })

        expect(result.contentType).toBe(expectedContentType)
      }
    })

    it('works with Arabic model and voices', async () => {
      mockSpeechCreate.mockResolvedValueOnce(createMockAudioResponse())

      const adapter = createGroqSpeech(
        'canopylabs/orpheus-arabic-saudi',
        'test-api-key',
      )

      const result = await generateSpeech({
        adapter,
        text: 'مرحبا',
        voice: 'fahad',
        format: 'wav',
      })

      expect(result.model).toBe('canopylabs/orpheus-arabic-saudi')

      const [params] = mockSpeechCreate.mock.calls[0] as [
        Record<string, unknown>,
      ]
      expect(params.voice).toBe('fahad')
    })
  })
})
