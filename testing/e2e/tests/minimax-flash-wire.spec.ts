import { LLMock } from '@copilotkit/aimock'
import { test, expect } from '@playwright/test'
import { chat, toolDefinition } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createLLMGatewayText } from '@tanstack/ai-llmgateway'
import { createVercelGatewayText } from '@tanstack/ai-vercel-gateway'
import { z } from 'zod'

// aimock's chat fixtures emit reasoning_content, but these gateway routes also
// require reasoning_details and reasoning. Keep their exact SSE shapes inside
// a narrow aimock mount. Each test has its own ephemeral server and tool loop.
for (const provider of ['openrouter', 'vercel', 'llmgateway'] as const) {
  test(`MiniMax Flash retains reasoning and tool history through ${provider}`, async () => {
    const bodies: Array<Record<string, any>> = []
    const model =
      provider === 'openrouter'
        ? 'minimax/minimax-m3.1-flash:free'
        : provider === 'vercel'
          ? 'minimax/minimax-m3.1-flash'
          : 'minimax-m3.1-flash'
    const details = [{ type: 'reasoning.text', text: 'Look up the value' }]
    const mock = new LLMock({ port: 0, host: '127.0.0.1', logLevel: 'silent' })
    mock.mount('/minimax-flash', {
      async handleRequest(req, res) {
        let raw = ''
        for await (const chunk of req) raw += chunk
        try {
          bodies.push(JSON.parse(raw))
        } catch {
          res.writeHead(400, { 'content-type': 'text/plain' })
          res.end('Invalid JSON')
          return true
        }
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        const emit = (delta: unknown, finish: string | null = null) =>
          res.write(
            `data: ${JSON.stringify({ id: 'generation-1', object: 'chat.completion.chunk', created: 1, model, choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`,
          )
        if (bodies.length === 1) {
          emit(
            provider === 'openrouter'
              ? { reasoning_details: details }
              : provider === 'vercel'
                ? { reasoning: 'Look up the value' }
                : { reasoning_content: 'Look up the value' },
          )
          emit({
            tool_calls: [
              {
                index: 0,
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{"key":"x"}' },
              },
            ],
          })
          emit({}, 'tool_calls')
        } else emit({ content: 'The value is 42' }, 'stop')
        res.end('data: [DONE]\n\n')
        return true
      },
    })
    await mock.start()
    try {
      const baseURL = `${mock.url}/minimax-flash/v1`
      const adapter =
        provider === 'openrouter'
          ? createOpenRouterText(
              'minimax/minimax-m3.1-flash:free',
              'test-key',
              { serverURL: baseURL },
            )
          : provider === 'vercel'
            ? createVercelGatewayText(
                'minimax/minimax-m3.1-flash',
                'test-key',
                { api: 'chat-completions', baseURL },
              )
            : createLLMGatewayText('minimax-m3.1-flash', 'test-key', {
                baseURL,
              })
      const tool = toolDefinition({
        name: 'lookup',
        description: 'Look up a value',
        inputSchema: z.object({ key: z.string() }),
      }).server(async () => ({ value: 42 }))
      const events = []
      for await (const event of chat({
        adapter,
        messages: [{ role: 'user', content: 'Look up x' }],
        tools: [tool],
        reasoning: 'max',
      }))
        events.push(event)
      expect(events.filter((event) => event.type === 'RUN_ERROR')).toEqual([])
      expect(bodies).toHaveLength(2)
      expect(
        bodies.every(
          (body) =>
            body.model === model &&
            (body.reasoning?.effort ?? body.reasoning_effort) === 'max',
        ),
      ).toBe(true)
      expect(bodies[1]!.messages).toContainEqual(
        expect.objectContaining({
          role: 'assistant',
          ...(provider === 'llmgateway'
            ? { reasoning_content: 'Look up the value' }
            : { reasoning_details: details }),
          tool_calls: [expect.objectContaining({ id: 'call_1' })],
        }),
      )
      expect(bodies[1]!.messages).toContainEqual(
        expect.objectContaining({
          role: 'tool',
          tool_call_id: 'call_1',
          content: '{"value":42}',
        }),
      )
    } finally {
      await mock.stop()
    }
  })
}
