import { chat } from '@tanstack/ai'
import { sumUsage } from './usage-count'
import type {
  AnyTextAdapter,
  ChatMiddleware,
  ModelMessage,
  TokenUsage,
} from '@tanstack/ai'

/** What a summary callback gets with the messages. */
export interface SummarizeInput {
  /** The text of an earlier compaction summary at the start of `messages`. */
  previousSummary?: string
  /** The details text of that summary, from its `<compaction-details>` tag. */
  previousDetails?: string
  /** `true`: `messages` is the first part of a turn that is too large to keep. */
  turnPrefix?: boolean
  /**
   * The first part of the current turn. Only the call that writes the details
   * gets it, so `details` can see each dropped message. In a history call, a
   * separate call summarizes these messages. In a turn-prefix call, they are
   * the same as `messages`, and no history call runs.
   */
  turnPrefixMessages?: Array<ModelMessage>
  /** Aborted when the run is cancelled. */
  signal?: AbortSignal
}

/**
 * Turns messages into summary text. Return the text, or the text and the
 * usage of the model call, so the compaction can report the cost.
 */
export type Summarizer = (
  messages: Array<ModelMessage>,
  input: SummarizeInput,
) => Promise<string | { summary: string; usage?: TokenUsage }>

const SUMMARY_OPEN = '<untrusted-conversation-summary>'
const SUMMARY_CLOSE = '</untrusted-conversation-summary>'
const DETAILS_OPEN = '<compaction-details>'
const DETAILS_CLOSE = '</compaction-details>'

/** The content of a summary message. */
export const summaryContent = (summary: string) =>
  `${SUMMARY_OPEN}\n${summary}\n${SUMMARY_CLOSE}`

/** A summary text with its details in a `<compaction-details>` tag after it. */
export const summaryBody = (summary: string, details?: string) =>
  [summary, details ? `${DETAILS_OPEN}\n${details}\n${DETAILS_CLOSE}` : '']
    .filter((part) => part !== '')
    .join('\n\n')

/** The summary text and the details text of a summary body. */
export function splitDetails(body: string): {
  summary: string
  details?: string
} {
  const start = body.indexOf(DETAILS_OPEN)
  const end = body.indexOf(DETAILS_CLOSE, start)
  if (start < 0 || end < 0) return { summary: body }
  return {
    summary:
      `${body.slice(0, start)}${body.slice(end + DETAILS_CLOSE.length)}`.trim(),
    details: body.slice(start + DETAILS_OPEN.length, end).trim(),
  }
}

/**
 * The summary text and the details text of an earlier summary message.
 * `undefined` when `message` is not a summary message.
 */
export function readSummary(
  message: ModelMessage | undefined,
): { summary: string; details?: string } | undefined {
  const content = message?.content
  if (typeof content !== 'string' || !content.startsWith(SUMMARY_OPEN)) {
    return undefined
  }
  const close = content.lastIndexOf(SUMMARY_CLOSE)
  return splitDetails(
    content.slice(SUMMARY_OPEN.length, close < 0 ? undefined : close).trim(),
  )
}

const SECTIONS = `## Goal
What the user wants to get done. Keep the user's exact words for each requirement.

## Constraints
The rules, limits, and preferences that the user or the work set.

## Progress
What is done, what is in progress, and what failed. Give the file paths, the commands, and the results.

## Key decisions
Each decision, and the reason for it.

## Next steps
The next actions, in order.

## Critical context
The facts that the assistant must not lose: names, values, error messages, and open questions.`

const CHECKPOINT_PROMPT = `You write a checkpoint summary of a conversation between a user and an AI assistant. The assistant continues the work from this summary. It does not see the old messages again.

Write these sections, in this order. Write "None." in a section that has nothing.

${SECTIONS}

Be short and exact. Use only facts from the conversation. Do not answer the user. Write only the summary.`

const UPDATE_PROMPT = `You update a checkpoint summary of a conversation between a user and an AI assistant. The earlier summary is in <previous-summary>. The messages that came after it are in <conversation>. The assistant continues the work from your summary. It does not see the old messages again.

Merge the new messages into the earlier summary. Keep each fact of the earlier summary that is still true. Change each fact that the new messages changed. Move the finished items from "Next steps" to "Progress".

Write these sections, in this order. Write "None." in a section that has nothing.

${SECTIONS}

Be short and exact. Use only facts from the earlier summary and the conversation. Do not answer the user. Write only the summary.`

const TURN_PREFIX_PROMPT = `You summarize the first part of the current turn of a conversation between a user and an AI assistant. The last part of the turn stays in the context. The assistant needs your summary to finish the turn.

Write a short summary of:
- what the user asked in this turn,
- what the assistant did in this turn so far: the tool calls and their results,
- the facts that the rest of the turn needs.

Be short and exact. Use only facts from the conversation. Write only the summary.`

