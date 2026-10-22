import { createFileRoute } from '@tanstack/react-router'
import { chat, toolDefinition } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { openaiCompatibleText } from '@tanstack/ai-openai/compatible'
import { z } from 'zod'

const LLMOCK_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

const sse = (events: Array<unknown>) =>
  new Response(
    events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''),
    { headers: { 'content-type': 'text/event-stream' } },
  )

const call = {
  type: 'function_call',
  call_id: 'call_1',
  name: 'get_weather',
  arguments: '{"city":"Paris"}',
  status: 'completed',
}

/**
 * aimock cannot send these two Copilot stream shapes, so the adapter's
 * `fetch` answers with them: thinking on `delta.reasoning_text`, and a
 * stateless Responses tool call with a new item id on each event.
 */
const copilotStreams = {
  'reasoning-text': () => [
    {
      id: 'c-1',
      choices: [{ index: 0, delta: { reasoning_text: 'Say hi back.' } }],
    },
    { id: 'c-1', choices: [{ index: 0, delta: { content: 'Hi' } }] },
    { id: 'c-1', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] },
  ],
  'rotating-ids': (turn: number) =>
    turn === 0
      ? [
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { ...call, id: 'fc_a', arguments: '', status: 'in_progress' },
          },
          {
            type: 'response.function_call_arguments.delta',
            output_index: 0,
            item_id: 'fc_b',
            delta: '{"city":',
          },
          {
            type: 'response.function_call_arguments.delta',
            output_index: 0,
            item_id: 'fc_c',
            delta: '"Paris"}',
          },
          {
            type: 'response.function_call_arguments.done',
            output_index: 0,
            item_id: 'fc_d',
            arguments: '{"city":"Paris"}',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: { ...call, id: 'fc_e' },
          },
          {
            type: 'response.completed',
            response: {
              id: 'r-1',
              model: 'gpt-5.6',
              status: 'completed',
              output: [{ ...call, id: 'fc_f' }],
            },
          },
        ]
      : [
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_1',
            delta: 'Sunny',
          },
          {
            type: 'response.completed',
            response: {
              id: 'r-2',
              model: 'gpt-5.6',
              status: 'completed',
              output: [],
            },
          },
        ],
  // A ChatGPT plan stream: the tool call streams, then `response.completed`
  // has an empty `output`.
  'empty-completed-output': (turn: number) =>
    turn === 0
      ? [
          {
            type: 'response.output_item.added',
            output_index: 0,
            item: { ...call, id: 'fc_1', arguments: '', status: 'in_progress' },
          },
          {
            type: 'response.function_call_arguments.done',
            output_index: 0,
            item_id: 'fc_1',
            arguments: '{"city":"Paris"}',
          },
          {
            type: 'response.output_item.done',
            output_index: 0,
            item: { ...call, id: 'fc_1' },
          },
          {
            type: 'response.completed',
            response: {
              id: 'r-1',
              model: 'gpt-5.6',
              status: 'completed',
              output: [],
            },
          },
        ]
      : [
          {
            type: 'response.output_text.delta',
            output_index: 0,
            content_index: 0,
            item_id: 'msg_1',
            delta: 'Sunny',
          },
          {
            type: 'response.completed',
            response: {
              id: 'r-2',
              model: 'gpt-5.6',
              status: 'completed',
              output: [],
            },
          },
        ],
}

const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => `Sunny in ${city}`)

/**
 * Calls aimock the way a GitHub Copilot setup does: fixed headers on the
 * adapter, and an `x-initiator` header for each request through `wrapFetch`.
 * The Responses call is stateless, with encrypted reasoning. A Claude model
 * goes through the Anthropic adapter, with the Copilot token as a bearer token.
 */
