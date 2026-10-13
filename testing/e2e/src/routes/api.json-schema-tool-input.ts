import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'

// No network: `fakeText` answers from a script. The first answer calls a
// JSON Schema tool with a wrong type, the second answer repeats the tool
// result. MCP tools have the same raw JSON Schema input.
export const Route = createFileRoute('/api/json-schema-tool-input')({
  server: {
    handlers: {
      POST: async () => {
        const fake = fakeText()
        fake.setResponses([
          { toolCalls: [{ name: 'count_items', input: { count: 'many' } }] },
          ({ request }) => ({
            text: `Tool said: ${String(request.messages.at(-1)?.content)}`,
          }),
        ])

        const runs: Array<unknown> = []
        const countItems = toolDefinition({
          name: 'count_items',
          description: 'Count the items',
          inputSchema: {
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            properties: { count: { type: 'integer' } },
            required: ['count'],
          },
        }).server((input) => {
          runs.push(input)
          return 'counted'
        })

        const { text } = await chat({
          adapter: fake,
          messages: [{ role: 'user', content: 'Count the items' }],
          tools: [countItems],
          stream: false,
        })

        return Response.json({ text, runs })
      },
    },
  },
})
