import { test, expect } from './fixtures'

for (const scenario of ['replay-parity', 'replay-parity-cleanup']) {
  test(`${scenario}: real adapters replay a saved harness turn`, async ({
    request,
    testId,
    aimockPort,
  }) => {
    const response = await request.post('/api/harness-test', {
      data: { scenario, testId, aimockPort },
    })
    expect(response.ok()).toBe(true)
    const body = await response.json()
    expect(body.texts).toEqual([
      'First replay answer.',
      'Second replay answer.',
    ])
    expect(body.executions).toBe(1)
    expect(body.immutable).toBe(true)
    expect(body.requests).toHaveLength(
      scenario === 'replay-parity-cleanup' ? 4 : 3,
    )
    expect(body.requests[0].path).toBe('/v1/messages')
    expect(body.requests.at(-1).path).toBe('/v1/responses')
    expect(body.requests.at(-1).body.model).toBe('gpt-5.5')
    const assistant = body.saved.find(
      (message: { toolCalls?: ReadonlyArray<unknown> }) =>
        message.toolCalls?.length,
    )
    expect(assistant.metadata.tanstack.source).toEqual({
      provider: 'anthropic',
      api: 'anthropic-messages',
      model: 'claude-sonnet-4-5',
    })
    expect(assistant.metadata.tanstack.responseId).toEqual(expect.any(String))
    expect(assistant.metadata.tanstack.responseId).not.toBe('')
    expect(assistant.thinking).toEqual([
      { content: '', signature: 'AAH/', redacted: true },
      {
        content: 'I will look up the guitar.',
        signature: 'opaque-first-signature',
      },
    ])
    const nativeAssistant = body.requests[1].body.messages.find(
      (message: { role: string; content: ReadonlyArray<{ type: string }> }) =>
        message.role === 'assistant' &&
        message.content.some((part) => part.type === 'tool_use'),
    )
    expect(nativeAssistant.content).toEqual([
      { type: 'redacted_thinking', data: 'AAH/' },
      {
        type: 'thinking',
        thinking: 'I will look up the guitar.',
        signature: 'opaque-first-signature',
      },
      {
        type: 'tool_use',
        id: 'foreign-call:with/slash',
        name: 'lookup_replay',
        input: { query: 'guitar' },
      },
    ])
    const wire = body.requests.at(-1).body.input
    const call = wire.find(
      (message: { type?: string }) => message.type === 'function_call',
    )
    const result = wire.find(
      (message: { type?: string }) => message.type === 'function_call_output',
    )
    expect(call.call_id).toBe(result.call_id)
    expect(call.call_id).not.toBe('foreign-call:with/slash')
    expect({ name: call.name, arguments: call.arguments }).toEqual({
      name: 'lookup_replay',
      arguments: '{"query":"guitar"}',
    })
    expect(result.output).toBe('Found a guitar.')
    expect(JSON.stringify(wire)).not.toContain('thinking_signature')
    expect(JSON.stringify(wire)).not.toContain('opaque-first-signature')
    expect(JSON.stringify(wire)).not.toContain('AAH/')
    expect(JSON.stringify(wire)).toContain('I will look up the guitar.')
    if (scenario === 'replay-parity-cleanup') {
      expect(JSON.stringify(wire)).not.toContain('Failed replay text')
      expect(JSON.stringify(wire)).not.toContain('orphan-result')
      expect(body.requests.at(-1).body.instructions).toBe(
        'Replay system prompt.',
      )
      expect(
        body.saved.some(
          (message: { role: string }) => message.role === 'system',
        ),
      ).toBe(false)
      expect(
        body.saved.find(
          (message: { content?: unknown }) =>
            message.content === 'Failed replay text',
        ),
      ).toMatchObject({ metadata: { tanstack: { stopReason: 'error' } } })
      expect(
        body.saved.find(
          (message: { toolCallId?: string }) =>
            message.toolCallId === 'orphan-result',
        ),
      ).toMatchObject({ role: 'tool', content: 'orphan-result' })
      expect(
        body.saved.some((message: { error?: string }) =>
          message.error?.includes('provider failed'),
        ),
      ).toBe(true)
    }
  })
}
