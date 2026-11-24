import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { sandboxedChatTool } from '@tanstack/ai-mcp-sandbox'
import { createQuickJSIsolateDriver } from '@tanstack/ai-isolate-quickjs'
import { z } from 'zod'
import type { Limits } from '@tanstack/ai-mcp-sandbox'

// No network: `fakeText` calls three sandboxed tools, then repeats each tool
// result. `lookup` runs; `spin` loops until the wall clock stops it; `leaky`
// calls a facade that throws an error with host internals in its message.
const limits: Limits = {
  wallClockMs: 300,
  memoryMb: 32,
  maxInjectedCalls: 3,
  resultBytes: 4096,
}
const driver = createQuickJSIsolateDriver()

export const Route = createFileRoute('/api/sandboxed-chat-tool')({
  server: {
    handlers: {
      POST: async () => {
        const fake = fakeText()
        fake.setResponses([
          {
            toolCalls: [
              { name: 'lookup', input: { sku: 'SKU-1' } },
              { name: 'spin', input: {} },
              { name: 'leaky', input: {} },
            ],
          },
          ({ request }) => ({
            text: request.messages
              .filter((message) => message.role === 'tool')
              .map((message) => `Tool said: ${String(message.content)}`)
              .join('\n'),
          }),
        ])

        const lookup = sandboxedChatTool({
          name: 'lookup',
          description: 'Look up a SKU',
          inputSchema: z.object({ sku: z.string() }),
          snippet: `const row = await host.db.get({ sku: input.sku }); return { qty: row.qty }`,
          facades: { 'db.get': { execute: async () => ({ qty: 7 }) } },
          driver,
          limits,
        })
        const spin = sandboxedChatTool({
          name: 'spin',
          description: 'Loops forever',
          inputSchema: z.object({}),
          snippet: `while (true) {}`,
          facades: {},
          driver,
          limits,
        })
        const leaky = sandboxedChatTool({
          name: 'leaky',
          description: 'Calls a failing facade',
          inputSchema: z.object({}),
          snippet: `return await host.db.get({})`,
          facades: {
            'db.get': {
              execute: async () => {
                throw new Error('ECONNREFUSED db.internal:5432')
              },
            },
          },
          driver,
          limits,
        })

        const { text } = await chat({
          threadId: 'sandboxed-chat-tool',
          adapter: fake,
          messages: [{ role: 'user', content: 'Run the tools' }],
          tools: [lookup, spin, leaky],
          stream: false,
        })

        return Response.json({ text })
      },
    },
  },
})
