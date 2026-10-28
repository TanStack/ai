import { describe, expect, it, vi } from 'vitest'
import { createVercelGatewayImage } from '../src/adapters/image'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'

const testLogger = resolveDebugOption(false)

describe('Vercel Gateway image adapter', () => {
  it('calls images.generate with model, prompt, n, size, and gateway options', async () => {
    const adapter = createVercelGatewayImage('openai/gpt-image-1', 'k')
    const generate = vi.fn().mockResolvedValue({
      data: [{ b64_json: 'abc' }],
    })
    ;(adapter as any).client = {
      images: { generate },
    }

    const result = await adapter.generateImages({
      model: 'openai/gpt-image-1',
      prompt: 'a red guitar',
      numberOfImages: 1,
      size: '1024x1024',
      logger: testLogger,
      modelOptions: { gateway: { only: ['openai'] } },
    })

    expect(result.images[0]?.b64Json).toBe('abc')
    const body = generate.mock.calls[0]![0] as Record<string, unknown>
    expect(body.model).toBe('openai/gpt-image-1')
    expect(body.prompt).toBe('a red guitar')
    expect(body.n).toBe(1)
    expect(body.size).toBe('1024x1024')
    expect(body.providerOptions).toEqual({ gateway: { only: ['openai'] } })
    expect(body).not.toHaveProperty('gateway')
  })
})
