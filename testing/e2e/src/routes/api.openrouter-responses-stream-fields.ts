import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import { createOpenRouterResponsesText } from '@tanstack/ai-openrouter'
import { HTTPClient } from '@openrouter/sdk'
import type { TokenUsage } from '@tanstack/ai'

const DUMMY_KEY = 'sk-e2e-test-dummy-key'

const searchDocs = {
  type: 'function_call',
  id: 'fc_docs',
  call_id: 'call_docs',
  name: 'search_docs',
  namespace: 'docs',
  arguments: '{}',
  status: 'completed',
}
// The SDK cannot parse this item (unknown status), so it hands over the raw
// item as `{ type: 'UNKNOWN', isUnknown: true, raw }`.
const lookup = {
  type: 'function_call',
  id: 'fc_lookup',
  call_id: 'call_lookup',
  name: 'lookup',
  arguments: '{}',
  status: 'pending_review',
}

function completed(output: Array<unknown>, cachedTokens: number) {
  return {
    type: 'response.completed',
    sequence_number: 9,
    response: {
      id: 'resp_1',
      object: 'response',
      model: 'openai/gpt-5.5',
      status: 'completed',
      created_at: 1,
      completed_at: 2,
      error: null,
      incomplete_details: null,
      frequency_penalty: null,
      presence_penalty: null,
      instructions: null,
      metadata: null,
      parallel_tool_calls: false,
      temperature: null,
      top_p: null,
      tool_choice: 'auto',
      tools: [],
      output,
      usage: {
        input_tokens: 100,
        input_tokens_details: { cached_tokens: cachedTokens },
        output_tokens: 20,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 120,
      },
    },
  }
}

const turns = [
  [
    {
      type: 'response.output_item.done',
      sequence_number: 1,
      output_index: 0,
      item: searchDocs,
    },
    {
      type: 'response.output_item.done',
      sequence_number: 2,
      output_index: 1,
      item: lookup,
    },
    completed([searchDocs, lookup], 40),
  ],
  [
    completed(
      [
        {
          type: 'message',
          id: 'msg_1',
          role: 'assistant',
          status: 'completed',
          content: [{ type: 'output_text', text: 'Done', annotations: [] }],
        },
      ],
      0,
    ),
  ],
]

/**
 * Runs two OpenRouter Responses turns through the real SDK parser. Turn 1
 * calls two server tools and reports cached input tokens. Turn 2 is the
 * replay request, which the route returns.
 */
export const Route = createFileRoute('/api/openrouter-responses-stream-fields')(
  {
    server: {
      handlers: {
        POST: async () => {
          const bodies: Array<{ input?: Array<Record<string, unknown>> }> = []
          const httpClient = new HTTPClient({
            fetcher: async (input) => {
              if (!(input instanceof Request)) throw new Error('No request')
              bodies.push(JSON.parse(await input.clone().text()))
              const events = turns[bodies.length - 1] ?? turns[1]!
              return new Response(
                events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join(''),
                { headers: { 'Content-Type': 'text/event-stream' } },
              )
            },
          })
          const adapter = createOpenRouterResponsesText(
            'openai/gpt-5.5',
            DUMMY_KEY,
            { httpClient },
          )
          const toolNames: Array<string> = []
          const usages: Array<TokenUsage> = []
          for await (const event of chat({
            threadId: 'openrouter-responses-stream-fields',
            adapter,
            messages: [{ role: 'user', content: 'Search the docs.' }],
            debug: false,
            tools: ['search_docs', 'lookup'].map((name) => ({
              name,
              description: `Run ${name}`,
              execute: () => 'ok',
            })),
            middleware: [
              {
                name: 'observe',
                onUsage: (_ctx, usage) => void usages.push(usage),
              },
            ],
          })) {
            if (event.type === 'TOOL_CALL_START')
              toolNames.push(event.toolCallName)
          }
          return Response.json({
            toolNames,
            usage: usages[0],
            replayCalls: (bodies[1]?.input ?? []).filter(
              (item) => item.type === 'function_call',
            ),
          })
        },
      },
    },
  },
)
