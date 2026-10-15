import { test, expect } from './fixtures'

/**
 * An OpenAI Responses answer item keeps its `id` and `phase` through the
 * client and the wire. The same model gets them back. Another model gets
 * plain text. `/api/responses-answer-items-wire` returns the assistant items
 * of each request.
 */
test.describe('OpenAI Responses answer items on replay', () => {
  test('sends id and phase to the same model and plain text to another model', async ({
    request,
  }) => {
    const response = await request.post('/api/responses-answer-items-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      calls: number
      sameModel: Array<Record<string, unknown>>
      otherModel: Array<Record<string, unknown>>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.calls).toBe(3)
    expect(result.sameModel).toEqual([
      {
        type: 'message',
        role: 'assistant',
        id: 'msg_answer_1',
        status: 'completed',
        phase: 'final_answer',
        content: [{ type: 'output_text', text: 'Hi there', annotations: [] }],
      },
    ])
    expect(result.otherModel).toEqual([
      { type: 'message', role: 'assistant', content: 'Hi there' },
    ])
  })
})
