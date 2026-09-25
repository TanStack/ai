import { test, expect } from './fixtures'

/**
 * Issue #1426: a structured-output response cut off at the output cap used to
 * fail with a JSON parse error (or "no content"), which reads like a schema
 * problem. It must say the token limit was reached.
 */
test.describe('structured output — finish_reason=length', () => {
  test('reports truncation instead of a parse error', async ({ request }) => {
    const response = await request.post('/api/structured-output-length-wire')
    expect(response.ok()).toBe(true)
    const { errors } = (await response.json()) as {
      errors: Record<string, string | null>
    }

    expect(Object.keys(errors).sort()).toEqual([
      'compatible-empty',
      'compatible-truncated',
      'openrouter-empty',
      'openrouter-truncated',
    ])
    for (const [label, message] of Object.entries(errors)) {
      expect(message, label).toContain(
        'cut off because the maximum token limit was reached',
      )
    }
  })
})
