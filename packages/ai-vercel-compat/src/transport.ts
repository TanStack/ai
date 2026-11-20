import { generateId } from 'ai'
import { chatParamsFromAISDKMessages } from './request'
import { toUIMessageStream } from './stream'
import type { ConnectConnectionAdapter } from '@tanstack/ai-client'
import type { ChatTransport, UIMessage as AISDKUIMessage } from 'ai'

/**
 * Connect AI SDK `useChat` to a TanStack `chat()` route from the browser. The
 * route needs no bridge code: it serves `chat()` with
 * `toServerSentEventsResponse`, as for TanStack `useChat`.
 *
 * Pass a TanStack connection, such as `fetchServerSentEvents('/api/chat')`.
 * The transport sends the AI SDK history as TanStack messages, and an answered
 * tool approval as a resume item for the paused run. The AG-UI events come
 * back as the AI SDK UI message stream. The AI SDK `chatId` is the TanStack
 * `threadId`. Data passed to `sendMessage` goes in the request body, and
 * headers go on the request.
 *
 * `resumeStream()` rejoins the last run of the chat with the connection's
 * `joinRun`, when the connection has one and the route keeps a durable log.
 *
 * @throws An error from `sendMessages` when an approval answer has no paused
 *   run id in the message metadata.
 */
export function toChatTransport(
  connection: ConnectConnectionAdapter,
): ChatTransport<AISDKUIMessage> {
  // ponytail: in memory, so `resumeStream()` works in this page only, not
  // after a reload. Persist the run id if a reload must rejoin.
  const lastRun = new Map<string, string>()
  const { joinRun } = connection
  return {
    resumeStreamIsReplay: joinRun !== undefined,
    async sendMessages({ chatId, messages, abortSignal, headers, body }) {
      const params = chatParamsFromAISDKMessages(chatId, messages)
      const runId = generateId()
      lastRun.set(chatId, runId)
      return toUIMessageStream(
        connection.connect(params.messages, body, abortSignal, {
          threadId: chatId,
          runId,
          ...(params.resume && { resume: params.resume }),
          ...(params.parentRunId && { parentRunId: params.parentRunId }),
          ...(headers && {
            headers:
              headers instanceof Headers
                ? Object.fromEntries(headers)
                : headers,
          }),
        }),
      )
    },
    async reconnectToStream({ chatId, abortSignal }) {
      const runId = lastRun.get(chatId)
      if (runId === undefined || joinRun === undefined) return null
      return toUIMessageStream(joinRun.call(connection, runId, abortSignal))
    },
  }
}
