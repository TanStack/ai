import { expect, test } from './fixtures'

for (const withFinishReason of [true, false]) {
  test(`Chat Completions rejects malformed tool arguments and continues (finish_reason=${withFinishReason})`, async ({
    request,
  }) => {
    const response = await request.post(
      `/api/openai-malformed-tool-arguments?terminal=${withFinishReason}`,
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
}
