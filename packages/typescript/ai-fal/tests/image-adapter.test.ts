import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createFalImage } from '../src/adapters/image'

// Declare mocks at module level
let mockSubscribe: any
let mockConfig: any

// Mock the fal.ai client
vi.mock('@fal-ai/client', () => {
  return {
    fal: {
      subscribe: (...args: Array<unknown>) => mockSubscribe(...args),
      config: (...args: Array<unknown>) => mockConfig(...args),
    },
  }
})

const createAdapter = () =>
  createFalImage('fal-ai/flux/dev', { apiKey: 'test-key' })

function createMockImageResponse(images: Array<{ url: string }>) {
  return {
    data: {
      images,
    },
    requestId: 'req-123',
  }
}

describe('Fal Image Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSubscribe = vi.fn()
    mockConfig = vi.fn()
  })

  it('generates images with correct API call', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://fal.media/files/image1.png' },
    ])

    mockSubscribe.mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'fal-ai/flux/dev',
      prompt: 'A futuristic city at sunset',
    })

    expect(mockSubscribe).toHaveBeenCalledTimes(1)

    const [model, options] = mockSubscribe.mock.calls[0]!
    expect(model).toBe('fal-ai/flux/dev')
    expect(options).toMatchObject({
      input: {
        prompt: 'A futuristic city at sunset',
      },
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.url).toBe('https://fal.media/files/image1.png')
    expect(result.model).toBe('fal-ai/flux/dev')
  })

  it('generates multiple images', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://fal.media/files/image1.png' },
      { url: 'https://fal.media/files/image2.png' },
    ])

    mockSubscribe.mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'fal-ai/flux/dev',
      prompt: 'A cute robot mascot',
      numberOfImages: 2,
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      num_images: 2,
    })

    expect(result.images).toHaveLength(2)
    expect(result.images[0]!.url).toBe('https://fal.media/files/image1.png')
    expect(result.images[1]!.url).toBe('https://fal.media/files/image2.png')
  })

  it('handles base64 image responses', async () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const mockResponse = createMockImageResponse([
      { url: `data:image/png;base64,${base64Data}` },
    ])

    mockSubscribe.mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'fal-ai/flux/dev',
      prompt: 'A simple test image',
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.b64Json).toBe(base64Data)
    expect(result.images[0]!.url).toBe(`data:image/png;base64,${base64Data}`)
  })

  it('converts size to fal format preset', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://fal.media/files/image.png' },
    ])

    mockSubscribe.mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'fal-ai/flux/dev',
      prompt: 'A wide landscape',
      size: '1024x768', // Should map to landscape_4_3
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      image_size: 'landscape_4_3',
    })
  })

  it('converts custom size to width/height object', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://fal.media/files/image.png' },
    ])

    mockSubscribe.mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'fal-ai/flux/dev',
      prompt: 'A custom size image',
      size: '800x600',
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      image_size: { width: 800, height: 600 },
    })
  })

  it('passes model options correctly', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://fal.media/files/image.png' },
    ])

    mockSubscribe.mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'fal-ai/flux/dev',
      prompt: 'Test',
      modelOptions: {
        num_inference_steps: 28,
        guidance_scale: 3.5,
        seed: 12345,
      },
    })

    const [, options] = mockSubscribe.mock.calls[0]!
    expect(options.input).toMatchObject({
      num_inference_steps: 28,
      guidance_scale: 3.5,
      seed: 12345,
    })
  })

  it('handles single image response format', async () => {
    const mockResponse = {
      data: {
        image: { url: 'https://fal.media/files/single.png' },
      },
      requestId: 'req-456',
    }

    mockSubscribe.mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'fal-ai/flux/dev',
      prompt: 'Single image test',
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.url).toBe('https://fal.media/files/single.png')
  })

  it('throws error on SDK error', async () => {
    mockSubscribe.mockRejectedValueOnce(new Error('Model not found'))

    const adapter = createAdapter()

    await expect(
      adapter.generateImages({
        model: 'invalid/model',
        prompt: 'Test prompt',
      }),
    ).rejects.toThrow('Model not found')
  })

  it('configures client with API key', () => {
    createFalImage('fal-ai/flux/dev', { apiKey: 'my-api-key' })

    expect(mockConfig).toHaveBeenCalledWith({
      credentials: 'my-api-key',
    })
  })

  it('configures client with proxy URL when provided', () => {
    createFalImage('fal-ai/flux/dev', {
      apiKey: 'my-api-key',
      proxyUrl: '/api/fal/proxy',
    })

    expect(mockConfig).toHaveBeenCalledWith({
      proxyUrl: '/api/fal/proxy',
    })
  })
})
