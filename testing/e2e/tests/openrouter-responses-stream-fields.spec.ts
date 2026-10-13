import { test, expect } from './fixtures'

/**
 * OpenRouter Responses through the real SDK parser:
 * - a function call item that the SDK cannot parse still runs its tool,
 * - cached input tokens reach the usage,
 * - the function call namespace goes back on the replay request.
 */
test('openrouter-responses keeps stream fields through the SDK parser', async ({
  request,
}) => {
  const response = await request.post('/api/openrouter-responses-stream-fields')
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result.toolNames).toEqual(
    expect.arrayContaining(['search_docs', 'lookup']),
  )
  expect(result.usage).toMatchObject({
    promptTokens: 100,
    promptTokensDetails: { cachedTokens: 40 },
  })
  expect(result.replayCalls).toContainEqual(
    expect.objectContaining({ name: 'search_docs', namespace: 'docs' }),
  )
})