function contentText(content: ModelMessage['content']): string {
  if (typeof content === 'string') return content
  return (content ?? [])
    .map((part) => (part.type === 'text' ? part.content : `[${part.type}]`))
    .join('\n')
}

/** The messages as plain text. Each tool result is cut to `maxToolResultChars`. */
function messagesText(
  messages: ReadonlyArray<ModelMessage>,
  maxToolResultChars: number,
) {
  return messages
    .map((message) => {
      const text = contentText(message.content)
      if (message.role === 'tool') {
        const extra = text.length - maxToolResultChars
        return `[Tool result]: ${extra > 0 ? `${text.slice(0, maxToolResultChars)} [${extra} more characters cut]` : text}`
      }
      const calls = (message.toolCalls ?? []).map(
        (call) =>
          `[Tool call ${call.function.name}]: ${call.function.arguments}`,
      )
      const role = message.role === 'user' ? 'User' : 'Assistant'
      return [`[${role}]: ${text}`, ...calls].join('\n')
    })
    .join('\n\n')
}

/**
 * A {@link Summarizer} that asks a text model for a checkpoint summary with
 * these sections: goal, constraints, progress, key decisions, next steps, and
 * critical context. With an earlier summary it merges the new messages into
 * it. It returns the usage of its model call.
 *
 * @example
 * ```ts
 * summarizeOldest({ summarize: conversationSummarizer({ adapter }) })
 * ```
 */
export function conversationSummarizer(options: {
  adapter: AnyTextAdapter
  modelOptions?: Record<string, unknown>
  /** Each tool result is cut to this many characters in the text to summarize. Default 2000. */
  maxToolResultChars?: number
  /**
   * Text added after the summary, and passed to the next compaction as
   * previousDetails. It gets each dropped message, also the first part of a
   * split turn.
   */
  details?: (input: {
    messages: Array<ModelMessage>
    previousDetails?: string
  }) => string | undefined
}): Summarizer {
  const maxChars = options.maxToolResultChars ?? 2000
  return async (messages, input) => {
    const isUpdate = input.previousSummary !== undefined && !input.turnPrefix
    // The earlier summary goes in <previous-summary>, not in the conversation.
    const fresh =
      isUpdate && readSummary(messages[0]) ? messages.slice(1) : messages
    const conversation = `<conversation>\n${messagesText(fresh, maxChars)}\n</conversation>`
    const prompt = input.turnPrefix
      ? TURN_PREFIX_PROMPT
      : isUpdate
        ? UPDATE_PROMPT
        : CHECKPOINT_PROMPT
    // An object, so the hook below can write it and TypeScript reads it.
    const spent: { usage?: TokenUsage } = {}
    const countUsage: ChatMiddleware = {
      name: 'compaction:summary-usage',
      onUsage: (_ctx, usage) => {
        spent.usage = sumUsage(spent.usage, usage)
      },
    }
    // An aborted run must not give an empty summary, so it throws instead.
    const throwIfAborted = () => {
      if (!input.signal?.aborted) return
      const reason: unknown = input.signal.reason
      throw reason instanceof Error
        ? reason
        : new Error('The summary was aborted.')
    }
    throwIfAborted()
    // chat() takes an AbortController, so this one follows the run's signal.
    const controller = new AbortController()
    const stop = () => controller.abort(input.signal?.reason)
    input.signal?.addEventListener('abort', stop, { once: true })
    let text: string
    try {
      const result = await chat({
        adapter: options.adapter,
        messages: [
          {
            role: 'user',
            content: isUpdate
              ? `<previous-summary>\n${input.previousSummary}\n</previous-summary>\n\n${conversation}`
              : conversation,
          },
        ],
        systemPrompts: [prompt],
        modelOptions: options.modelOptions,
        middleware: [countUsage],
        abortController: controller,
        stream: false,
      })
      text = result.text
    } finally {
      input.signal?.removeEventListener('abort', stop)
    }
    // chat() can return an empty text when the run is aborted.
    throwIfAborted()
    // The details cover each dropped message. A turn-prefix call writes them
    // only when it gets turnPrefixMessages: then no history call runs.
    const covered = input.turnPrefix
      ? input.turnPrefixMessages
      : [...fresh, ...(input.turnPrefixMessages ?? [])]
    const details =
      covered &&
      options.details?.({
        messages: covered,
        ...(input.previousDetails !== undefined
          ? { previousDetails: input.previousDetails }
          : {}),
      })
    const summary = summaryBody(text.trim(), details)
    return spent.usage ? { summary, usage: spent.usage } : { summary }
  }
}
