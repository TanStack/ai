import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

/**
 * A tool result with text and an image goes back to the model. Chat
 * Completions tool messages carry text only, so the image goes in a user
 * message after the tool results. OpenRouter Responses keeps the image in the
 * function call output. Before the fix, the image was a JSON string in the
 * tool text (OpenAI) or was dropped (OpenRouter).
 */
const image = 'data:image/png;base64,AAAA'

async function wireBody(request: APIRequestContext, api: string) {
  const response = await request.post(`/api/tool-result-images-wire?api=${api}`)
  expect(response.ok()).toBe(true)
  return ((await response.json()) as { body: Record<string, unknown> }).body
}

for (const api of ['openai-chat', 'openrouter-chat']) {
  test(`${api} sends tool-result images in a user message`, async ({
    request,
  }) => {
    const body = await wireBody(request, api)
    expect(body.messages).toMatchObject([
      { role: 'user', content: 'Take a screenshot.' },
      { role: 'assistant' },
      { role: 'tool', content: 'Layout screenshot' },
      {
        role: 'user',
        content: [{ type: 'image_url', image_url: { url: image } }],
      },
    ])
  })
}

test('openrouter-responses keeps tool-result images in the output', async ({
  request,
}) => {
  const body = await wireBody(request, 'openrouter-responses')
  expect(body.input).toContainEqual(
    expect.objectContaining({
      type: 'function_call_output',
      output: [
        { type: 'input_text', text: 'Layout screenshot' },
        { type: 'input_image', image_url: image, detail: 'auto' },
      ],
    }),
  )
})
