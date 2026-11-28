import { createServer } from 'node:http'
import { test, expect } from './fixtures'

/**
 * Regression for #1916. A Responses stream that hits `max_output_tokens` ends
 * with `response.incomplete`, which carries the response's usage. It must end
 * the run like a Chat Completions `length` cutoff: `RUN_FINISHED` with usage,
 * `onFinish` with `finishReason: 'length'`, and no `RUN_ERROR`.
 *
 * aimock reports a capped response as `response.completed`, so this spec
 * serves the real `response.incomplete` event from a local SSE server.
 */
const events = [
  {
    type: 'response.created',
    response: { id: 'resp_1916', model: 'gpt-4.1-nano', status: 'in_progress' },
  },
  { type: 'response.output_text.delta', delta: '1, 2, 3, 4, 5, 6, 7, 8' },
  {
    type: 'response.incomplete',
    response: {
      id: 'resp_1916',
      model: 'gpt-4.1-nano',
      status: 'incomplete',
      incomplete_details: { reason: 'max_output_tokens' },
      output: [],
      usage: {
        input_tokens: 19,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 16,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 35,
      },
    },
  },
]

test.describe('openai responses — max_output_tokens stop', () => {
  test('ends with RUN_FINISHED, usage and finishReason length', async ({
    request,
  }) => {
    const server = createServer((req, res) => {
      req.resume()
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      for (const event of events) {
        res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
      }
      res.end()
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    try {
      const address = server.address()
      if (!address || typeof address === 'string')
        throw new Error('Missing test server port')

      const res = await request.post('/api/responses-incomplete', {
        data: { baseURL: `http://127.0.0.1:${address.port}/v1` },
      })
      expect(res.ok()).toBe(true)

      const { ok, error, terminal, hooks, usage } = (await res.json()) as {
        ok: boolean
        error?: string
        terminal?: { type: string; usage?: Record<string, unknown> }
        hooks: Array<string>
        usage: Array<Record<string, unknown>>
      }

      expect(error ?? null).toBeNull()
      expect(ok).toBe(true)
      expect(terminal?.type).toBe('RUN_FINISHED')
      expect(terminal?.usage).toEqual({
        promptTokens: 19,
        completionTokens: 16,
        totalTokens: 35,
      })
      expect(hooks).toEqual(['onFinish:length'])
      expect(usage).toHaveLength(1)
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
