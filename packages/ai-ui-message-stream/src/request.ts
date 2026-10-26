import { isToolUIPart, validateUIMessages } from 'ai'
import { fromAISDKMessages } from './messages'
import { tanstackField } from './stream'
import type { RunAgentResumeItem, TextOptions, UIMessage } from '@tanstack/ai'
import type { UIMessage as AISDKUIMessage } from 'ai'

/**
 * What `chat()` needs from an AI SDK `useChat` request. `threadId` is the AI
 * SDK chat id. `resume` holds the user's answers to tool approvals, when there
 * are any. `parentRunId` comes with `resume`: the paused TanStack run, from the
 * last assistant message's `metadata.tanstack.runId`.
 */
export interface AISDKChatParams extends Pick<
  TextOptions,
  'threadId' | 'resume' | 'parentRunId'
> {
  messages: Array<UIMessage>
}

/**
 * Read the body that AI SDK `useChat` posts (`{ id, messages }`) as
 * `chat()` parameters: `chat({ adapter, tools, ...params })`.
 *
 * A tool part in `approval-responded` state becomes a resume item, so
 * `chat()` runs or denies the paused tool call.
 *
 * @throws An error when the body is not a chat request, a message is not a
 *   valid AI SDK `UIMessage`, or an approval answer has no paused run id.
 */
export async function chatParamsFromAISDKRequestBody(
  body: unknown,
): Promise<AISDKChatParams> {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('id' in body) ||
    typeof body.id !== 'string' ||
    !('messages' in body)
  ) {
    throw new Error('The body must have an `id` and `messages`.')
  }
  const messages = await validateUIMessages<AISDKUIMessage>({
    messages: body.messages,
  })

  const resume = messages.flatMap((message) =>
    message.parts.flatMap(
      (part): Array<RunAgentResumeItem> =>
        isToolUIPart(part) && part.state === 'approval-responded'
          ? [
              {
                interruptId: part.approval.id,
                status: 'resolved',
                payload: { approved: part.approval.approved },
              },
            ]
          : [],
    ),
  )

  const params = { threadId: body.id, messages: fromAISDKMessages(messages) }
  if (resume.length === 0) return params
  // `toUIMessageStream` puts the run id in the message metadata.
  const runId = tanstackField(
    messages.filter((m) => m.role === 'assistant').at(-1)?.metadata,
    'runId',
  )
  if (typeof runId !== 'string') {
    throw new Error(
      'An approval answer needs `metadata.tanstack.runId` on the last assistant message.',
    )
  }
  return { ...params, resume, parentRunId: runId }
}

/**
 * Read an AI SDK `useChat` request as `chat()` parameters. See
 * `chatParamsFromAISDKRequestBody`.
 *
 * @throws {Response} 400 when the body is not JSON or not a valid chat
 *   request.
 */
export async function chatParamsFromAISDKRequest(
  request: Request,
): Promise<AISDKChatParams> {
  try {
    return await chatParamsFromAISDKRequestBody(await request.json())
  } catch (cause) {
    // Keep the details on `cause` for server logs, not in the response.
    throw Object.assign(
      new Response('Invalid AI SDK chat request body.', { status: 400 }),
      { cause },
    )
  }
}
