import { modelMessagesToUIMessages } from '@tanstack/ai'
import type { ModelMessage, UIMessage } from '@tanstack/ai'
import { createReconnectTracker } from '@tanstack/ai-client'
import type {
  ConnectConnectionAdapter,
  ReconnectOptions,
} from '@tanstack/ai-client'
import { APICallError } from 'ai'
import type {
  ChatTransport,
  UIMessage as AISDKUIMessage,
  UIMessageChunk,
} from 'ai'
import { toAISDKMessages } from './messages'
import { fromUIMessageStream } from './stream'
import type { FromUIMessageStreamOptions } from './stream'

export { fromAISDKMessages, toAISDKMessages } from './messages'
export type { AISDKApprovalFields, AISDKToolCallMetadata } from './messages'
export { fromUIMessageStream, toUIMessageStream } from './stream'
export type { FromUIMessageStreamOptions } from './stream'
export {
  resumeUIMessageStreamResponse,
  toResumableUIMessageStreamResponse,
} from './resume'
export {
  chatParamsFromAISDKRequest,
  chatParamsFromAISDKRequestBody,
} from './request'
export type { AISDKChatParams } from './request'
export { clientToolsFromAISDKBody } from './client-tools'
export type { SubagentData } from './data-parts'

function asUIMessages(
  messages: Array<UIMessage> | Array<ModelMessage>,
): Array<UIMessage> {
  const list: ReadonlyArray<UIMessage | ModelMessage> = messages
  const ui = list.filter((m): m is UIMessage => 'parts' in m)
  if (ui.length === list.length) return ui
  return modelMessagesToUIMessages(
    list.filter((m): m is ModelMessage => !('parts' in m)),
  )
}

type ReconnectRequest = Parameters<
  ChatTransport<AISDKUIMessage>['reconnectToStream']
>[0]

/** The chunks that end an AI SDK UI message stream. */
const TERMINAL_CHUNKS = new Set<UIMessageChunk['type']>([
  'finish',
  'error',
  'abort',
])

/**
 * Read `stream`, and when the connection drops, read the rest through
 * `transport.reconnectToStream`, with the backoff and limits of the TanStack
 * HTTP connections. A replayed prefix is skipped.
 *
 * A stream that ends before its `finish` chunk also reconnects, as the
 * TanStack durable connections do. When the route has nothing to resume (a
 * 204, or a 4xx such as a route with no resume `GET`), that stream ends there
 * and a dropped one fails with its own error.
 */
function reconnecting(
  transport: ChatTransport<AISDKUIMessage>,
  stream: ReadableStream<UIMessageChunk>,
  request: ReconnectRequest,
  reconnect: ReconnectOptions | undefined,
): ReadableStream<UIMessageChunk> {
  const tracker = createReconnectTracker(reconnect)
  let reader = stream.getReader()
  let delivered = 0
  let skip = 0
  let deliveredAtLastDrop = 0
  let terminated = false
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        // undefined: the stream ended cleanly before its terminal chunk.
        let failure: unknown
        try {
          const { done, value } = await reader.read()
          if (!done) {
            // ponytail: skips by count, so the replay must repeat the chunks
            // in the same order, as the AI SDK resumable streams do.
            if (skip > 0) {
              skip--
              continue
            }
            delivered++
            if (TERMINAL_CHUNKS.has(value.type)) terminated = true
            return controller.enqueue(value)
          }
          if (terminated) return controller.close()
        } catch (error) {
          failure = error
        }
        // Nothing can resume it: close a clean end, rethrow a failure.
        const giveUp = () => {
          if (failure === undefined) return controller.close()
          throw failure
        }
        if (request.abortSignal?.aborted) return giveUp()
        // Throws StreamReconnectLimitError when the run is stuck.
        await tracker.waitBeforeReconnect(
          delivered > deliveredAtLastDrop,
          request.abortSignal,
        )
        deliveredAtLastDrop = delivered
        let resumed: ReadableStream<UIMessageChunk> | null
        try {
          resumed = await transport.reconnectToStream(request)
        } catch (error) {
          // A 4xx: the route cannot resume this chat.
          if (APICallError.isInstance(error) && !error.isRetryable)
            return giveUp()
          // The old reader ends or fails again, so the next pass retries.
          continue
        }
        if (!resumed) return giveUp()
        reader = resumed.getReader()
        skip = transport.resumeStreamIsReplay === true ? delivered : 0
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
}

