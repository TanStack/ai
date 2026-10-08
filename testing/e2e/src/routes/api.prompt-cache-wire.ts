import { createFileRoute } from '@tanstack/react-router'
import { chat } from '@tanstack/ai'
import type { AnyTextAdapter, PromptCacheRetention, Tool } from '@tanstack/ai'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createOpenaiChat } from '@tanstack/ai-openai'

/**
 * Wire check for the `promptCache` option of `chat()`.
 *
 * The route runs one chat turn four times: Anthropic and OpenAI Responses,
 * each once with the default `promptCache` and once with `'none'`. Every turn
 * has a `threadId`, a system prompt, and a tool. A custom `fetch` records the
 * request body and answers with a canned stream, so no aimock fixture is
 * needed. The route returns the four request bodies for the spec to check.
 */

const THREAD_ID = 'thread-prompt-cache-wire'

const getGuitarsTool = {
  name: 'get_guitars',
  description: 'List the guitars in stock',
  inputSchema: { type: 'object', properties: {} },
} satisfies Tool

const ANTHROPIC_REPLY = [
  {
    type: 'message_start',
    message: {
      id: 'msg_prompt_cache_wire',
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-sonnet-4-6',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  },
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'ok' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 1 },
  },
  { type: 'message_stop' },
]

const OPENAI_REPLY = [
  {
    type: 'response.created',
    response: {
      id: 'resp_prompt_cache_wire',
      status: 'in_progress',
      output: [],
    },
  },
  {
    type: 'response.output_text.delta',
    item_id: 'msg_prompt_cache_wire',
    output_index: 0,
    content_index: 0,
    delta: 'ok',
  },
  {
    type: 'response.completed',
    response: {
      id: 'resp_prompt_cache_wire',
      status: 'completed',
      output: [],
      usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 },
    },
  },
]

/** Sends the events as one SSE body. Both SDKs read the `event:` line. */
function sseResponse(events: Array<{ type: string }>) {
  const body = events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
    .join('')
  return new Response(body, {
    headers: { 'Content-Type': 'text/event-stream' },
  })
}

/** Runs one chat turn to the end. No `promptCache` means the default. */
async function runTurn(
  adapter: AnyTextAdapter,
  promptCache?: PromptCacheRetention,
) {
  for await (const _ of chat({
    adapter,
    messages: [
      {
        role: 'user',
        content: '[prompt-cache-wire] which guitars are in stock?',
      },
    ],
    systemPrompts: ['You help the customers of a guitar shop.'],
    tools: [getGuitarsTool],
    threadId: THREAD_ID,
    ...(promptCache && { promptCache }),
  })) {
    // Drain the stream.
  }
}

export const Route = createFileRoute('/api/prompt-cache-wire')({
  server: {
    handlers: {
      POST: async () => {
        const bodies: Array<unknown> = []
        const fetchReplying =
          (events: Array<{ type: string }>): typeof fetch =>
          async (input, init) => {
            bodies.push(await new Request(input, init).json())
            return sseResponse(events)
          }
        const anthropic = createAnthropicChat(
          'claude-sonnet-4-6',
          'sk-ant-e2e-test-dummy-key',
          { fetch: fetchReplying(ANTHROPIC_REPLY) },
        )
        const openai = createOpenaiChat('gpt-5.2', 'sk-e2e-test-dummy-key', {
          fetch: fetchReplying(OPENAI_REPLY),
        })

        try {
          await runTurn(anthropic)
          await runTurn(anthropic, 'none')
          await runTurn(openai)
          await runTurn(openai, 'none')
        } catch (error) {
          return Response.json({
            error: error instanceof Error ? error.message : String(error),
          })
        }

        const [anthropicDefault, anthropicNone, openaiDefault, openaiNone] =
          bodies
        return Response.json({
          anthropic: { default: anthropicDefault, none: anthropicNone },
          openai: { default: openaiDefault, none: openaiNone },
        })
      },
    },
  },
})
