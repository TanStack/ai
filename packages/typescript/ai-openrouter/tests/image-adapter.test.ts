import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenRouterImage } from '../src/adapters/image'

// Declare mockSend at module level
let mockSend: any

// Mock the OpenRouter SDK
vi.mock('@openrouter/sdk', () => {
  return {
    OpenRouter: class {
      chat = {
        send: (...args: Array<unknown>) => mockSend(...args),
      }
    },
  }
})

const createAdapter = () =>
  createOpenRouterImage('google/gemini-2.5-flash-image-preview', 'test-key')

function createMockImageResponse(images: Array<{ url: string }>) {
  return {
    id: 'gen-123',
    model: 'google/gemini-2.5-flash-image-preview',
    choices: [
      {
        finishReason: 'stop',
        index: 0,
        message: {
          role: 'assistant',
          content: 'Here is the generated image.',
          images: images.map((img) => ({
            type: 'image_url',
            imageUrl: { url: img.url },
          })),
        },
      },
    ],
    created: Date.now(),
    object: 'chat.completion' as const,
  }
}

describe('OpenRouter Image Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates images with correct API call', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image1.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A futuristic city at sunset',
    })

    expect(mockSend).toHaveBeenCalledTimes(1)

    const callArgs = mockSend.mock.calls[0]![0]
    expect(callArgs).toMatchObject({
      model: 'google/gemini-2.5-flash-image-preview',
      modalities: ['image'],
      messages: [
        {
          role: 'user',
          content: 'A futuristic city at sunset',
        },
      ],
      stream: false,
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.url).toBe('https://example.com/image1.png')
    expect(result.model).toBe('google/gemini-2.5-flash-image-preview')
  })

  it('generates multiple images', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image1.png' },
      { url: 'https://example.com/image2.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A cute robot mascot',
      numberOfImages: 2,
    })

    const callArgs = mockSend.mock.calls[0]![0]
    expect(callArgs.imageConfig).toMatchObject({
      n: 2,
      numberOfImages: 2,
    })

    expect(result.images).toHaveLength(2)
    expect(result.images[0]!.url).toBe('https://example.com/image1.png')
    expect(result.images[1]!.url).toBe('https://example.com/image2.png')
  })

  it('handles base64 image responses', async () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const mockResponse = createMockImageResponse([
      { url: `data:image/png;base64,${base64Data}` },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A simple test image',
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.b64Json).toBe(base64Data)
    expect(result.images[0]!.url).toBe(`data:image/png;base64,${base64Data}`)
  })

  it('passes aspect ratio from size', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A wide landscape',
      size: '1344x768', // 16:9
    })

    const callArgs = mockSend.mock.calls[0]![0]
    expect(callArgs.imageConfig).toMatchObject({
      aspect_ratio: '16:9',
    })
  })

  it('converts size to aspect ratio', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A square image',
      size: '1024x1024',
    })

    const callArgs = mockSend.mock.calls[0]![0]
    expect(callArgs.imageConfig).toMatchObject({
      aspect_ratio: '1:1',
    })
  })

  it('throws error on SDK error', async () => {
    mockSend = vi.fn().mockRejectedValueOnce(new Error('Model not found'))

    const adapter = createAdapter()

    await expect(
      adapter.generateImages({
        model: 'invalid/model',
        prompt: 'Test prompt',
      }),
    ).rejects.toThrow('Image generation failed: Model not found')
  })

  it('throws error on API error in response body', async () => {
    const errorResponse = {
      error: { message: 'Content policy violation' },
    }

    mockSend = vi.fn().mockResolvedValueOnce(errorResponse)

    const adapter = createAdapter()

    await expect(
      adapter.generateImages({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'Inappropriate content',
      }),
    ).rejects.toThrow('Image generation failed: Content policy violation')
  })

  it('passes imageConfig correctly', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'Test',
      modelOptions: {
        image_size: '4K',
      },
    })

    const callArgs = mockSend.mock.calls[0]![0]
    expect(callArgs.imageConfig).toMatchObject({
      image_size: '4K',
    })
    expect(callArgs.modalities).toEqual(['image'])
    expect(callArgs.stream).toBe(false)
  })
})
