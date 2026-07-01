import { beforeEach, describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { createOpenRouterImage } from '../src/adapters/image'

const testLogger = resolveDebugOption(false)

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
  createOpenRouterImage('google/gemini-2.5-flash-image', 'test-key')

function createMockImageResponse(images: Array<{ url: string }>) {
  return {
    id: 'gen-123',
    model: 'google/gemini-2.5-flash-image',
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
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A futuristic city at sunset',
      logger: testLogger,
    })

    expect(mockSend).toHaveBeenCalledTimes(1)

    const callArgs = mockSend.mock.calls[0]![0].chatRequest
    expect(callArgs).toMatchObject({
      model: 'google/gemini-2.5-flash-image',
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
    expect(result.model).toBe('google/gemini-2.5-flash-image')
  })

  it('surfaces token usage from the chat response', async () => {
    const mockResponse = {
      ...createMockImageResponse([{ url: 'https://example.com/image1.png' }]),
      usage: {
        promptTokens: 7,
        completionTokens: 13,
        totalTokens: 20,
      },
    }

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A futuristic city at sunset',
      logger: testLogger,
    })

    expect(result.usage).toEqual({
      promptTokens: 7,
      completionTokens: 13,
      totalTokens: 20,
    })
  })

  it('surfaces provider-reported cost from OpenRouter image usage', async () => {
    const mockResponse = {
      ...createMockImageResponse([{ url: 'https://example.com/image1.png' }]),
      usage: {
        completionTokens: 1291,
        cost: 0.0387076,
        cost_details: {
          upstream_inference_completions_cost: 0.0387025,
          upstream_inference_cost: 0.0387076,
          upstream_inference_prompt_cost: 0.0000051,
        },
        promptTokens: 17,
        totalTokens: 1308,
      },
    }

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A futuristic city at sunset',
      logger: testLogger,
    })

    expect(result.usage).toMatchObject({
      promptTokens: 17,
      completionTokens: 1291,
      totalTokens: 1308,
      cost: 0.0387076,
      costDetails: {
        upstreamOutputCost: 0.0387025,
        upstreamCost: 0.0387076,
        upstreamInputCost: 0.0000051,
      },
    })
  })

  it('generates multiple images', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image1.png' },
      { url: 'https://example.com/image2.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A cute robot mascot',
      numberOfImages: 2,
      logger: testLogger,
    })

    const callArgs = mockSend.mock.calls[0]![0].chatRequest
    expect(callArgs.imageConfig).toMatchObject({
      numberOfImages: 2,
    })
    expect(callArgs.imageConfig).not.toHaveProperty('n')

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
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A simple test image',
      logger: testLogger,
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.b64Json).toBe(base64Data)
    expect(result.images[0]!.url).toBeUndefined()
  })

  it('passes aspect ratio from size', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A wide landscape',
      size: '1344x768', // 16:9
      logger: testLogger,
    })

    const callArgs = mockSend.mock.calls[0]![0].chatRequest
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
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A square image',
      size: '1024x1024',
      logger: testLogger,
    })

    const callArgs = mockSend.mock.calls[0]![0].chatRequest
    expect(callArgs.imageConfig).toMatchObject({
      aspect_ratio: '1:1',
    })
  })

  it('propagates SDK errors without rewrapping', async () => {
    mockSend = vi.fn().mockRejectedValueOnce(new Error('Model not found'))

    const adapter = createAdapter()

    // SDK errors already have context/stack — they must propagate as-is,
    // not be rewrapped with an "Image generation failed:" prefix.
    await expect(
      adapter.generateImages({
        model: 'invalid/model',
        prompt: 'Test prompt',
        logger: testLogger,
      }),
    ).rejects.toThrowError(new Error('Model not found'))
  })

  it('throws error on API error in response body', async () => {
    const errorResponse = {
      error: { message: 'Content policy violation' },
    }

    mockSend = vi.fn().mockResolvedValueOnce(errorResponse)

    const adapter = createAdapter()

    // Assert exact message — must not contain doubled "Image generation failed:" prefix
    await expect(
      adapter.generateImages({
        model: 'google/gemini-2.5-flash-image',
        prompt: 'Inappropriate content',
        logger: testLogger,
      }),
    ).rejects.toThrowError(
      new Error('Image generation failed: Content policy violation'),
    )
  })

  it('maps image prompt parts onto content parts preserving interleaved order', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/edited.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image',
      prompt: [
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/source.png' },
        },
        { type: 'text', content: 'Turn this into a cinematic product photo' },
        {
          type: 'image',
          source: { type: 'data', value: 'c3R5bGU=', mimeType: 'image/png' },
          metadata: { role: 'reference' },
        },
      ],
      logger: testLogger,
    })

    const callArgs = mockSend.mock.calls[0]![0].chatRequest
    expect(callArgs.messages).toEqual([
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            imageUrl: { url: 'https://example.com/source.png' },
          },
          { type: 'text', text: 'Turn this into a cinematic product photo' },
          {
            type: 'image_url',
            imageUrl: { url: 'data:image/png;base64,c3R5bGU=' },
          },
        ],
      },
    ])
    expect(result.images).toHaveLength(1)
  })

  it('keeps a plain string prompt when no image parts are given', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()
    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'A plain prompt',
      logger: testLogger,
    })

    const callArgs = mockSend.mock.calls[0]![0].chatRequest
    expect(callArgs.messages[0].content).toBe('A plain prompt')
  })

  it('throws for video / audio prompt parts', async () => {
    const adapter = createAdapter()

    await expect(
      adapter.generateImages({
        model: 'google/gemini-2.5-flash-image',
        prompt: [
          { type: 'text', content: 'Test' },
          {
            type: 'video',
            source: { type: 'url', value: 'https://example.com/v.mp4' },
          },
        ],
        logger: testLogger,
      }),
    ).rejects.toThrow(/does not support video \/ audio prompt parts/)
  })

  it('passes imageConfig correctly', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    mockSend = vi.fn().mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image',
      prompt: 'Test',
      modelOptions: {
        image_size: '4K',
      },
      logger: testLogger,
    })

    const callArgs = mockSend.mock.calls[0]![0].chatRequest
    expect(callArgs.imageConfig).toMatchObject({
      image_size: '4K',
    })
    expect(callArgs.modalities).toEqual(['image'])
    expect(callArgs.stream).toBe(false)
  })
})
