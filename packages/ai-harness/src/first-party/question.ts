import { toolDefinition } from '@tanstack/ai'
import { questionInterrupt } from '../boundary-waits'
import { definePlugin } from '../plugins'
import { isRecord } from '../utils'
import type { AnyChatMiddleware, ModelMessage, ToolCall } from '@tanstack/ai'

/** One question the model asks, as the tool input has it. */
interface ToolQuestion {
  question: string
  header?: string
  options: Array<{ label: string; description?: string }>
  multiple?: boolean
}

const NO_ANSWER = 'The user did not answer.'

/** The name of the tool. */
const TOOL_NAME = 'question'

function isOption(value: unknown) {
  return (
    isRecord(value) &&
    typeof value.label === 'string' &&
    (value.description === undefined || typeof value.description === 'string')
  )
}

function isToolQuestion(value: unknown): value is ToolQuestion {
  return (
    isRecord(value) &&
    typeof value.question === 'string' &&
    (value.header === undefined || typeof value.header === 'string') &&
    Array.isArray(value.options) &&
    value.options.every(isOption) &&
    (value.multiple === undefined || typeof value.multiple === 'boolean')
  )
}

/** The text the user sees: the question, the numbered options, and how to answer. */
function messageOf(item: ToolQuestion) {
  const title = item.header ? `${item.header}: ${item.question}` : item.question
  const options = item.options.map(
    (option, index) =>
      `${index + 1}. ${option.label}${option.description ? ` - ${option.description}` : ''}`,
  )
  const how =
    item.multiple === true
      ? 'Type one or more numbers or labels, split by commas, or your own answer.'
      : 'Type a number or a label, or your own answer.'
  return [title, ...options, how].join('\n')
}

/**
 * The answer shape, for hosts that render a form: one label, or a list of
 * labels. Hosts that show a text box send the typed text, and the tool reads it.
 */
function answerSchema(item: ToolQuestion) {
  const choice = {
    type: 'string',
    enum: item.options.map((option) => option.label),
  }
  return item.multiple === true
    ? { type: 'array', items: choice, minItems: 1, uniqueItems: true }
    : choice
}

/** The option `text` names, by its label (any letter case) or its number. */
function labelOf(text: string, options: ToolQuestion['options']) {
  const lower = text.toLowerCase()
  const byLabel = options.find(
    (option) => option.label.trim().toLowerCase() === lower,
  )
  if (byLabel) return byLabel.label
  return /^\d+$/.test(text) ? options[Number(text) - 1]?.label : undefined
}

/**
 * The answer line for the model: the picked labels, or the user's own
 * words. `undefined` when the reply has no text.
 */
function readAnswer(reply: unknown, item: ToolQuestion) {
  const isSplit = item.multiple === true && typeof reply === 'string'
  const parts = Array.isArray(reply)
    ? reply
    : isSplit
      ? reply.split(',')
      : [reply]
  const texts = parts
    .map((part) =>
      typeof part === 'string' || typeof part === 'number'
        ? String(part).trim()
        : '',
    )
    .filter((text) => text !== '')
  if (texts.length === 0) return undefined
  const picked = texts
    .map((text) => labelOf(text, item.options))
    .filter((label) => label !== undefined)
  const isPicked =
    picked.length === texts.length &&
    (item.multiple === true || picked.length === 1)
  if (isPicked) return `Answer: ${[...new Set(picked)].join(', ')}`
  const own = typeof reply === 'string' ? reply.trim() : texts.join(', ')
  return `Own answer: ${own}`
}

/** The questions of a `question` call, or `undefined` for input that is not valid. */
function questionsOf(args: unknown): Array<ToolQuestion> | undefined {
  const items =
    isRecord(args) && Array.isArray(args.questions) ? args.questions : []
  return items.length > 0 && items.every(isToolQuestion) ? items : undefined
}

