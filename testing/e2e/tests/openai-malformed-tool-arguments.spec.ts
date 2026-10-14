import { expect, test } from './fixtures'

test('Chat Completions rejects malformed tool arguments and continues (finish_reason=true)', async ({
  request,
}) => {
  const response = await request.post(
    '/api/openai-malformed-tool-arguments?terminal=true',
  )
  expect(response.ok()).toBe(true)
  const result = await response.json()

  expect(result.executedInputs).toEqual([])
  expect(result.requests).toHaveLength(2)
  expect(result.requests[1].messages).toContainEqual({
    role: 'tool',
    tool_call_id: 'call-malformed',
    content: JSON.stringify({
      error: 'Failed to parse tool arguments as JSON: {"path":',
    }),
  })
  expect(result.runErrors).toEqual([])
  expect(result.text).toBe('Recovered from malformed arguments.')
})

// No finish_reason means the stream is incomplete (#1603): the run stops.
test('Chat Completions does not run a truncated tool call (finish_reason=false)', async ({
  request,
}) => {
  const response = await request.post(
    '/api/openai-malformed-tool-arguments?terminal=false',
  )
  expect(response.ok()).toBe(true)
  const result = await response.json()

  expect(result.executedInputs).toEqual([])
  expect(result.requests).toHaveLength(1)
  expect(result.runErrors).toEqual([
    'Chat Completions stream ended without a finish_reason or usage-only tail',
  ])
})
