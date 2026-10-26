import { createFileRoute } from '@tanstack/react-router'
import { createOpenAI } from '@ai-sdk/openai'
import {
  Output,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  tool,
  validateUIMessages,
} from 'ai'
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test'
import { z } from 'zod'
import type { UIMessage, UIMessageChunk } from 'ai'

const LLMOCK_DEFAULT_BASE = process.env.LLMOCK_URL || 'http://127.0.0.1:4010'

type DoStream = MockLanguageModelV4['doStream']
type Prompt = Parameters<DoStream>[0]['prompt']
type StreamPart =
  Awaited<ReturnType<DoStream>>['stream'] extends ReadableStream<infer P>
    ? P
    : never

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 1, text: 1, reasoning: 0 },
}

function text(value: string): Array<StreamPart> {
  return [
    { type: 'text-start', id: 't' },
    { type: 'text-delta', id: 't', delta: value },
    { type: 'text-end', id: 't' },
  ]
}

function toolCall(toolName: string, input: string): Array<StreamPart> {
  return [{ type: 'tool-call', toolCallId: `${toolName}-1`, toolName, input }]
}

/** The output of the last tool result in the prompt, if the prompt ends with one. */
function lastToolOutput(prompt: Prompt) {
  const last = prompt.at(-1)
  if (last?.role !== 'tool') return undefined
  const result = last.content
    .filter((part) => part.type === 'tool-result')
    .at(-1)
  return result?.type === 'tool-result' ? result.output : undefined
}

/** A fake AI SDK model: `answer` builds each model call's stream. */
function mockModel(answer: (prompt: Prompt) => Array<StreamPart>) {
  return new MockLanguageModelV4({
    doStream: ({ prompt }) => {
      const parts = answer(prompt)
      const calls = parts.some((part) => part.type === 'tool-call')
      return Promise.resolve({
        stream: convertArrayToReadableStream<StreamPart>([
          ...parts,
          {
            type: 'finish',
            finishReason: {
              unified: calls ? 'tool-calls' : 'stop',
              raw: undefined,
            },
            usage,
          },
        ]),
      })
    },
  })
}

/** A response with these chunks. `end: 'drop'` errors the body mid-stream. */
function chunkResponse(
  chunks: Array<UIMessageChunk>,
  end: 'close' | 'drop' = 'close',
): Response {
  return createUIMessageStreamResponse({
    stream: new ReadableStream<UIMessageChunk>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        if (end === 'close') controller.close()
        else
          setTimeout(
            () => controller.error(new Error('connection dropped')),
            300,
          )
      },
    }),
  })
}

const textChunks = (value: string): Array<UIMessageChunk> => [
  { type: 'text-start', id: 't' },
  { type: 'text-delta', id: 't', delta: value },
  { type: 'text-end', id: 't' },
]

const addToCart = tool({
  description: 'Add a guitar to the cart',
  inputSchema: z.object({ guitarId: z.string(), quantity: z.number() }),
  needsApproval: true,
  execute: ({ guitarId }) => ({ added: guitarId }),
})

const explode = tool({
  description: 'A tool that always fails',
  inputSchema: z.object({}),
  execute: (): string => {
    throw new Error('Disk on fire')
  },
})

const lookup = tool({
  description: 'Look up a guitar',
  inputSchema: z.object({ guitarId: z.string() }),
  execute: ({ guitarId }) => ({ found: guitarId }),
})

// No `execute`: the client runs it, as AI SDK client tools do.
const getLocation = tool({
  description: 'The location of the user',
  inputSchema: z.object({}),
})

const guitar = z.object({ name: z.string(), price: z.number() })

/** The `[ai-sdk-...]` tag of the first user message. */
function scenarioOf(messages: Array<UIMessage>): string {
  const first = messages
    .find((m) => m.role === 'user')
    ?.parts.flatMap((p) => (p.type === 'text' ? [p.text] : []))
    .join('')
  return /^\[ai-sdk-[a-z-]+\]/.exec(first ?? '')?.[0] ?? ''
}

