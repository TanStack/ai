import { expect, test } from './fixtures'

test.describe('openai strict tool optional fields', () => {
  test('undoes provider-added nullability before tool validation and execution', async ({
    request,
  }) => {
    const response = await request.post('/api/openai-strict-tool-null-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      requestCount: number
      firstRequestBody: {
        tools: Array<{
          name: string
          strict: boolean
          parameters: {
            required: Array<string>
            properties: Record<
              string,
              {
                type?: string | Array<string>
                anyOf?: Array<{ type: string }>
                enum?: Array<unknown>
              }
            >
          }
        }>
      }
      executedInput: Record<string, unknown>
      text: string
    }

    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    const tool = result.firstRequestBody.tools.find(
      ({ name }) => name === 'ask_user',
    )
    expect(tool).toMatchObject({
      strict: true,
      parameters: {
        required: ['mode', 'question', 'options', 'nullableNote'],
        properties: {
          mode: {
            type: ['string', 'null'],
            enum: ['canary', null],
          },
          options: { type: ['array', 'null'] },
          nullableNote: {
            anyOf: [{ type: 'string' }, { type: 'null' }],
          },
        },
      },
    })
    expect(result.executedInput).toEqual({
      question: 'Which option?',
      nullableNote: null,
    })
    expect(result.requestCount).toBe(2)
    expect(result.text).toBe('Tool executed.')
  })
})
