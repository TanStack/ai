import { createFileRoute } from '@tanstack/react-router'
import { EventType, chat, toolDefinition } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import {
  chatParamsFromAISDKRequest,
  toUIMessageStream,
} from '@tanstack/ai-ui-message-stream'
import { createUIMessageStreamResponse } from 'ai'
import { z } from 'zod'
import type { StreamChunk } from '@tanstack/ai'
import type { FakeResponse, FakeResponseStep } from '@tanstack/ai/testing'

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Get the weather for a city',
  inputSchema: z.object({ city: z.string() }),
}).server(({ city }) => `sunny in ${city}`)

const deleteFile = toolDefinition({
  name: 'deleteFile',
  description: 'Delete a file',
  inputSchema: z.object({ path: z.string() }),
  needsApproval: true,
}).server(({ path }) => `deleted ${path}`)

const explode = toolDefinition({
  name: 'explode',
  description: 'A server tool that always fails',
  inputSchema: z.object({}),
}).server(() => {
  throw new Error('Disk on fire')
})

// No `.server()`: the AI SDK page runs it in `onToolCall`.
const getLocation = toolDefinition({
  name: 'getLocation',
  description: 'The location of the user',
  inputSchema: z.object({}),
})

const SLOW_REPLY =
  'One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten. Eleven. Twelve. Thirteen. Fourteen. Fifteen.'

/** The first model call of each scenario, picked by the user message. */
function firstAnswer(prompt: string): FakeResponse {
  if (prompt.startsWith('Delete'))
    return { toolCalls: [{ name: 'deleteFile', input: { path: 'a.txt' } }] }
  if (prompt.startsWith('[error]')) return { error: 'The model is down' }
  if (prompt.startsWith('[tool-throws]'))
    return { toolCalls: [{ name: 'explode', input: {} }] }
  if (prompt.startsWith('[client-tool]'))
    return { toolCalls: [{ name: 'getLocation', input: {} }] }
  if (prompt.startsWith('[reasoning]'))
    return { thinking: 'Look at the map first.', text: 'Oslo is in Norway.' }
  if (prompt.startsWith('[slow]')) return { text: SLOW_REPLY }
  if (prompt.startsWith('[crash]')) return { text: 'Starting the answer' }
  return { toolCalls: [{ name: 'getWeather', input: { city: 'Oslo' } }] }
}

/** A run whose tool call arguments are not valid JSON. */
function brokenArgsRun(threadId: string): Array<StreamChunk> {
  const timestamp = Date.now()
  const runId = 'bad-args-run'
  return [
    { type: EventType.RUN_STARTED, threadId, runId, timestamp },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'bad-1',
      toolCallName: 'getWeather',
      timestamp,
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'bad-1',
      delta: '{"city":',
      timestamp,
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'bad-1', timestamp },
    {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      finishReason: 'tool_calls',
      timestamp,
    },
  ]
}

/** A run with an activity that updates in place, then text. */
function activityRun(threadId: string): Array<StreamChunk> {
  const timestamp = Date.now()
  const runId = 'activity-run'
  return [
    { type: EventType.RUN_STARTED, threadId, runId, timestamp },
    {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: 'search-1',
      activityType: 'search',
      content: { status: 'running' },
      timestamp,
    },
    {
      type: EventType.ACTIVITY_DELTA,
      messageId: 'search-1',
      activityType: 'search',
      patch: [
        { op: 'replace', path: '/status', value: 'done' },
        { op: 'add', path: '/hits', value: 3 },
      ],
      timestamp,
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'activity-text',
      role: 'assistant',
      timestamp,
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'activity-text',
      delta: 'Found 3.',
      timestamp,
    },
    { type: EventType.TEXT_MESSAGE_END, messageId: 'activity-text', timestamp },
    {
      type: EventType.RUN_FINISHED,
      threadId,
      runId,
      finishReason: 'stop',
      timestamp,
    },
  ]
}

/** Throws in the middle of the reply, as a crashing route does. */
async function* crashAfterFirstText(
  stream: AsyncIterable<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  for await (const event of stream) {
    yield event
    if (event.type === EventType.TEXT_MESSAGE_CONTENT)
      throw new Error('The route crashed mid-reply')
  }
}

async function* fromArray(
  events: Array<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  yield* events
}

// A TanStack `chat()` route that AI SDK `useChat` reads. No network: the first
// user message picks a scripted scenario (see `firstAnswer`). After a tool
// result, the fake answers "Tool said: <result>". An approval answer or a
// client tool output comes back as a second request that continues the run.
export const Route = createFileRoute('/api/ai-sdk-client')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const params = await chatParamsFromAISDKRequest(request)
        const prompt =
          params.messages
            .find((m) => m.role === 'user')
            ?.parts.flatMap((p) => (p.type === 'text' ? [p.content] : []))
            .join('') ?? ''

        if (prompt.startsWith('[bad-args]'))
          return createUIMessageStreamResponse({
            stream: toUIMessageStream(
              fromArray(brokenArgsRun(params.threadId)),
            ),
          })
        if (prompt.startsWith('[activity]'))
          return createUIMessageStreamResponse({
            stream: toUIMessageStream(fromArray(activityRun(params.threadId))),
          })

        // A fake per request: each model call reads the request.
        const fake = fakeText(
          prompt.startsWith('[slow]') ? { tokensPerSecond: 6 } : {},
        )
        const step: FakeResponseStep = ({ request: model }) => {
          const last = model.messages.at(-1)
          return last?.role === 'tool'
            ? { text: `Tool said: ${String(last.content)}` }
            : firstAnswer(prompt)
        }
        fake.setResponses([step, step, step])

        const stream = chat({
          adapter: fake,
          tools: [getWeather, deleteFile, explode, getLocation],
          ...params,
        })
        return createUIMessageStreamResponse({
          stream: toUIMessageStream(
            prompt.startsWith('[crash]') ? crashAfterFirstText(stream) : stream,
          ),
        })
      },
    },
  },
})
