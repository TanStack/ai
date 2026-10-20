import { createServer } from 'node:http'
import { once } from 'node:events'
import { test, expect } from '@playwright/test'
import { chat, toolDefinition } from '@tanstack/ai'
import { createOpenRouterText } from '@tanstack/ai-openrouter'
import { createLLMGatewayText } from '@tanstack/ai-llmgateway'
import { VercelGatewayTextAdapter } from '../../../packages/ai-vercel-gateway/src/adapters/text'
import { z } from 'zod'
import type { AddressInfo } from 'node:net'

// Exercise chat's complete tool loop over HTTP, including reasoning emitted
// by each real SDK on the first turn. No provider credentials are needed.
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
    const server = createServer(async (req, res) => {
      let raw = ''
      for await (const chunk of req) raw += chunk
      bodies.push(JSON.parse(raw))
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
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    try {
      const baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
      const adapter =
        provider === 'openrouter'
          ? createOpenRouterText(
              'minimax/minimax-m3.1-flash:free',
              'test-key',
              { serverURL: baseURL },
            )
          : provider === 'vercel'
            ? new VercelGatewayTextAdapter(
                { apiKey: 'test-key', baseURL },
                'minimax/minimax-m3.1-flash',
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
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
}
