import { test, expect } from './fixtures'

/**
 * `/api/openai-image-2-5-models` calls `generateImage()` on
 * `gpt-image-2.5-flare` and `gpt-image-2.5-sunburst` with size `1536x1024`
 * and quality `max`, against aimock's OpenAI images handler.
 */
test.describe('openai — gpt-image-2.5 models', () => {
  for (const model of ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']) {
    test(`${model} generates an image`, async ({ request }) => {
      const res = await request.post('/api/openai-image-2-5-models')
      expect(res.ok()).toBe(true)

      const results = (await res.json()) as Record<
        string,
        { imageCount?: number; error?: string }
      >
      expect(results[model]?.error ?? null).toBeNull()
      expect(results[model]?.imageCount).toBe(1)
    })
  }
})
