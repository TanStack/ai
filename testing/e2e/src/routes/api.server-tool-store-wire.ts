import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
} from '@tanstack/ai'
import { StreamProcessor, uiMessagesToWire } from '@tanstack/ai/client'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { memoryPersistence, withPersistence } from '@tanstack/ai-persistence'

const DUMMY_KEY = 'sk-ant-e2e-test-dummy-key'

type SseEvent = Record<string, unknown> & { type: string }

function messageStart(id: string): SseEvent {
  return {
    type: 'message_start',
    message: {
      id,
      type: 'message',
      role: 'assistant',
      content: [],
      model: 'claude-sonnet-4-5',
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 5, output_tokens: 0 },
    },
  }
}

function thinking(index: number, value: string, signature: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'thinking', thinking: '', signature: '' },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'thinking_delta', thinking: value },
    },
    {
      type: 'content_block_delta',
      index,
      delta: { type: 'signature_delta', signature },
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

function lookupToolUse(index: number) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: {
        type: 'tool_use',
        id: 'toolu_lookup',
        name: 'lookup',
        input: {},
      },
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

/** Answers each call with the next scripted stream and records its body. */
function scriptedFetch(streams: Array<Array<SseEvent>>) {
  const bodies: Array<{
    messages: Array<{ role: string; content: unknown }>
  }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init)
    bodies.push(JSON.parse(await req.text()))
    return sse(streams[bodies.length - 1] ?? [])
  }
  return { bodies, fetchImpl }
}

/** Every `tool_use` id the request sends back to Claude. */
function toolUseIds(body: { messages: Array<{ content: unknown }> }) {
  return body.messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content
          .filter((block: { type: string }) => block.type === 'tool_use')
          .map((block: { id: string }) => block.id)
      : [],
  )
}

/**
 * Claude thinks, then calls a server tool with no text first. The engine runs
 * the tool, and Claude thinks again and answers. The browser keeps that answer
 * and sends it back on the next turn, and `withPersistence` merges it with the
 * stored transcript.
 *
 * Before the fix, the client renamed the first call's message to the second
 * call's id, so the merge stored the tool call twice and turn 2 sent Claude a
 * second `tool_use` with no `tool_result` after it.
 *
 * Two turns through `StreamProcessor` → `uiMessagesToWire` →
 * `chatParamsFromRequestBody` → `chat()`, as a browser client and `/api/chat`
 * do, answered by a capturing `fetch` (no aimock fixture).
 */
export const Route = createFileRoute('/api/server-tool-store-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const claude = scriptedFetch([
            [
              messageStart('msg_call_1'),
              ...thinking(0, 'Look it up first.', 'sig-a'),
              ...lookupToolUse(1),
              ...end('tool_use'),
            ],
            [
              messageStart('msg_call_2'),
              ...thinking(0, 'Now answer.', 'sig-b'),
              ...text(1, 'It is 42.'),
              ...end('end_turn'),
            ],
            [
              messageStart('msg_call_3'),
              ...text(0, 'Still 42.'),
              ...end('end_turn'),
            ],
          ])
          const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
            fetch: claude.fetchImpl,
          })
          const persistence = memoryPersistence()
          const lookup = {
            name: 'lookup',
            description: 'Look up the answer.',
            execute: () => ({ answer: 42 }),
          }
          const client = new StreamProcessor({})
          for (const [index, prompt] of [
            'What is the answer?',
            'Check again?',
          ].entries()) {
            client.addUserMessage(prompt)
            const runId = `server-tool-store-${index + 1}`
            const params = await chatParamsFromRequestBody({
              threadId: 'server-tool-store',
              runId,
              // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(client.getMessages())),
              ),
              tools: [],
              context: [],
            })
            client.prepareAssistantMessage()
            for await (const chunk of chat({
              ...createChatOptions({ adapter }),
              messages: params.messages,
              tools: [lookup],
              threadId: 'server-tool-store',
              runId,
              middleware: [withPersistence(persistence)],
              stream: true,
            })) {
              client.processChunk(chunk)
            }
            client.finalizeStream()
          }

          const stored =
            (await persistence.stores.messages?.loadThread(
              'server-tool-store',
            )) ?? []
          return Response.json({
            ok: true,
            turn2ToolUseIds: claude.bodies[2]
              ? toolUseIds(claude.bodies[2])
              : [],
            storedToolCallIds: stored.flatMap((message) =>
              'toolCalls' in message && Array.isArray(message.toolCalls)
                ? message.toolCalls.map((call) => call.id)
                : [],
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
