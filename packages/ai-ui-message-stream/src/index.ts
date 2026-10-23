import { modelMessagesToUIMessages } from '@tanstack/ai'
import type { ModelMessage, UIMessage } from '@tanstack/ai'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'
import type {
  ChatTransport,
  UIMessage as AISDKUIMessage,
  UIMessageChunk,
} from 'ai'
import { toAISDKMessages } from './messages'
import { fromUIMessageStream } from './stream'
import type { FromUIMessageStreamOptions } from './stream'

export { fromAISDKMessages, toAISDKMessages } from './messages'
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

type ReconnectOptions = Parameters<
  ChatTransport<AISDKUIMessage>['reconnectToStream']
>[0]

/**
 * Read `stream`, and when the connection drops, read the rest through
 * `transport.reconnectToStream`. A replayed prefix is skipped.
 */
function reconnecting(
  transport: ChatTransport<AISDKUIMessage>,
  stream: ReadableStream<UIMessageChunk>,
  options: ReconnectOptions,
): ReadableStream<UIMessageChunk> {
  let reader = stream.getReader()
  let delivered = 0
  let skip = 0
  // ponytail: a reconnect that delivers nothing new ends the stream with the
  // error. Add attempts and backoff if one retry without progress is too few.
  let deliveredAtReconnect: number | undefined
  return new ReadableStream({
    async pull(controller) {
      for (;;) {
        try {
          const { done, value } = await reader.read()
          if (done) return controller.close()
          // ponytail: skips by count, so the replay must repeat the chunks in
          // the same order, as the AI SDK resumable streams do.
          if (skip > 0) {
            skip--
            continue
          }
          delivered++
          return controller.enqueue(value)
        } catch (error) {
          if (options.abortSignal?.aborted) throw error
          if (deliveredAtReconnect === delivered) throw error
          deliveredAtReconnect = delivered
          const resumed = await transport.reconnectToStream(options)
          if (!resumed) throw error
          reader = resumed.getReader()
          skip = transport.resumeStreamIsReplay === true ? delivered : 0
        }
      }
    },
    cancel: (reason) => reader.cancel(reason),
  })
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
 * `transport.reconnectToStream` and continues the run. Set `threadId` to also
 * rejoin a run after a page reload (`joinRun`), with a chat `persistence`
 * adapter on the client. For that, the transport must replay the stream from
 * its start (`resumeStreamIsReplay`, true for `DefaultChatTransport`).
 *
 * Pass the same `tools` as `useChat({ tools })`, so a tool approval is a
 * `tool-approval` interrupt that `resolveInterrupt(true)` answers.
 */
export function fromChatTransport(
  transport: ChatTransport<AISDKUIMessage>,
  {
    threadId,
    tools,
  }: Pick<FromUIMessageStreamOptions, 'tools'> & { threadId?: string } = {},
): ConnectConnectionAdapter {
  return {
    async *connect(messages, data, abortSignal, runContext) {
      const stream = await transport.sendMessages({
        trigger: 'submit-message',
        chatId: runContext.threadId,
        messageId: undefined,
        messages: toAISDKMessages(asUIMessages(messages)),
        abortSignal,
        ...(runContext.headers && { headers: runContext.headers }),
        ...(data && { body: data }),
      })
      yield* fromUIMessageStream(
        reconnecting(transport, stream, {
          chatId: runContext.threadId,
          abortSignal,
          ...(runContext.headers && { headers: runContext.headers }),
        }),
        { ...runContext, tools },
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
          yield* fromUIMessageStream(reconnecting(transport, stream, options), {
            threadId,
            runId,
            tools,
          })
        },
      }),
  }
}