export const Route = createFileRoute('/api/copilot-wire')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        await import('@/lib/llmock-server').then((m) => m.ensureLLMock())
        const body: unknown = await request.json()
        const field = (key: string) =>
          typeof body === 'object' &&
          body !== null &&
          key in body &&
          typeof Reflect.get(body, key) === 'string'
            ? String(Reflect.get(body, key))
            : undefined
        const testId = field('testId')
        const api = field('api')
        if (
          api === 'reasoning-text' ||
          api === 'rotating-ids' ||
          api === 'empty-completed-output'
        ) {
          let turn = 0
          const stream = chat({
            threadId: 'copilot-wire',
            adapter: openaiCompatibleText('gpt-5.6', {
              name: 'github-copilot',
              baseURL: 'https://api.githubcopilot.com',
              apiKey: 'copilot-token',
              fetch: async () => sse(copilotStreams[api](turn++)),
              ...(api === 'reasoning-text'
                ? {}
                : { api: 'responses' as const }),
            }),
            messages: [{ role: 'user', content: 'Weather in Paris?' }],
            tools: [getWeather],
          })
          let text = ''
          let thinking = ''
          const toolCalls: Array<{ id: string; input: unknown }> = []
          let toolCallStarts = 0
          for await (const chunk of stream) {
            if (chunk.type === 'TEXT_MESSAGE_CONTENT') text += chunk.delta
            if (chunk.type === 'REASONING_MESSAGE_CONTENT')
              thinking += chunk.delta
            if (chunk.type === 'TOOL_CALL_START') toolCallStarts++
            if (chunk.type === 'TOOL_CALL_END')
              toolCalls.push({ id: chunk.toolCallId, input: chunk.input })
          }
          return Response.json({ text, thinking, toolCallStarts, toolCalls })
        }
        if (api === 'anthropic') {
          // aimock redacts `authorization` and logs no URL query, so the
          // route keeps the raw request.
          let url = ''
          let headers: Record<string, string> = {}
          const { text } = await chat({
            threadId: 'copilot-wire',
            adapter: createAnthropicChat('claude-sonnet-5-5', 'copilot-token', {
              baseURL: LLMOCK_BASE,
              auth: 'bearer',
              ...(testId ? { defaultHeaders: { 'X-Test-Id': testId } } : {}),
            }),
            messages: [
              {
                role: 'user',
                content: '[oneshot] what is your most popular guitar',
              },
            ],
            wrapFetch: (next) => (input, init) => {
              const sent = new Headers(init?.headers)
              sent.set('User-Agent', 'e2e/1.0.0')
              sent.set('Openai-Intent', 'conversation-edits')
              sent.set('X-GitHub-Api-Version', '2026-08-01')
              sent.set('X-Interaction-Type', 'conversation-agent')
              sent.set('X-Interaction-Id', 'session-1')
              sent.set('x-initiator', 'user')
              sent.set('anthropic-beta', 'interleaved-thinking-2025-05-14')
              url = input instanceof Request ? input.url : String(input)
              headers = Object.fromEntries(sent)
              return next(input, { ...init, headers: sent })
            },
            stream: false,
          })
          return Response.json({ text, url, headers })
        }
        const responses = api === 'responses'
        // aimock logs a converted body for /v1/responses, with no `store` or
        // `include`. So the route keeps the body that the adapter sent.
        let sent: unknown
        const { text } = await chat({
          threadId: 'copilot-wire',
          adapter: openaiCompatibleText('gpt-5.6', {
            name: 'github-copilot',
            baseURL: `${LLMOCK_BASE}/v1`,
            apiKey: 'copilot-token',
            defaultHeaders: {
              'Openai-Intent': 'conversation-edits',
              'X-GitHub-Api-Version': '2026-08-01',
              ...(testId ? { 'X-Test-Id': testId } : {}),
            },
            ...(responses ? { api: 'responses' as const } : {}),
          }),
          messages: [
            {
              role: 'user',
              content: '[oneshot] what is your most popular guitar',
            },
          ],
          ...(responses
            ? {
                modelOptions: {
                  store: false,
                  include: ['reasoning.encrypted_content'],
                },
              }
            : {}),
          wrapFetch: (next) => (input, init) => {
            const headers = new Headers(init?.headers)
            headers.set('x-initiator', 'user')
            if (typeof init?.body === 'string') sent = JSON.parse(init.body)
            return next(input, { ...init, headers })
          },
          stream: false,
        })
        return Response.json({ text, sent })
      },
    },
  },
})
