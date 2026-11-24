import { defineInterrupt, validateJsonSchema } from '@tanstack/ai'
import { isRecord } from './utils'
import type {
  AnyChatMiddleware,
  ModelMessage,
  StandardJSONSchemaV1,
  StandardSchemaV1,
} from '@tanstack/ai'
import type { PluginSetupContext } from './plugins'

/**
 * A plain JSON Schema as a Standard Schema with a JSON Schema export, so a
 * core interrupt can name it as a schema. `validateJsonSchema` checks values.
 */
function standardJsonSchema(
  json: Record<string, unknown>,
): StandardSchemaV1 & StandardJSONSchemaV1 {
  return {
    '~standard': {
      version: 1,
      vendor: 'tanstack-harness',
      validate: (value) => validateJsonSchema(json, value),
      jsonSchema: { input: () => json, output: () => json },
    },
  }
}

/** The id of the interrupt that asks the user to approve one tool call. */
export const APPROVAL_INTERRUPT_ID = 'tanstack/harness:approval'

/** The answer to an approval: once, always, or reject with a message. */
export interface ApprovalAnswer {
  answer: 'once' | 'always' | 'reject'
  /** With `reject`: what the model should do instead. */
  message?: string
}

/**
 * The answer shape of an approval, for hosts that render a form. A yes or
 * no (`true` or `false`) works too, as for every approval, so a client
 * answers each approval the same way. So does the core resolution
 * `{ approved, payload? }` that a session view sends.
 */
export const APPROVAL_ANSWER_SCHEMA: Record<string, unknown> = {
  anyOf: [
    {
      type: 'boolean',
      description: 'true: allow this call. false: refuse it.',
    },
    { type: 'string', enum: ['once', 'always', 'reject'] },
    {
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
    },
    {
      type: 'object',
      properties: {
        approved: {
          type: 'boolean',
          description: 'true: allow this call. false: refuse it.',
        },
        payload: {
          description:
            'With true: once or always. With false: what the model should do instead.',
        },
      },
      required: ['approved'],
    },
  ],
}

/**
 * @internal The interrupt that a turn stops with, before its tools run, for
 * each tool call that needs the user's approval (see `permissions()`). Its
 * `key` is the tool call id. Every chat call of a turn registers it.
 */
