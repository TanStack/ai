import { expect, test } from './fixtures'

type RouteResult = {
  ok: boolean
  error?: string
  requestCount: number
  firstRequestBody: { tools: Array<Record<string, any>> }
  executedInput: Record<string, unknown>
  text: string
}

test.describe('openrouter — optional tool fields', () => {
  test('chat completions sends strict: false with the schema as authored', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/openrouter-strict-tool-optionals?api=chat',
    )
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as RouteResult
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.firstRequestBody.tools[0]).toMatchObject({
      type: 'function',
      function: {
        name: 'recommend_guitar',
        strict: false,
        parameters: { required: ['guitar'] },
      },
    })
  })

  test('responses undoes provider-added nullability before the tool runs', async ({
    request,
  }) => {
    const response = await request.post(
      '/api/openrouter-strict-tool-optionals?api=responses',
    )
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as RouteResult
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.firstRequestBody.tools[0]).toMatchObject({
      name: 'recommend_guitar',
      strict: true,
      parameters: {
        required: ['guitar', 'strings'],
        properties: { strings: { type: ['object', 'null'] } },
      },
    })
    expect(result.executedInput).toEqual({ guitar: 'Martin D-28' })
    expect(result.requestCount).toBe(2)
    expect(result.text).toBe('Tool executed.')
  })
})
