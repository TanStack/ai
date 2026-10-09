import { test, expect } from './fixtures'

test('text adapters report the input modalities of their model at run time', async ({
  request,
}) => {
  const response = await request.get('/api/adapter-input-modalities')

  expect(response.ok()).toBe(true)
  await expect(response.json()).resolves.toEqual({
    openai: ['text', 'image', 'document'],
    openaiAudio: ['text', 'audio'],
    anthropic: ['text', 'image', 'document'],
    gemini: ['text', 'image', 'audio', 'video'],
  })
})
