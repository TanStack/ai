import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
} from '@tanstack/ai'
import { StreamProcessor, uiMessagesToWire } from '@tanstack/ai/client'
import { createAnthropicChat } from '@tanstack/ai-anthropic'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

type SseEvent = Record<string, unknown> & { type: string }

const messageStart: SseEvent = {
  type: 'message_start',
  message: {
    id: 'msg_redacted',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-sonnet-4-5',
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 0 },
  },
}

/** Claude sends a redacted block whole, on its start event. */
function redacted(index: number, data: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'redacted_thinking', data },
    },
    { type: 'content_block_stop', index },
  ]
}

function text(index: number, value: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'text', text: '' },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'text_delta', text: value },
    },
    { type: 'content_block_stop', index },
  ]
}

function toolUse(index: number, name: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id: 'toolu_1', name, input: {} },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: '{}' },
    },
    { type: 'content_block_stop', index },
  ]
}

function end(stopReason: string) {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 20 },
    },
    { type: 'message_stop' },
  ]
}

function sse(events: Array<SseEvent>): Response {
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

type Body = {
  messages: Array<{ role: string; content: unknown }>
}

/** Answers each call with the next scripted stream and records its body. */
function scriptedFetch(streams: Array<Array<SseEvent>>) {
  const bodies: Array<Body> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    bodies.push(JSON.parse(await req.text()))
    return sse(
      streams[bodies.length - 1] ?? [
        messageStart,
        ...text(0, 'Done.'),
        ...end('end_turn'),
      ],
    )
  }
  return { bodies, fetchImpl }
}

function blocks(body: Body | undefined, role: string) {
  const message = body?.messages.filter((m) => m.role === role).at(-1)
  return Array.isArray(message?.content)
    ? (message.content as Array<Record<string, unknown>>)
    : []
}

/**
 * Three scripted runs, answered by a capturing `fetch`:
 *
 * - `nextTurn`: a redacted block and text, then a second turn through
 *   `StreamProcessor`, `uiMessagesToWire`, and `chatParamsFromRequestBody`,
 *   as a browser client and `/api/chat` do.
 * - `sameRun`: a redacted block and a tool call. The run's second request
 *   continues after the tool.
 * - `toolError`: the tool throws. The run's second request carries the result.
 */
export const Route = createFileRoute('/api/anthropic-redacted-thinking-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const nextTurn = scriptedFetch([
            [
              messageStart,
              ...redacted(0, 'opaque-1'),
              ...text(1, 'Hello.'),
              ...end('end_turn'),
            ],
          ])
          const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
            fetch: nextTurn.fetchImpl,
          })
          const client = new StreamProcessor({})
          for (const [index, prompt] of ['Hi', 'Say it again'].entries()) {
            client.addUserMessage(prompt)
            const params = await chatParamsFromRequestBody({
              threadId: 'redacted-thinking',
              runId: `redacted-thinking-${index + 1}`,
              // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(client.getMessages())),
              ),
              tools: [],
              context: [],
            })
            for await (const chunk of chat({
              ...createChatOptions({ adapter }),
              messages: params.messages,
              stream: true,
            })) {
              client.processChunk(chunk)
            }
            client.finalizeStream()
          }

          const sameRun = scriptedFetch([
            [
              messageStart,
              ...redacted(0, 'opaque-2'),
              ...toolUse(1, 'check'),
              ...end('tool_use'),
            ],
          ])
          for await (const _ of chat({
            ...createChatOptions({
              adapter: createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
                fetch: sameRun.fetchImpl,
              }),
            }),
            messages: [{ role: 'user', content: 'Check it' }],
            tools: [
              {
                name: 'check',
                description: 'Check something.',
                execute: () => 'ok',
              },
            ],
            stream: true,
          })) {
            // consume
          }

          const toolError = scriptedFetch([
            [messageStart, ...toolUse(0, 'fail'), ...end('tool_use')],
          ])
          for await (const _ of chat({
            ...createChatOptions({
              adapter: createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
                fetch: toolError.fetchImpl,
              }),
            }),
            messages: [{ role: 'user', content: 'Try it' }],
            tools: [
              {
                name: 'fail',
                description: 'Always fails.',
                execute: () => {
                  throw new Error('Tool broke')
                },
              },
            ],
            stream: true,
          })) {
            // consume
          }

          return Response.json({
            ok: true,
            nextTurnBlocks: blocks(nextTurn.bodies[1], 'assistant'),
            sameRunBlocks: blocks(sameRun.bodies[1], 'assistant').map(
              (block) => block.type,
            ),
            toolResult: blocks(toolError.bodies[1], 'user').find(
              (block) => block.type === 'tool_result',
            ),
          })
        } catch (error) {
          return Response.json({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },
    },
  },
})
