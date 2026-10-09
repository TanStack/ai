import { test, expect } from './fixtures'

for (const scenario of ['text', 'tool']) {
  test(`Chat Completions reports incomplete ${scenario} without accepting partial output`, async ({
    request,
  }) => {
    const response = await request.post(
      `/api/chat-completions-incomplete-stream?scenario=${scenario}`,
    )
    expect(response.ok()).toBe(true)
    const result = await response.json()
    expect(result).toMatchObject({
      text: 'partial',
      finishCount: 0,
      errorCount: 1,
      errorCode: 'incomplete-stream',
      toolCalls: 0,
    })
    expect(result.events.at(-1)).toBe('RUN_ERROR')
    expect(result.events).toContain('TEXT_MESSAGE_END')
    expect(result.events).not.toContain('RUN_FINISHED')
    if (scenario === 'tool') expect(result.events).toContain('TOOL_CALL_END')
  })
}

test('Chat Completions keeps usage after a normal finish reason', async ({
  request,
}) => {
  const response = await request.post(
    '/api/chat-completions-incomplete-stream?scenario=complete',
  )
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result).toMatchObject({
    text: 'partial',
    finishCount: 1,
    errorCount: 0,
    toolCalls: 0,
    totalTokens: 12,
  })
  expect(result.events.at(-1)).toBe('RUN_FINISHED')
  expect(result.events).not.toContain('RUN_ERROR')
})

test('Chat Completions rejects object text content instead of streaming it', async ({
  request,
}) => {
  const response = await request.post(
    '/api/chat-completions-incomplete-stream?scenario=object-content',
  )
  expect(response.ok()).toBe(true)
  const result = await response.json()
  expect(result).toMatchObject({
    text: '',
    finishCount: 0,
    errorCount: 1,
    errorMessage:
      'invalid choices[0].delta.content: expected a string, null, or an omitted field; received an object',
  })
  expect(result.events).not.toContain('TEXT_MESSAGE_CONTENT')
  expect(result.events).not.toContain('RUN_FINISHED')
})
