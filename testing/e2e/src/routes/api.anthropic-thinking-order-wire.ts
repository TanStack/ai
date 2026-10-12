import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
} from '@tanstack/ai'
import { StreamProcessor, uiMessagesToWire } from '@tanstack/ai/client'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { webSearchTool } from '@tanstack/ai-anthropic/tools'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

type SseEvent = Record<string, unknown> & { type: string }

const messageStart: SseEvent = {
  type: 'message_start',
  message: {
    id: 'msg_thinking_order',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-sonnet-4-5',
    stop_reason: null,
    stop_sequence: null,
    usage: { input_tokens: 5, output_tokens: 0 },
  },
}

function thinking(index: number, text: string, signature: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'thinking_delta', thinking: text },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature },
    },
    { type: 'content_block_stop', index },
  ]
}

function webSearch(index: number) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'server_tool_use',
        id: 'srvtoolu_arenas',
        name: 'web_search',
        input: {},
      },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: '{"query":"arenas"}' },
    },
    { type: 'content_block_stop', index },
    {
      type: 'content_block_start',
      index: index + 1,
      content_block: {
        type: 'web_search_tool_result',
        tool_use_id: 'srvtoolu_arenas',
        content: [
          {
            type: 'web_search_result',
            url: 'https://example.com/arenas',
            title: 'Arenas',
            encrypted_content: 'opaque',
            page_age: null,
          },
        ],
      },
    },
    { type: 'content_block_stop', index: index + 1 },
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

function clientToolUse(
  index: number,
  id = 'toolu_pick',
  name = 'pick_arena',
  args = '{}',
) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id, name, input: {} },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'input_json_delta', partial_json: args },
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

/** thinking → web_search → result → thinking → text, as Claude streams it. */
const interleaved = [
  messageStart,
  ...thinking(0, 'Which arena is largest?', 'sig-a'),
  ...webSearch(1),
  ...thinking(3, 'Still unsure about capacity.', 'sig-b'),
  ...text(4, 'Avicii Arena is the largest.'),
]

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

