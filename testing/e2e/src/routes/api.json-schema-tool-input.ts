import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'

// No network: `fakeText` answers from a script. The first answer calls a
// JSON Schema tool twice: once with a value that cannot be repaired, once
// with a number sent as a string. It also calls an OpenAPI 3.0 tool with
// `null` for a `nullable` field. The second answer repeats the tool results.
// MCP tools have the same raw JSON Schema input. With `{ repair: 'custom' }`,
// a `repairToolInput` function replaces the built-in repair: it maps
// `'many'` to 2 and repairs nothing else.
export const Route = createFileRoute('/api/json-schema-tool-input')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: unknown = await request.json().catch(() => ({}))
        const custom =
          typeof body === 'object' &&
          body !== null &&
          'repair' in body &&
          body.repair === 'custom'

        const fake = fakeText()
        fake.setResponses([
          {
            toolCalls: [
              { name: 'count_items', input: { count: 'many' } },
              { name: 'count_items', input: { count: '3' } },
              { name: 'label_item', input: { label: null } },
            ],
          },
          ({ request }) => ({
            text: request.messages
              .filter((message) => message.role === 'tool')
              .map((message) => `Tool said: ${String(message.content)}`)
              .join('\n'),
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
        const labelItem = toolDefinition({
          name: 'label_item',
          description: 'Label the item',
          inputSchema: {
            type: 'object',
            properties: { label: { type: 'string', nullable: true } },
            required: ['label'],
          },
        }).server((input) => {
          runs.push(input)
          return 'labeled'
        })

        const { text } = await chat({
          threadId: 'json-schema-tool-input',
          adapter: fake,
          messages: [{ role: 'user', content: 'Count the items' }],
          tools: [countItems, labelItem],
          stream: false,
          ...(custom && {
            repairToolInput: ({ input }) =>
              typeof input === 'object' &&
              input !== null &&
              'count' in input &&
              input.count === 'many'
                ? { count: 2 }
                : undefined,
          }),
        })

        return Response.json({ text, runs })
      },
    },
  },
})