// An AI SDK route that TanStack `useChat` reads through `fromChatTransport`.
// The first user message picks the scenario:
// - no tag, `[ai-sdk-approval]`: `streamText` on aimock's OpenAI API.
// - `[ai-sdk-deny]`, `-tool-error`, `-bad-args`, `-reasoning`, `-structured`,
//   `-client-tool`: `streamText` on the AI SDK mock model.
// - `[ai-sdk-data]`, `-data-two`, `-error`, `-abort`, `-early-end`, `-drop`:
//   hand-written UI message chunks.
// This route has no resume `GET`, so a reconnect gets a 404.
export const Route = createFileRoute('/api/ai-sdk-server')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body: { messages: unknown } = await request.json()
        const messages = await validateUIMessages({ messages: body.messages })
        const scenario = scenarioOf(messages)

        switch (scenario) {
          case '[ai-sdk-data]':
            return createUIMessageStreamResponse({
              stream: createUIMessageStream({
                execute({ writer }) {
                  const id = 'search-1'
                  writer.write({
                    type: 'data-search',
                    id,
                    data: { status: 'running' },
                  })
                  writer.write({
                    type: 'data-search',
                    id,
                    data: { status: 'done', hits: 3 },
                  })
                  writer.write({ type: 'text-start', id: 't' })
                  writer.write({
                    type: 'text-delta',
                    id: 't',
                    delta: 'Found 3.',
                  })
                  writer.write({ type: 'text-end', id: 't' })
                },
              }),
            })
          case '[ai-sdk-data-two]':
            return chunkResponse([
              { type: 'start' },
              { type: 'data-search', id: 'x', data: { hits: 3 } },
              { type: 'data-weather', id: 'x', data: { sky: 'clear' } },
              ...textChunks('Two parts.'),
              { type: 'finish' },
            ])
          case '[ai-sdk-error]':
            return chunkResponse([
              { type: 'start' },
              ...textChunks('Partial'),
              { type: 'error', errorText: 'Upstream failed' },
            ])
          case '[ai-sdk-abort]':
            return chunkResponse([
              { type: 'start' },
              ...textChunks('Stopping here'),
              { type: 'abort' },
            ])
          case '[ai-sdk-early-end]':
            return chunkResponse([{ type: 'start' }, ...textChunks('Partial')])
          case '[ai-sdk-drop]':
            return chunkResponse(
              [{ type: 'start' }, ...textChunks('Before the drop')],
              'drop',
            )
        }

        const modelMessages = await convertToModelMessages(messages)
        const onError = (error: unknown) =>
          error instanceof Error ? error.message : String(error)

        switch (scenario) {
          case '[ai-sdk-deny]':
            return streamText({
              model: mockModel((prompt) => {
                const output = lastToolOutput(prompt)
                if (output === undefined)
                  return toolCall('addToCart', '{"guitarId":"1","quantity":1}')
                return text(
                  output.type === 'execution-denied'
                    ? 'Nothing was added.'
                    : 'Added.',
                )
              }),
              messages: modelMessages,
              tools: { addToCart },
            }).toUIMessageStreamResponse({ onError })
          case '[ai-sdk-tool-error]':
            return streamText({
              model: mockModel((prompt) =>
                lastToolOutput(prompt)
                  ? text('The tool failed.')
                  : toolCall('explode', '{}'),
              ),
              messages: modelMessages,
              tools: { explode },
              stopWhen: stepCountIs(2),
            }).toUIMessageStreamResponse({ onError })
          case '[ai-sdk-bad-args]':
            return streamText({
              model: mockModel((prompt) =>
                lastToolOutput(prompt)
                  ? text('Those arguments were broken.')
                  : toolCall('lookup', '{"guitarId":'),
              ),
              messages: modelMessages,
              tools: { lookup },
              stopWhen: stepCountIs(2),
            }).toUIMessageStreamResponse({ onError })
          case '[ai-sdk-reasoning]':
            return streamText({
              model: mockModel(() => [
                { type: 'reasoning-start', id: 'r' },
                { type: 'reasoning-delta', id: 'r', delta: 'Compare necks.' },
                { type: 'reasoning-end', id: 'r' },
                ...text('Pick the Stratocaster.'),
              ]),
              messages: modelMessages,
            }).toUIMessageStreamResponse({ onError, sendReasoning: true })
          case '[ai-sdk-structured]':
            return streamText({
              model: mockModel(() =>
                text('{"name":"Stratocaster","price":1299}'),
              ),
              messages: modelMessages,
              output: Output.object({ schema: guitar }),
            }).toUIMessageStreamResponse({ onError })
          case '[ai-sdk-client-tool]':
            // `getLocation` has no `execute`: the TanStack client runs it.
            return streamText({
              model: mockModel((prompt) => {
                const output = lastToolOutput(prompt)
                if (output === undefined) return toolCall('getLocation', '{}')
                const value = 'value' in output ? output.value : output.type
                return text(
                  `You are in ${typeof value === 'string' ? value : JSON.stringify(value)}.`,
                )
              }),
              messages: modelMessages,
              tools: { getLocation },
            }).toUIMessageStreamResponse({ onError })
        }

        const openai = createOpenAI({
          apiKey: 'sk-e2e-test-dummy-key',
          baseURL: `${LLMOCK_DEFAULT_BASE}/v1`,
        })
        return streamText({
          model: openai.chat('gpt-4o'),
          messages: modelMessages,
          tools: { addToCart },
        }).toUIMessageStreamResponse()
      },
    },
  },
})
