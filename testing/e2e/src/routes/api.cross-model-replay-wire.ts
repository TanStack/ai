import { createFileRoute } from '@tanstack/react-router'
import {
  chat,
  chatParamsFromRequestBody,
  createChatOptions,
} from '@tanstack/ai'
import { StreamProcessor, uiMessagesToWire } from '@tanstack/ai/client'
import { createAnthropicChat } from '@tanstack/ai-anthropic'
import { createOpenaiChatCompletions } from '@tanstack/ai-openai'
import type { StreamChunk } from '@tanstack/ai'

const ANTHROPIC_KEY = 'sk-ant-e2e-test-dummy-key'
const OPENAI_KEY = 'sk-e2e-test-dummy-key'

type SseEvent = Record<string, unknown> & { type: string }

function anthropicSse(events: Array<SseEvent>): Response {
  return new Response(
    events
      .map(
        (event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
      )
      .join(''),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

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

function end(stopReason: string): Array<SseEvent> {
  return [
    {
      type: 'message_delta',
      delta: { stop_reason: stopReason, stop_sequence: null },
      usage: { output_tokens: 10 },
    },
    { type: 'message_stop' },
  ]
}

/** Claude: signed thinking, then a call to the server tool `get_weather`. */
const toolCallTurn: Array<SseEvent> = [
  messageStart('msg_tool_call'),
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'thinking', thinking: '', signature: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'thinking_delta', thinking: 'Check the weather first.' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'signature_delta', signature: 'sig-anthropic-secret' },
  },
  { type: 'content_block_stop', index: 0 },
  {
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id: 'toolu_weather',
      name: 'get_weather',
      input: {},
    },
  },
  {
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"city":"Oslo"}' },
  },
  { type: 'content_block_stop', index: 1 },
  ...end('tool_use'),
]

/** Claude: the answer after the tool result. */
const answerTurn: Array<SseEvent> = [
  messageStart('msg_answer'),
  {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  },
  {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: 'It is sunny in Oslo.' },
  },
  { type: 'content_block_stop', index: 0 },
  ...end('end_turn'),
]

/** A one-chunk OpenAI Chat Completions stream. */
function openaiSse(): Response {
  const chunk = (delta: Record<string, unknown>, finish: string | null) =>
    `data: ${JSON.stringify({
      id: 'chatcmpl-replay',
      object: 'chat.completion.chunk',
      created: 0,
      model: 'gpt-5.5',
      choices: [{ index: 0, delta, finish_reason: finish }],
    })}\n\n`
  return new Response(
    chunk({ role: 'assistant', content: 'Still sunny.' }, null) +
      chunk({}, 'stop') +
      'data: [DONE]\n\n',
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } },
  )
}

type OpenAIMessage = {
  role: string
  content?: unknown
  tool_calls?: Array<{ id: string }>
  tool_call_id?: string
}

type TurnMessages = Awaited<
  ReturnType<typeof chatParamsFromRequestBody>
>['messages']

const weatherTool = {
  name: 'get_weather',
  description: 'Read the weather of a city.',
  execute: () => ({ forecast: 'sunny' }),
}

/**
 * One conversation that switches model. Turn 1 runs on Claude: signed
 * thinking, a server tool call, and the answer. The client keeps the turn and
 * sends it back over the wire, as a browser and `/api/chat` do. Turn 2 runs on
 * OpenAI Chat Completions. `wrapFetch` answers the OpenAI call and records its
 * body, so the route can show what the other model received.
 */
export const Route = createFileRoute('/api/cross-model-replay-wire')({
  server: {
    handlers: {
      POST: async () => {
        try {
          const anthropicStreams = [toolCallTurn, answerTurn]
          let anthropicCalls = 0
          const anthropic = createAnthropicChat(
            'claude-sonnet-4-5',
            ANTHROPIC_KEY,
            {
              fetch: async () =>
                anthropicSse(anthropicStreams[anthropicCalls++] ?? answerTurn),
            },
          )
          const openai = createOpenaiChatCompletions('gpt-5.5', OPENAI_KEY)
          const openaiBodies: Array<{ messages: Array<OpenAIMessage> }> = []

          const client = new StreamProcessor({})
          const sendTurn = async (
            prompt: string,
            runId: string,
            run: (messages: TurnMessages) => AsyncIterable<StreamChunk>,
          ) => {
            client.addUserMessage(prompt)
            const params = await chatParamsFromRequestBody({
              threadId: 'cross-model-replay',
              runId,
              // `JSON.parse(JSON.stringify(...))` stands in for the HTTP hop.
              messages: JSON.parse(
                JSON.stringify(uiMessagesToWire(client.getMessages())),
              ),
              tools: [],
              context: [],
            })
            for await (const chunk of run(params.messages)) {
              client.processChunk(chunk)
            }
            client.finalizeStream()
          }

          await sendTurn(
            'What is the weather in Oslo?',
            'cross-model-1',
            (messages) =>
              chat({
                ...createChatOptions({ adapter: anthropic }),
                messages,
                tools: [weatherTool],
                stream: true,
              }),
          )
          const claudeSources = client
            .getMessages()
            .filter((message) => message.role === 'assistant')
            .map((message) => message.metadata?.tanstack?.source)

          await sendTurn('And tomorrow?', 'cross-model-2', (messages) =>
            chat({
              ...createChatOptions({ adapter: openai }),
              messages,
              tools: [weatherTool],
              stream: true,
              wrapFetch: () => async (input, init) => {
                const request =
                  input instanceof Request ? input : new Request(input, init)
                openaiBodies.push(JSON.parse(await request.text()))
                return openaiSse()
              },
            }),
          )

          const body = openaiBodies[0]
          const messages = body?.messages ?? []
          return Response.json({
            ok: true,
            claudeSources,
            openaiCalls: openaiBodies.length,
            hasSignature: JSON.stringify(body).includes('sig-anthropic-secret'),
            hasThinkingText: JSON.stringify(body).includes(
              'Check the weather first.',
            ),
            toolCallIds: messages.flatMap((message) =>
              (message.tool_calls ?? []).map((call) => call.id),
            ),
            toolResultIds: messages.flatMap((message) =>
              message.role === 'tool' && message.tool_call_id
                ? [message.tool_call_id]
                : [],
            ),
            roles: messages.map((message) => message.role),
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
