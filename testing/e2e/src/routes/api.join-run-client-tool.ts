import { createFileRoute } from '@tanstack/react-router'
import {
  EventType,
  chat,
  chatParamsFromRequestBody,
  memoryStream,
  resumeServerSentEventsResponse,
  toolDefinition,
  toServerSentEventsResponse,
} from '@tanstack/ai'
import { z } from 'zod'
import type {
  AnyTextAdapter,
  ModelMessage,
  AdapterYieldChunk,
} from '@tanstack/ai'

/**
 * Provider-free harness for issue #1058: a `joinRun` replay that ends on a
 * client tool must drain the queued resume after replay, same as a live stream.
 *
 * The first POST emits a client-tool interrupt, then holds the producer until
 * the client disconnects (the spec reload) plus a short settle. That keeps
 * `activeRun` visible so the remount `joinRun`s the log while it is still
 * open. The client tool finishes during that hold; without the drain, the
 * continuation POST never happens and `JOIN_OK` never appears.
 *
 * Exempt from the aimock policy: a fixed AG-UI sequence, never an LLM provider.
 */

const JOIN_OK = 'JOIN_OK the lookup is 42'
const LATER_OK = 'LATER_OK the follow-up ran'
const DISCONNECT_FALLBACK_MS = 3000
const SETTLE_AFTER_DISCONNECT_MS = 1500

const lookupTool = toolDefinition({
  name: 'lookup',
  description: 'Look up',
  inputSchema: z.object({ query: z.string() }),
  outputSchema: z.object({ answer: z.number() }),
}).client()

const runningByThread = new Map<string, string>()

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitForDisconnect(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, DISCONNECT_FALLBACK_MS)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function* holdAfter(
  stream: AsyncIterable<AdapterYieldChunk>,
  signal: AbortSignal,
  onRelease: () => void,
): AsyncGenerator<AdapterYieldChunk> {
  try {
    for await (const chunk of stream) {
      yield chunk
    }
    await waitForDisconnect(signal)
    await delay(SETTLE_AFTER_DISCONNECT_MS)
  } finally {
    onRelease()
  }
}

function lastUserText(messages: Array<ModelMessage>): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== 'user') continue
    if (typeof message.content === 'string') return message.content
  }
  return ''
}

function paramsLastUserText(
  messages: Awaited<ReturnType<typeof chatParamsFromRequestBody>>['messages'],
): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i]
    if (!message || message.role !== 'user') continue
    if ('parts' in message && Array.isArray(message.parts)) {
      let text = ''
      for (const part of message.parts) {
        if (part.type === 'text') text += part.content
      }
      return text
    }
    if ('content' in message && typeof message.content === 'string') {
      return message.content
    }
  }
  return ''
}

const adapter: AnyTextAdapter = {
  kind: 'text',
  name: 'join-run-client-tool',
  model: 'join-run-client-tool',
  '~types': {
    providerOptions: {},
    inputModalities: ['text'],
    messageMetadataByModality: {},
    toolCapabilities: [],
    toolCallMetadata: undefined,
    systemPromptMetadata: undefined,
  },
  async *chatStream(options): AsyncGenerator<AdapterYieldChunk> {
    const model = 'join-run-client-tool'
    const runId = options.runId ?? 'join-run-client-tool-run'
    const threadId = options.threadId ?? 'join-run-client-tool-thread'
    const messageId = `${runId}-message`
    const hasToolResult = options.messages.some(
      (message) => message.role === 'tool',
    )
    const userText = lastUserText(options.messages)
    const reply =
      userText === 'later' ? LATER_OK : hasToolResult ? JOIN_OK : null

    yield {
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      model,
      timestamp: Date.now(),
    }

    if (reply !== null) {
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId,
        role: 'assistant',
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId,
        delta: reply,
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId,
        model,
        timestamp: Date.now(),
      }
      yield {
        type: EventType.RUN_FINISHED,
        runId,
        threadId,
        model,
        finishReason: 'stop',
        timestamp: Date.now(),
      }
      return
    }

    const toolCallId = 'join-run-lookup-1'
    yield {
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName: 'lookup',
      toolName: 'lookup',
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      delta: '{"query":"first"}',
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.TOOL_CALL_END,
      toolCallId,
      toolCallName: 'lookup',
      toolName: 'lookup',
      input: { query: 'first' },
      model,
      timestamp: Date.now(),
    }
    yield {
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      model,
      finishReason: 'tool_calls',
      timestamp: Date.now(),
    }
  },
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
}

export const Route = createFileRoute('/api/join-run-client-tool')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let params
        try {
          params = await chatParamsFromRequestBody(await request.json())
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Bad request',
            { status: 400 },
          )
        }

        const isResume = (params.resume?.length ?? 0) > 0
        const shouldHold =
          !isResume && paramsLastUserText(params.messages) !== 'later'

        if (shouldHold) {
          runningByThread.set(params.threadId, params.runId)
        } else {
          runningByThread.delete(params.threadId)
        }

        const stream = chat({
          adapter,
          messages: params.messages,
          tools: [lookupTool],
          stream: true,
          threadId: params.threadId,
          runId: params.runId,
          ...(params.parentRunId ? { parentRunId: params.parentRunId } : {}),
          ...(params.resume ? { resume: params.resume } : {}),
        })

        const body = shouldHold
          ? holdAfter(stream, request.signal, () => {
              runningByThread.delete(params.threadId)
            })
          : stream

        return toServerSentEventsResponse(body, {
          durability: { adapter: memoryStream(request) },
        })
      },

      GET: ({ request }) => {
        const durability = memoryStream(request)
        if (durability.resumeFrom() !== null) {
          return resumeServerSentEventsResponse({ adapter: durability })
        }

        const threadId = new URL(request.url).searchParams.get('threadId') ?? ''
        const runningRunId = threadId
          ? runningByThread.get(threadId)
          : undefined
        const body = runningRunId
          ? {
              messages: [],
              activeRun: { runId: runningRunId },
              interrupts: null,
            }
          : { messages: [], activeRun: null, interrupts: null }
        return new Response(JSON.stringify(body), {
          headers: {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          },
        })
      },
    },
  },
})
