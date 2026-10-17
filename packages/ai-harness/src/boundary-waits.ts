import { defineInterrupt } from '@tanstack/ai'
import { standardJsonSchema } from './json-schema'
import { isRecord } from './utils'

/** The id of the interrupt that asks the user to approve one tool call. */
export const APPROVAL_INTERRUPT_ID = 'tanstack/harness:approval'

/** The answer to an approval: once, always, or reject with a message. */
export interface ApprovalAnswer {
  answer: 'once' | 'always' | 'reject'
  /** With `reject`: what the model should do instead. */
  message?: string
}

/** The answer shape of an approval, for hosts that render a form. */
export const APPROVAL_ANSWER_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    answer: {
      type: 'string',
      enum: ['once', 'always', 'reject'],
      description:
        'once: allow this call. always: allow it from now on in this project. reject: refuse it.',
    },
    message: {
      type: 'string',
      description: 'With reject: what the model should do instead.',
    },
  },
  required: ['answer'],
}

/**
 * @internal The interrupt that a turn stops with, before its tools run, for
 * each tool call that needs the user's approval (see `permissions()`). Its
 * `key` is the tool call id. Every chat call of a turn registers it.
 */
export const approvalInterrupt = defineInterrupt({
  id: APPROVAL_INTERRUPT_ID,
  payloadSchema: standardJsonSchema<{ toolCallId: string; tool: string }>({
    type: 'object',
    properties: {
      toolCallId: { type: 'string' },
      tool: { type: 'string' },
    },
    required: ['toolCallId', 'tool'],
  }),
  responseSchema: standardJsonSchema<ApprovalAnswer>(APPROVAL_ANSWER_SCHEMA),
})

/** The id of the interrupt that asks one question of the `question` tool. */
export const QUESTION_INTERRUPT_ID = 'tanstack/harness:question'

/**
 * @internal The interrupt that a turn stops with, before its tools run, for
 * each question of a `question` tool call. Its `key` is
 * `${toolCallId}:${index}`. The payload has the answer shape of the
 * question, for hosts that render a form. The answer is one label, a list
 * of labels, or the user's own text, so the tool call gets it as its result.
 */
export const questionInterrupt = defineInterrupt({
  id: QUESTION_INTERRUPT_ID,
  payloadSchema: standardJsonSchema<{
    toolCallId: string
    index: number
    schema: Record<string, unknown>
  }>({
    type: 'object',
    properties: {
      toolCallId: { type: 'string' },
      index: { type: 'integer' },
      schema: { type: 'object' },
    },
    required: ['toolCallId', 'index', 'schema'],
  }),
  responseSchema: standardJsonSchema({
    anyOf: [
      { type: 'string' },
      { type: 'number' },
      { type: 'array', items: { type: ['string', 'number'] } },
    ],
  }),
})

/** The interrupts that every chat call of a turn registers. */
export const BOUNDARY_INTERRUPTS = [approvalInterrupt, questionInterrupt]

/**
 * The user's reply to an approval: `{ answer, message? }`, or the answer as
 * text. Anything that is not `once` or `always` rejects.
 */
export function readApproval(value: unknown): {
  choice: ApprovalAnswer['answer']
  message: string | undefined
} {
  const raw = isRecord(value) ? value.answer : value
  const choice = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  const text =
    isRecord(value) && typeof value.message === 'string'
      ? value.message.trim()
      : ''
  return {
    choice: choice === 'once' || choice === 'always' ? choice : 'reject',
    message: text === '' ? undefined : text,
  }
}