export const approvalInterrupt = defineInterrupt({
  id: APPROVAL_INTERRUPT_ID,
  payloadSchema: standardJsonSchema({
    type: 'object',
    properties: {
      toolCallId: { type: 'string' },
      tool: { type: 'string' },
    },
    required: ['toolCallId', 'tool'],
  }),
  responseSchema: standardJsonSchema(APPROVAL_ANSWER_SCHEMA),
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
  payloadSchema: standardJsonSchema({
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

const BOUNDARY_IDS = new Set<string>(
  BOUNDARY_INTERRUPTS.map((definition) => definition.id),
)

/**
 * `middleware` that does not stop the run for an approval or a question.
 * For a tool-mode child of a turn with `durability.agentToolWaits: false`:
 * it does not ask, and a call that needs an approval is refused. Other
 * interrupts stay.
 */
export function withoutBoundaryWaits(
  middleware: ReadonlyArray<AnyChatMiddleware>,
): Array<AnyChatMiddleware> {
  return middleware.map((entry) => {
    const boundary = entry.onInterruptBoundary
    if (!boundary) return entry
    return {
      ...entry,
      onInterruptBoundary: async (ctx) => {
        const result = await boundary(ctx)
        const interrupts = result?.interrupts.filter(
          (request) => !BOUNDARY_IDS.has(request.definition.id),
        )
        return interrupts?.length ? { interrupts } : undefined
      },
    } satisfies AnyChatMiddleware
  })
}

/** The reject message for an approval that comes with edited arguments. */
const EDITED_ARGS_REJECTED =
  'The user changed the arguments of this call, and this approval cannot run a changed call, so the call did not run. Ask the user what to do.'

/** The answer that `value` names, as text or in `answer`, when it names one. */
function answerOf(value: unknown) {
  const raw = isRecord(value) ? value.answer : value
  const answer = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return answer === 'once' || answer === 'always' || answer === 'reject'
    ? answer
    : undefined
}

/**
 * The user's reply to an approval: `{ answer, message? }`, the answer as
 * text, or a yes or no (`true` is `once`). Anything that is not `once` or
 * `always` rejects. A session view sends the core resolution
 * `{ approved, payload? }`: a yes is the answer that its payload names, or
 * `once`. A no rejects, with the payload as its message: text, or the
 * `message` of an object.
 */
export function readApproval(value: unknown): {
  choice: ApprovalAnswer['answer']
  message: string | undefined
} {
  if (value === true) return { choice: 'once', message: undefined }
  if (isRecord(value) && typeof value.approved === 'boolean') {
    const { approved, payload } = value
    if (!approved) {
      const message = isRecord(payload) ? payload.message : payload
      return readApproval({ answer: 'reject', message })
    }
    // This approval cannot apply edited arguments, and the arguments of the
    // model are not what the user approved. So the call does not run.
    if (value.editedArgs !== undefined) {
      return { choice: 'reject', message: EDITED_ARGS_REJECTED }
    }
    if (answerOf(payload) === undefined) {
      return { choice: 'once', message: undefined }
    }
    return readApproval(payload)
  }
  const choice = answerOf(value)
  const text =
    isRecord(value) && typeof value.message === 'string'
      ? value.message.trim()
      : ''
  return {
    choice: choice === 'once' || choice === 'always' ? choice : 'reject',
    message: text === '' ? undefined : text,
  }
}

/**
 * How many times the model made a call with this id. Some providers reuse
 * simple ids (`call_0`) in later turns, so the id alone does not name a call.
 */
function occurrenceOf(
  messages: ReadonlyArray<ModelMessage>,
  toolCallId: string,
): number {
  let count = 0
  for (const message of messages) {
    if (message.role !== 'assistant') continue
    for (const call of message.toolCalls ?? []) {
      if (call.id === toolCallId) count++
    }
  }
  return count
}

interface StoredAnswer {
  scope: string
  toolCallId: string
  occurrence: number
  value: unknown
}

function isStoredAnswer(value: unknown): value is StoredAnswer {
  return (
    isRecord(value) &&
    typeof value.scope === 'string' &&
    typeof value.toolCallId === 'string' &&
    typeof value.occurrence === 'number' &&
    'value' in value
  )
}

/**
 * @internal Durable answer store for boundary waits (`permissions()`, `question()`).
 * Keeps resolved answers in plugin state so they survive across multi-pause
 * tool batches and host restarts before tool execution runs.
 *
 * All runs of a session share the plugin state, so each run reads and writes
 * only its own answers: `forRun(scope)`, with the `subagentRunId` of an agent
 * run, or `undefined` for the lead turn. Some providers reuse simple ids
 * (`call_0`), so the answer of a parallel run never approves a call of this
 * one.
 *
 * Each answer belongs to one occurrence of its tool call. Call `retain` at
 * each boundary: it drops the answers of calls that are no longer pending,
 * and the answers of an earlier call that had the same id. So an answer does
 * not stay after its turn, and never approves a later call that reuses the id.
 */
export function durableAnswers(ctx: Pick<PluginSetupContext, 'state'>) {
  const state = ctx.state<Record<string, unknown>>({})
  return {
    forRun: (runScope: string | undefined) => {
      const scope = runScope ?? ''
      // A JSON pair, so no scope and key can make the key of another pair.
      const slot = (key: string) => JSON.stringify([scope, key])
      return {
        has: async (key: string) => {
          const stored = await state.get()
          return Object.hasOwn(stored, slot(key))
        },
        setMany: async (
          messages: ReadonlyArray<ModelMessage>,
          entries: ReadonlyArray<
            readonly [key: string, toolCallId: string, value: unknown]
          >,
        ) => {
          if (entries.length === 0) return
          await state.update((current) => {
            const next = { ...current }
            for (const [key, toolCallId, value] of entries) {
              next[slot(key)] = {
                scope,
                toolCallId,
                occurrence: occurrenceOf(messages, toolCallId),
                value,
              } satisfies StoredAnswer
            }
            return next
          })
        },
        /**
         * Drop the answers of this run for calls in `messages` that are no
         * longer pending, or that an earlier call with the same id made. The
         * answers of other runs stay.
         */
        retain: async (
          messages: ReadonlyArray<ModelMessage>,
          pendingToolCallIds: ReadonlyArray<string>,
        ) => {
          const pending = new Set(pendingToolCallIds)
          const keep = (entry: unknown) => {
            if (!isStoredAnswer(entry)) return false
            if (entry.scope !== scope) return true
            const occurrence = occurrenceOf(messages, entry.toolCallId)
            // Not in this transcript: a call that this run cannot judge.
            if (occurrence === 0) return true
            return (
              pending.has(entry.toolCallId) && entry.occurrence === occurrence
            )
          }
          const stored = await state.get()
          if (Object.values(stored).every(keep)) return
          await state.update((current) =>
            Object.fromEntries(
              Object.entries(current).filter(([, entry]) => keep(entry)),
            ),
          )
        },
        take: async (keys: ReadonlyArray<string>) => {
          const stored = await state.get()
          const present = keys.filter((key) => Object.hasOwn(stored, slot(key)))
          const values = keys.map((key) => {
            const entry = stored[slot(key)]
            return isStoredAnswer(entry) ? entry.value : undefined
          })
          if (present.length > 0) {
            await state.update((current) => {
              const next = { ...current }
              for (const key of present) {
                delete next[slot(key)]
              }
              return next
            })
          }
          return { present, values }
        },
      }
    },
  }
}