/** Options for {@link fromChatTransport}. */
export interface FromChatTransportOptions extends Pick<
  FromUIMessageStreamOptions,
  'tools' | 'outputSchema'
> {
  /**
   * The chat id, to rejoin a run after a page reload. The adapter has
   * `joinRun` only when this is set and the transport replays the stream
   * from its start (`resumeStreamIsReplay`).
   */
  threadId?: string
  /** Backoff and limits for reconnects after a dropped stream. */
  reconnect?: ReconnectOptions
}

/**
 * Connect the TanStack chat client to an AI SDK route through an AI SDK
 * `ChatTransport`, such as `new DefaultChatTransport({ api: '/api/chat' })`.
 *
 * The transport sends the history as AI SDK `UIMessage`s and reads the UI
 * message stream. The chat `threadId` is the AI SDK `chatId`. Data passed to
 * `sendMessage` goes in the request body, and per-run headers go on the
 * request.
 *
 * When the stream drops, the adapter reconnects with
 * `transport.reconnectToStream` and continues the run, with the same backoff
 * as the TanStack HTTP connections (`reconnect` sets it). Set `threadId` to also
 * rejoin a run after a page reload (`joinRun`), with a chat `persistence`
 * adapter on the client. For that, the transport must replay the stream from
 * its start (`resumeStreamIsReplay`, true for `DefaultChatTransport`).
 *
 * Pass the same `tools` as `useChat({ tools })`, so a tool approval is a
 * `tool-approval` interrupt that `resolveInterrupt(true)` answers.
 *
 * Pass the same `outputSchema` as `useChat({ outputSchema })` when the route
 * uses `Output.object({ schema })`, so the answer is a typed
 * `structured-output` part.
 *
 * The client's tools (JSON Schema) go in the body as `clientTools`. Read them
 * on the route with `clientToolsFromAISDKBody`, so the route needs no copy.
 */
export function fromChatTransport(
  transport: ChatTransport<AISDKUIMessage>,
  { threadId, tools, outputSchema, reconnect }: FromChatTransportOptions = {},
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const { clientTools } = runContext
      const body = clientTools?.length ? { ...data, clientTools } : data
      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: runContext.threadId,
        messageId: undefined,
        messages: toAISDKMessages(asUIMessages(messages)),
        abortSignal,
        ...(runContext.headers && { headers: runContext.headers }),
        ...(body && { body }),
      })
      yield* fromUIMessageStream(
        reconnecting(
          transport,
          stream,
          {
            chatId: runContext.threadId,
            abortSignal,
            ...(runContext.headers && { headers: runContext.headers }),
          },
          reconnect,
        ),
        { ...runContext, tools, outputSchema },
      )
    },
    // A rejoin gets only the run id, and the AI SDK reconnects by chat id.
    ...(threadId !== undefined &&
      transport.resumeStreamIsReplay === true && {
        async *joinRun(runId: string, abortSignal?: AbortSignal) {
          const options = { chatId: threadId, abortSignal }
          const stream = await transport.reconnectToStream(options)
          // Thrown before the first event, so the client drops its resume pointer.
          if (!stream) throw new Error(`No active stream for chat ${threadId}`)
          yield* fromUIMessageStream(
            reconnecting(transport, stream, options, reconnect),
            {
              threadId,
              runId,
              tools,
              outputSchema,
            },
          )
        },
      }),
  }
}
