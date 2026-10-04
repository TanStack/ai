import { test, expect } from './fixtures'

/**
 * Inside a Worker, `cloudflareBindingFetch` sends the requests of the real
 * Anthropic and OpenAI adapters through `env.AI.run` to the AI Gateway
 * `anthropic/…` and `openai/…` models. `/api/cloudflare-binding-wire` uses a
 * fake `env.AI` and returns what each `run` call got.
 */
test.describe('cloudflare — gateway models through the Workers AI binding', () => {
  test('Claude and GPT stream through env.AI.run', async ({ request }) => {
    const response = await request.post('/api/cloudflare-binding-wire')
    expect(response.ok()).toBe(true)
    const result = (await response.json()) as {
      ok: boolean
      error?: string
      claudeText: string
      gptText: string
      calls: Array<{
        model: string
        modelInBody: boolean
        betasInBody: boolean
        systemSent: boolean
        toolNames: Array<string>
        outputConfig?: { effort?: string }
        reasoning?: { effort?: string }
        returnRawResponse: boolean
        gateway?: { id: string }
      }>
    }
    if (!result.ok) throw new Error(`Route failed: ${result.error}`)

    expect(result.claudeText).toBe('Hi from Claude.')
    expect(result.gptText).toBe('Hi from GPT.')

    const [claude, gpt] = result.calls
    // The gateway id names the vendor. The body keeps the provider's own shape.
    expect(claude).toMatchObject({
      model: 'anthropic/claude-opus-5-5',
      modelInBody: false,
      betasInBody: false,
      systemSent: true,
      toolNames: ['lookup'],
      outputConfig: { effort: 'high' },
      returnRawResponse: true,
      gateway: { id: 'e2e-gateway' },
    })
    expect(gpt).toMatchObject({
      model: 'openai/gpt-6.1-sol',
      modelInBody: false,
      systemSent: true,
      toolNames: ['lookup'],
      reasoning: { effort: 'high' },
      returnRawResponse: true,
    })
  })
})