/** The arguments of a tool call. Text that is not JSON has no questions. */
function parseArgs(text: string): unknown {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * The `question` calls of the last model message that have no result yet:
 * the calls that the tools phase runs next.
 */
function pendingQuestionCalls(messages: ReadonlyArray<ModelMessage>) {
  const index = messages.findLastIndex(
    (message) => message.role === 'assistant' && message.toolCalls?.length,
  )
  const calls: ReadonlyArray<ToolCall> = messages[index]?.toolCalls ?? []
  const done = new Set(
    messages
      .slice(index + 1)
      .flatMap((message) =>
        message.role === 'tool' && message.toolCallId
          ? [message.toolCallId]
          : [],
      ),
  )
  return calls.filter(
    (call) => call.function.name === TOOL_NAME && !done.has(call.id),
  )
}

/** The key of the wait for question `index` of the call `toolCallId`. */
const keyOf = (toolCallId: string, index: number) => `${toolCallId}:${index}`

/**
 * Add a `question` tool: the model asks the user one to four questions,
 * each with two to six options, and waits for the answers. The call is the
 * wait: the turn stops before its tools run, with one `question` wait for
 * each question, so no process waits for the user, and a user on any host
 * can answer. The answers become the result of the call. The user picks by
 * number or label, or types their own answer. With no answer (an empty
 * reply, a cancel, or a run that cannot stop, like an agent run), the model
 * gets a tool error.
 *
 * @example
 * ```ts
 * plugins: () => [question()]
 * ```
 */
export function question() {
  return definePlugin({
    name: 'tanstack/question',
    setup: () => {
      /**
       * The replies to the questions of the turn, by `keyOf`. The turn that
       * resumes gets them in `onInterruptResolution`, on any host, before
       * its tools run. A call takes its replies when it runs.
       */
      const replies = new Map<string, unknown>()
      const boundary = {
        name: 'tanstack/question',
        // Stop the turn before its tools run, with a wait for each question
        // of each `question` call that has no reply yet.
        onInterruptBoundary: (run) => {
          if (run.phase !== 'beforeTools') return undefined
          const interrupts = pendingQuestionCalls(run.messages).flatMap(
            (call) => {
              // A call with input that is not valid fails when it runs.
              const items = questionsOf(parseArgs(call.function.arguments))
              if (!items) return []
              return items.flatMap((item, index) => {
                const key = keyOf(call.id, index)
                if (replies.has(key)) return []
                return [
                  questionInterrupt.interrupt({
                    key,
                    reason: 'question',
                    message: messageOf(item),
                    payload: {
                      toolCallId: call.id,
                      index,
                      schema: answerSchema(item),
                    },
                  }),
                ]
              })
            },
          )
          return interrupts.length > 0 ? { interrupts } : undefined
        },
        onInterruptResolution: (_run, resolutions) => {
          for (const resolution of resolutions.for(questionInterrupt)) {
            // A cancelled question has no reply: the call gets no answer.
            replies.set(
              resolution.request.key,
              resolution.status === 'resolved' ? resolution.response : '',
            )
          }
        },
      } satisfies AnyChatMiddleware
      const tool = toolDefinition({
        name: TOOL_NAME,
        description:
          'Ask the user one or more questions, each with options, and wait for the answers. Use it when you need a decision or a preference from the user to continue. The user can also type their own answer.',
        inputSchema: {
          type: 'object',
          properties: {
            questions: {
              type: 'array',
              minItems: 1,
              maxItems: 4,
              items: {
                type: 'object',
                properties: {
                  question: {
                    type: 'string',
                    description: 'The full question.',
                  },
                  header: {
                    type: 'string',
                    description: 'A short label for the question.',
                  },
                  options: {
                    type: 'array',
                    minItems: 2,
                    maxItems: 6,
                    items: {
                      type: 'object',
                      properties: {
                        label: { type: 'string' },
                        description: { type: 'string' },
                      },
                      required: ['label'],
                    },
                  },
                  multiple: {
                    type: 'boolean',
                    description: 'The user can pick more than one option.',
                  },
                },
                required: ['question', 'options'],
              },
            },
          },
          required: ['questions'],
        },
        // Asking again after a crash has no side effect.
        replay: 'safe',
      }).server((args: unknown, context) => {
        const items = questionsOf(args)
        if (!items)
          throw new Error('Each question needs a question and options.')
        const toolCallId = context?.toolCallId ?? ''
        const keys = items.map((_item, index) => keyOf(toolCallId, index))
        const answers = items.map((item, index) =>
          readAnswer(replies.get(keys[index] ?? ''), item),
        )
        for (const key of keys) replies.delete(key)
        // One question with no answer gives the model no answer.
        if (answers.includes(undefined)) throw new Error(NO_ANSWER)
        return items
          .map((item, index) => `${item.question}\n${answers[index]}`)
          .join('\n\n')
      })
      // The turn registers the question waits. An agent run does not, so
      // it gets no boundary, and its question calls get no answer.
      return { tools: [tool], middleware: [boundary] }
    },
  })
}
