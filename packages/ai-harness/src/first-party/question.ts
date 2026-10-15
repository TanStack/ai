import { toolDefinition } from '@tanstack/ai'
import { definePlugin } from '../plugins'
import { isRecord } from '../utils'

/** One question the model asks, as the tool input has it. */
interface ToolQuestion {
  question: string
  header?: string
  options: Array<{ label: string; description?: string }>
  multiple?: boolean
}

const NO_ANSWER = 'The user did not answer.'

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

/**
 * Add a `question` tool: the model asks the user one to four questions,
 * each with two to six options, and waits for the answers. Each question
 * goes to the user through `ctx.session.ask`, one at a time. The user picks
 * by number or label, or types their own answer. With no answer, or when
 * the session closes, the model gets a tool error.
 *
 * @example
 * ```ts
 * plugins: () => [question()]
 * ```
 */
export function question() {
  return definePlugin({
    name: 'tanstack/question',
    setup: (ctx) => ({
      tools: [
        toolDefinition({
          name: 'question',
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
        }).server(async (args: unknown) => {
          const items =
            isRecord(args) && Array.isArray(args.questions)
              ? args.questions
              : []
          if (!items.every(isToolQuestion))
            throw new Error('Each question needs a question and options.')
          const answers: Array<string> = []
          for (const item of items) {
            // A closed session rejects the question: that is no answer too.
            const reply = await ctx.session
              .ask({ message: messageOf(item), schema: answerSchema(item) })
              .catch(() => undefined)
            const answer = readAnswer(reply, item)
            if (answer === undefined) throw new Error(NO_ANSWER)
            answers.push(`${item.question}\n${answer}`)
          }
          return answers.join('\n\n')
        }),
      ],
    }),
  })
}
