import { isToolUIPart, validateUIMessages } from 'ai'
import { fromAISDKMessages } from './messages'
import { tanstackField } from './stream'
import type { RunAgentResumeItem, UIMessage } from '@tanstack/ai'
import type { UIMessage as AISDKUIMessage } from 'ai'

/** What `chat()` needs from an AI SDK `useChat` request. */
export interface AISDKChatParams {
  /** The AI SDK chat id. */
  threadId: string
  messages: Array<UIMessage>
  /** The user's answers to tool approvals, when there are any. */
  resume?: Array<RunAgentResumeItem>
  /**
   * Set with `resume`: the paused TanStack run, from the last assistant
   * message's `metadata.tanstack.runId`, else the chat id.
   */
  parentRunId?: string
}

/**
 * Read the body that AI SDK `useChat` posts (`{ id, messages }`) as
 * `chat()` parameters: `chat({ adapter, tools, ...params })`.
 *
 * A tool part in `approval-responded` state becomes a resume item, so
 * `chat()` runs or denies the paused tool call.
 *
 * @throws An error when the body is not a chat request or a message is not
 *   a valid AI SDK `UIMessage`.
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

  // `toUIMessageStream` puts the run id in the message metadata.
  const runId = tanstackField(
    messages.filter((m) => m.role === 'assistant').at(-1)?.metadata,
    'runId',
  )
  return {
    threadId: body.id,
    messages: fromAISDKMessages(messages),
    ...(resume.length > 0 && {
      resume,
      parentRunId: typeof runId === 'string' ? runId : body.id,
    }),
  }
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
