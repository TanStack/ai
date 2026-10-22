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

function toolUse(index: number, id: string, name: string) {
  return [
    {
      type: 'content_block_start',
      index,
      content_block: { type: 'tool_use', id, name, input: {} },
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

/** Every `tool_result` id the request sends back to Claude. */
function toolResultIds(body: { messages: Array<{ content: unknown }> }) {
  return body.messages.flatMap((message) =>
    Array.isArray(message.content)
      ? message.content
          .filter((block: { type: string }) => block.type === 'tool_result')
          .map((block: { tool_use_id: string }) => block.tool_use_id)
      : [],
  )
}

/**
 * Claude calls a server tool, then a client tool, and the run stops on the
 * client-tool interrupt. The browser takes the interrupt `MESSAGES_SNAPSHOT`,
 * which gives the stored server tool result a snapshot id, adds the client
 * tool's output, and resumes the run. `withPersistence` merges what it posts
 * with the stored transcript.
 *
 * Before the fix, the store had never seen the snapshot id, so the merge
 * appended the server tool result a second time and the resumed call sent
 * Claude a second `tool_result` for `toolu_lookup`, with no matching `tool_use`
 * in the assistant turn before it.
 *
 * `StreamProcessor` → `uiMessagesToWire` → `chatParamsFromRequestBody` →
 * `chat()`, as a browser client and `/api/chat` do, answered by a capturing
 * `fetch` (no aimock fixture).
 */
export const Route = createFileRoute('/api/client-tool-resume-store')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const claude = scriptedFetch([
            [
              messageStart('msg_call_1'),
              ...toolUse(0, 'toolu_lookup', 'lookup'),
              ...end('tool_use'),
            ],
            [
              messageStart('msg_call_2'),
              ...toolUse(0, 'toolu_ask', 'ask'),
              ...end('tool_use'),
            ],
            [
              messageStart('msg_call_3'),
              ...text(0, 'It is 42.'),
              ...end('end_turn'),
            ],
          ])
          const adapter = createAnthropicChat('claude-sonnet-4-5', DUMMY_KEY, {
            fetch: claude.fetchImpl,
          })
          const persistence = memoryPersistence()
          const tools = [
            {
              name: 'lookup',
              description: 'Look up the answer.',
              execute: () => ({ answer: 42 }),
            },
            { name: 'ask', description: 'Ask the user.' },
          ]
          const threadId = 'client-tool-resume-store'
          const runId = 'client-tool-resume-store-1'
          const client = new StreamProcessor({})
          client.addUserMessage('What is the answer?')

          const send = async (
            resume?: Array<{
              interruptId: string
              status: 'resolved'
              payload: unknown
            }>,
          ) => {
            const params = await chatParamsFromRequestBody({
              threadId,
              runId,
              // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(client.getMessages())),
              ),
              tools: [],
              context: [],
              ...(resume && { resume }),
            })
            client.prepareAssistantMessage()
            for await (const chunk of chat({
              ...createChatOptions({ adapter }),
              messages: params.messages,
              ...(params.resume && { resume: params.resume }),
              tools,
              threadId,
              runId,
              middleware: [withPersistence(persistence)],
              stream: true,
            })) {
              client.processChunk(chunk)
            }
            client.finalizeStream()
          }

          await send()
          client.addToolResult('toolu_ask', { confirmed: true })
          await send([
            {
              interruptId: 'client_tool_toolu_ask',
              status: 'resolved',
              payload: { confirmed: true },
            },
          ])

          const stored =
            (await persistence.stores.messages?.loadThread(threadId)) ?? []
          return Response.json({
            ok: true,
            resumedToolResultIds: claude.bodies[2]
              ? toolResultIds(claude.bodies[2])
              : [],
            storedToolResultIds: stored.flatMap((message) =>
              message.role === 'tool' && message.toolCallId
                ? [message.toolCallId]
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
