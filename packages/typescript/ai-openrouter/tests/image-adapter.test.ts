import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenRouterImage } from '../src/adapters/image'

const createAdapter = () =>
  createOpenRouterImage('google/gemini-2.5-flash-image-preview', 'test-key')

function createMockImageResponse(images: Array<{ url: string }>): Response {
  const responseBody = {
    id: 'gen-123',
    model: 'google/gemini-2.5-flash-image-preview',
    choices: [
      {
        message: {
          content: 'Here is the generated image.',
          images: images.map((img) => ({
            image_url: { url: img.url },
          })),
        },
      },
    ],
  }

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('OpenRouter Image Adapter', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('generates images with correct API call', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image1.png' },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A futuristic city at sunset',
    })

    expect(fetchSpy).toHaveBeenCalledTimes(1)

    const [url, options] = fetchSpy.mock.calls[0]!
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')

    const payload = JSON.parse(options?.body as string)
    expect(payload).toMatchObject({
      model: 'google/gemini-2.5-flash-image-preview',
      modalities: ['image', 'text'],
      messages: [
        {
          role: 'user',
          content: 'A futuristic city at sunset',
        },
      ],
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.url).toBe('https://example.com/image1.png')
    expect(result.model).toBe('google/gemini-2.5-flash-image-preview')

    fetchSpy.mockRestore()
  })

  it('generates multiple images', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image1.png' },
      { url: 'https://example.com/image2.png' },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A cute robot mascot',
      numberOfImages: 2,
    })

    const [, options] = fetchSpy.mock.calls[0]!
    const payload = JSON.parse(options?.body as string)
    expect(payload.n).toBe(2)

    expect(result.images).toHaveLength(2)
    expect(result.images[0]!.url).toBe('https://example.com/image1.png')
    expect(result.images[1]!.url).toBe('https://example.com/image2.png')

    fetchSpy.mockRestore()
  })

  it('handles base64 image responses', async () => {
    const base64Data =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const mockResponse = createMockImageResponse([
      { url: `data:image/png;base64,${base64Data}` },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    const result = await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A simple test image',
    })

    expect(result.images).toHaveLength(1)
    expect(result.images[0]!.b64Json).toBe(base64Data)
    expect(result.images[0]!.url).toBe(`data:image/png;base64,${base64Data}`)

    fetchSpy.mockRestore()
  })

  it('passes aspect ratio from modelOptions', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A wide landscape',
      modelOptions: {
        aspect_ratio: '16:9',
      },
    })

    const [, options] = fetchSpy.mock.calls[0]!
    const payload = JSON.parse(options?.body as string)
    expect(payload.image_config).toMatchObject({
      aspect_ratio: '16:9',
    })

    fetchSpy.mockRestore()
  })

  it('converts size to aspect ratio', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'A square image',
      size: '1024x1024',
    })

    const [, options] = fetchSpy.mock.calls[0]!
    const payload = JSON.parse(options?.body as string)
    expect(payload.image_config).toMatchObject({
      aspect_ratio: '1:1',
    })

    fetchSpy.mockRestore()
  })

  it('throws error on HTTP error response', async () => {
    const errorResponse = new Response(
      JSON.stringify({ error: { message: 'Model not found' } }),
      { status: 404 },
    )

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(errorResponse)

    const adapter = createAdapter()

    await expect(
      adapter.generateImages({
        model: 'invalid/model',
        prompt: 'Test prompt',
      }),
    ).rejects.toThrow('Image generation failed: Model not found')

    fetchSpy.mockRestore()
  })

  it('throws error on API error in response body', async () => {
    const errorResponse = new Response(
      JSON.stringify({
        error: { message: 'Content policy violation' },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(errorResponse)

    const adapter = createAdapter()

    await expect(
      adapter.generateImages({
        model: 'google/gemini-2.5-flash-image-preview',
        prompt: 'Inappropriate content',
      }),
    ).rejects.toThrow('Image generation failed: Content policy violation')

    fetchSpy.mockRestore()
  })

  it('includes authorization header', async () => {
    const mockResponse = createMockImageResponse([
      { url: 'https://example.com/image.png' },
    ])

    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(mockResponse)

    const adapter = createAdapter()

    await adapter.generateImages({
      model: 'google/gemini-2.5-flash-image-preview',
      prompt: 'Test',
    })

    const [, options] = fetchSpy.mock.calls[0]!
    const headers = options?.headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-key')
    expect(headers['Content-Type']).toBe('application/json')

    fetchSpy.mockRestore()
  })
})