/** Answers each call with the next scripted stream and records its body. */
function scriptedFetch(streams: Array<Array<SseEvent>>) {
  const bodies: Array<{
    messages: Array<{ role: string; content: unknown }>
  }> = []
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

function blockTypes(message: { content: unknown } | undefined) {
  return Array.isArray(message?.content)
    ? message.content.map((block: { type: string }) => block.type)
    : []
}

/** Each block as `type:signature` or `type:id`, to check the order. */
function blockKeys(message: { content: unknown } | undefined) {
  return Array.isArray(message?.content)
    ? message.content.map(
        (block: { type: string; signature?: string; id?: string }) =>
          `${block.type}:${block.signature ?? block.id ?? ''}`,
      )
    : []
}

/**
 * Anthropic signs every thinking block against the blocks before it. When
 * web_search runs inside the response, the next request must replay
 * `thinking, server_tool_use, web_search_tool_result, thinking, text` in that
 * order, or Claude rejects it with "thinking blocks ... cannot be modified".
 *
 * Three scripted runs, answered by a capturing `fetch` (no aimock fixture):
 *
 * - `replay` — two turns through `StreamProcessor` → `uiMessagesToWire` →
 *   `chatParamsFromRequestBody` → `chat()`, as a browser client and
 *   `/api/chat` do. Returns the block order of the second request.
 * - `interrupt` — the same turn ends with a client tool. Returns the client
 *   tool requests and the client view after the interrupt snapshot.
 * - `clientTools` — Claude answers thinking, tool_use, thinking, tool_use
 *   with two client tools. The client sends both results back over the wire.
 *   Returns the client view of the answer and the replayed blocks.
 */
export const Route = createFileRoute('/api/anthropic-thinking-order-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const replay = scriptedFetch([[...interleaved, ...end('end_turn')]])
          const replayAdapter = createAnthropicChat(
            'claude-sonnet-4-5',
            DUMMY_KEY,
            { fetch: replay.fetchImpl },
          )
          const replayClient = new StreamProcessor({})
          for (const [index, prompt] of [
            'Find the largest arena',
            'And the second largest?',
          ].entries()) {
            replayClient.addUserMessage(prompt)
            const params = await chatParamsFromRequestBody({
              threadId: 'thinking-order',
              runId: `thinking-order-${index + 1}`,
              // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(replayClient.getMessages())),
              ),
              tools: [],
              context: [],
            })
            for await (const chunk of chat({
              ...createChatOptions({ adapter: replayAdapter }),
              messages: params.messages,
              stream: true,
            })) {
              replayClient.processChunk(chunk)
            }
            replayClient.finalizeStream()
          }

          const interrupt = scriptedFetch([
            [...interleaved, ...clientToolUse(5), ...end('tool_use')],
          ])
          const interruptClient = new StreamProcessor({})
          interruptClient.addUserMessage('Find the largest arena, then pick')
          const events: Array<unknown> = []
          for await (const chunk of chat({
            ...createChatOptions({
              adapter: createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
                fetch: interrupt.fetchImpl,
              }),
            }),
            messages: interruptClient.getMessages(),
            tools: [
              webSearchTool({
                name: 'web_search',
                type: 'web_search_20250305',
              }),
              { name: 'pick_arena', description: 'Let the user pick one.' },
            ],
            stream: true,
          })) {
            events.push(chunk)
            interruptClient.processChunk(chunk)
          }
          interruptClient.finalizeStream()

          const clientTools = scriptedFetch([
            [
              messageStart,
              ...thinking(0, 'Check Stockholm first.', 'sig-c'),
              ...clientToolUse(
                1,
                'toolu_stockholm',
                'arena_size',
                '{"city":"Stockholm"}',
              ),
              ...thinking(2, 'Now check Oslo.', 'sig-d'),
              ...clientToolUse(
                3,
                'toolu_oslo',
                'arena_size',
                '{"city":"Oslo"}',
              ),
              ...end('tool_use'),
            ],
          ])
          const clientToolsAdapter = createAnthropicChat(
            'claude-sonnet-4-5',
            DUMMY_KEY,
            { fetch: clientTools.fetchImpl },
          )
          const sizeTool = {
            name: 'arena_size',
            description: 'Read the size of an arena.',
          }
          const toolClient = new StreamProcessor({})
          toolClient.addUserMessage('Compare the two arenas')
          /** One request, as a browser client and `/api/chat` send it. */
          const sendClientToolTurn = async (runId: string) => {
            const params = await chatParamsFromRequestBody({
              threadId: 'thinking-order-client-tools',
              runId,
              // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(toolClient.getMessages())),
              ),
              tools: [],
              context: [],
            })
            for await (const chunk of chat({
              ...createChatOptions({ adapter: clientToolsAdapter }),
              messages: params.messages,
              tools: [sizeTool],
              stream: true,
            })) {
              toolClient.processChunk(chunk)
            }
            toolClient.finalizeStream()
          }
          await sendClientToolTurn('thinking-order-client-tools-1')
          const clientToolView = toolClient
            .getMessages()
            .filter((message) => message.role === 'assistant')
            .map((message) => message.parts.map((part) => part.type))
          // The browser runs both tools and sends the results back.
          toolClient.addToolResult('toolu_stockholm', { seats: 16000 })
          toolClient.addToolResult('toolu_oslo', { seats: 9000 })
          await sendClientToolTurn('thinking-order-client-tools-2')

          return Response.json({
            ok: true,
            clientToolView,
            clientToolReplay: blockKeys(
              clientTools.bodies[1]?.messages.find(
                (m) => m.role === 'assistant',
              ),
            ),
            replayedBlocks: blockTypes(
              replay.bodies[1]?.messages.find((m) => m.role === 'assistant'),
            ),
            // Interrupt ids for client work are `client_tool_<toolCallId>`.
            clientToolRequests: ['toolu_pick', 'srvtoolu_arenas'].filter((id) =>
              JSON.stringify(events).includes(`client_tool_${id}`),
            ),
            viewAfterInterrupt: interruptClient
              .getMessages()
              .filter((message) => message.role === 'assistant')
              .map((message) => message.parts.map((part) => part.type)),
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
