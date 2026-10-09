import { test, expect } from './fixtures'

/**
 * Wire-format check for `chat({ reasoning: { level: 'medium' } })`.
 *
 * `/api/reasoning-wire` records the raw OpenAI and Anthropic request bodies
 * with `wrapFetch`, because aimock's journal normalizes them. For Gemini, the
 * `/reasoning-wire-gemini` mount answers only when the thinking config is
 * right, so the answer text is the proof.
 */
type WireResponse = {
  ok: boolean
  error?: string
  text?: string
  bodies: Array<Record<string, unknown>>
}

async function run(
  request: import('@playwright/test').APIRequestContext,
  provider: string,
  testId: string,
): Promise<WireResponse> {
  const res = await request.post(
    `/api/reasoning-wire?provider=${provider}&testId=${encodeURIComponent(testId)}`,
  )
  expect(res.ok()).toBe(true)
  const payload = (await res.json()) as WireResponse
  expect(payload.error).toBeUndefined()
  expect(payload.ok).toBe(true)
  return payload
}

test.describe('chat({ reasoning }) — wire format', () => {
  test('openai sends reasoning.effort with a summary', async ({
    request,
    testId,
  }) => {
    const { bodies } = await run(request, 'openai', testId)
    expect(bodies[0]?.['model']).toBe('o3')
    expect(bodies[0]?.['reasoning']).toEqual({
      effort: 'medium',
      summary: 'auto',
    })
  })

  test('anthropic sends budget thinking for a budget model', async ({
    request,
    testId,
  }) => {
    const { bodies } = await run(request, 'anthropic', testId)
    expect(bodies[0]?.['model']).toBe('claude-sonnet-4-5')
    expect(bodies[0]?.['thinking']).toEqual({
      type: 'enabled',
      budget_tokens: 8192,
    })
    expect(bodies[0]?.['max_tokens']).toBeGreaterThan(8192)
  })

  test('gemini sends a thinking budget with includeThoughts', async ({
    request,
    testId,
  }) => {
    const { text } = await run(request, 'gemini', testId)
    expect(text).toBe('Thinking config accepted')
  })
})
