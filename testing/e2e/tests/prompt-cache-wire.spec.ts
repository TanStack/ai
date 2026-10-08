import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'

// The route runs each chat turn with this threadId. It is the default cache key.
const THREAD_ID = 'thread-prompt-cache-wire'
const EPHEMERAL = { type: 'ephemeral' }

interface WireResult {
  error?: string
  anthropic: { default: unknown; none: unknown }
  openai: { default: unknown; none: unknown }
}

/** Gets the request bodies that `/api/prompt-cache-wire` captured. */
async function captureWire(request: APIRequestContext) {
  const res = await request.post('/api/prompt-cache-wire')
  expect(res.ok()).toBe(true)
  const result: WireResult = await res.json()
  expect(result.error ?? null).toBeNull()
  return result
}

test.describe('prompt cache: request wire', () => {
  test('the default promptCache adds the cache fields', async ({ request }) => {
    const { anthropic, openai } = await captureWire(request)

    expect(anthropic.default).toMatchObject({
      system: [{ type: 'text', cache_control: EPHEMERAL }],
      tools: [{ name: 'get_guitars', cache_control: EPHEMERAL }],
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', cache_control: EPHEMERAL }],
        },
      ],
    })
    expect(openai.default).toMatchObject({ prompt_cache_key: THREAD_ID })
  })

  test("promptCache 'none' sends no cache field", async ({ request }) => {
    const { anthropic, openai } = await captureWire(request)

    // Both requests reached the fetch, with the tool on them.
    expect(anthropic.none).toMatchObject({ tools: [{ name: 'get_guitars' }] })
    expect(openai.none).toMatchObject({ tools: [{ name: 'get_guitars' }] })
    // Custom tools always send `cache_control: null`, so look for a set
    // marker only.
    expect(JSON.stringify(anthropic.none)).not.toContain('"cache_control":{')
    expect(JSON.stringify(openai.none)).not.toContain('prompt_cache')
  })
})
