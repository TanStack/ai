import type {
  AnyTool,
  ApprovalSchemaConfig,
  InferSchemaType,
  SchemaInput,
  ToolDefinition,
  ToolExecutionContext,
} from '@tanstack/ai'
import { jsonCopy, waitUntil } from './utils'
import type { LogRecord } from '@tanstack/ai-persistence'
import type { AnswerOf, Question } from './commands'

/**
 * `T` when JSON keeps it as it is, with each part that JSON changes (a
 * `Date`, a `Map`, a class with methods, a function) as `never`. So a
 * `step.do` value that is not JSON is a type error. `undefined` (an absent
 * field, or no value) is allowed.
 */
export type AsJson<T> = T extends
  | string
  | number
  | boolean
  | null
  | undefined
  | void
  ? T
  : T extends
        | ((...args: Array<never>) => unknown)
        | Date
        | Map<unknown, unknown>
        | Set<unknown>
        | bigint
        | symbol
    ? never
    : T extends object
      ? { [K in keyof T]: AsJson<T[K]> }
      : never

/** `T`, checked by {@link AsJson}. `T` is inferred from the value alone. */
type JsonOf<T> = T & AsJson<NoInfer<T>>

/** What the `fn` of one `step.do` gets. */
export interface StepRun {
  /**
   * A key for the side effect of this step. Give it to a system that refuses
   * a second call with the same key. In a harness session it is
   * `${logId}:${toolCallId}:${name}` (`RunContext.idempotencyKey` with the
   * tool call id as scope). It has no attempt part: a run again of the call
   * gets the same key. Outside a session it is the step name.
   */
  idempotencyKey: string
  /**
   * The ownership epoch of the log (see `RunContext.epoch`). 0 outside a
   * harness session.
   */
  epoch: number
}

/** The durable steps of one tool call. */
export interface ToolStep {
  /**
   * Run `fn` once for `name` in this tool call, and store its value in the
   * session log before `do` resolves. When a crash makes the harness run the
   * call again, a stored step returns its value and `fn` does not run again.
   * `do` returns the JSON copy of the value, the same value a replay gives.
   * So the value must be JSON (see {@link AsJson}): a `Date`, a `Map`, or a
   * class instance is a type error. Return `date.toISOString()`, not `date`.
   *
   * A step runs at least once, and is stored once: a crash after `fn` ends
   * but before the value is stored runs `fn` again. So pass
   * `idempotencyKey` to the system that does the side effect, and it can
   * refuse the second call. The value must be JSON: else `do` throws, and
   * nothing is stored. Use a name that is the same on every run (for example
   * `charge:${orderId}`). The same name twice in one call throws. A step
   * does not start after the host lost the session log to another host.
   * In a harness session, a value that holds a secret of the session (a key
   * it read, a secret answer) throws too, on the first run and on a replay:
   * the log never keeps a secret. Read the secret outside `step.do`.
   *
   * @example
   * ```ts
   * const charge = await step.do(`charge:${orderId}`, ({ idempotencyKey }) =>
   *   payments.charge({ orderId, idempotencyKey }),
   * )
   * ```
   */
  do: <T>(
    name: string,
    fn: (step: StepRun) => JsonOf<T> | Promise<JsonOf<T>>,
  ) => Promise<T>
  /**
   * Wait `ms` milliseconds, once for `name` in this tool call. The first
   * run stores the wake time in the session log. A run again after a crash
   * or a restart, on any host, waits only for the time that is left, and a
   * sleep whose time passed returns at once. While it waits, the log keeps
   * a wake, so a host that stops lets a worker continue the call at the
   * wake time (see `createHarnessWorker`).
   *
   * The name is a step name: it must be the same on every run, and not the
   * name of a `do` step of this call. Outside a session, it waits `ms`.
   *
   * @example
   * ```ts
   * await step.do('send-reminder', () => mail.send(reminder))
   * await step.sleep({ name: 'wait-a-day', ms: 24 * 60 * 60 * 1000 })
   * await step.do('send-follow-up', () => mail.send(followUp))
   * ```
   */
  sleep: (options: { name: string; ms: number }) => Promise<void>
  /**
   * Ask the user, once for `name` in this call, and wait for the answer.
   * The log keeps the question as a wait of this run, so a user on any
   * machine can answer it. When the host stops while it waits, the next
   * host runs the code again from the top: finished `do` steps return their
   * values, and `ask` returns the logged answer, or waits again.
   *
   * The answer is checked against `schema`. A `secret` answer is never in
   * the log: the credential store keeps it until the run ends, so a run
   * again can read it. `ask` rejects when the wait is cancelled or
   * expires, and when the run stops. Outside a harness session it throws.
   *
   * In an agent that the main model calls as a tool, a `secret` question
   * throws, `expiresAt` has no effect, and the wait does not get `url`.
   *
   * @example
   * ```ts
   * const key = await step.ask({ name: 'api-key', message: 'Paste your key', secret: true })
   * ```
   */
  ask: <TSchema extends SchemaInput | undefined = undefined>(
    question: StepQuestion<TSchema>,
  ) => Promise<AnswerOf<TSchema>>
}

/**
 * A question of `step.ask`: a {@link Question}, with a `name` that is the
 * same on every run of the code.
 */
export type StepQuestion<TSchema extends SchemaInput | undefined = undefined> =
  Omit<Question<TSchema>, 'live'> & { name: string }

/** `step.ask` outside a harness session: nobody can answer. */
export const askWithoutSession = (): never => {
  throw new Error(
    'step.ask needs a harness session: call it in a command, a durable tool, or an agent run of host.open().',
  )
}

/** What the `execute` of a {@link durableTool} gets. */
export type DurableToolContext<TContext = unknown> =
  ToolExecutionContext<TContext> & {
    step: ToolStep
    /**
     * Add host records to the session log with this tool call. They land in
     * the same append as the call's result. If the call never ends (a
     * crash), the records never happened.
     */
    append: (records: ReadonlyArray<LogRecord>) => void
  }

type DurableExecute = (args: unknown, context: DurableToolContext) => unknown

/**
 * The key that keeps the durable `execute` on a tool. An own enumerable
 * symbol key, so `{ ...tool }` in a plugin keeps it.
 *
 * @internal
 */
export const DURABLE_EXECUTE: unique symbol = Symbol(
  'tanstack.ai-harness.durable-execute',
)

/** The step name that keeps the wake time of `step.sleep({ name })`. */
const sleepStepName = (name: string) => `sleep:${name}`

/**
 * @internal Steps over `recorded` values, stored with `record`. `run` gives
 * the `fn` of a step what it gets, and throws when the step must not start.
 * `sleep` waits until the stored wake time of a `step.sleep`.
 */
export function createToolStep(options: {
  recorded: (name: string) => { found: true; value: unknown } | { found: false }
  record: (name: string, value: unknown) => Promise<void>
  run: (name: string) => StepRun
  sleep: (sleep: { name: string; wakeAt: number }) => Promise<void>
  /** Ask the user, and resolve with the checked answer. */
  ask?: (question: StepQuestion<SchemaInput | undefined>) => Promise<unknown>
}) {
  const used = new Set<string>()
  const step = {
    sleep: async ({ name, ms }: { name: string; ms: number }) => {
      if (!Number.isFinite(ms) || ms < 0) {
        throw new RangeError(
          `step.sleep: ms must be 0 or more, got ${ms} for ${JSON.stringify(name)}.`,
        )
      }
      // Stored once, so a run again waits for the same time.
      const wakeAt = await step.do(sleepStepName(name), () => Date.now() + ms)
      await options.sleep({ name, wakeAt })
    },
    do: async <T>(name: string, fn: (step: StepRun) => T | Promise<T>) => {
      if (used.has(name)) {
        throw new Error(
          `step.do: the step name ${JSON.stringify(name)} is already used in this tool call.`,
        )
      }
      used.add(name)
      const stored = options.recorded(name)
      // The log holds what an earlier run of this step returned. A copy, so
      // the tool cannot change the fold.
      if (stored.found) return structuredClone(stored.value) as T
      const value = await fn(options.run(name))
      // The value a replay returns. A value that is not JSON fails now, not
      // after a crash: nothing is stored, so a run again calls `fn` again.
      const copy = jsonCopy(value)
      if (copy === undefined && value !== undefined) {
        throw new TypeError(
          `step.do: the value of step ${JSON.stringify(name)} is not JSON, so the log cannot keep it.`,
        )
      }
      await options.record(name, copy)
      // `T` is JSON (see `AsJson`), so the copy has its type, as on a replay.
      return copy as T
    },
    ask: async (question) => {
      const { ask } = options
      if (!ask) return askWithoutSession()
      const key = `ask:${question.name}`
      if (used.has(key)) {
        throw new Error(
          `step.ask: the name ${JSON.stringify(question.name)} is already used in this call.`,
        )
      }
      used.add(key)
      // The session checked the answer against the schema of the question.
      return (await ask(question)) as never
    },
  } satisfies ToolStep
  return step
}

/** What a step gets outside a harness session: its name as the key. */
export const stepRunWithoutSession = (name: string) => ({
  idempotencyKey: name,
  epoch: 0,
})

const noLog = () => {
  throw new Error(
    'durableTool append needs a harness session: call the tool in a turn of host.open().',
  )
}

const emptyContext: ToolExecutionContext = { emitCustomEvent: () => {} }

/** Options for {@link durableTool}. */
export interface DurableToolOptions {
  /**
   * What the harness does with a call that a crash cut:
   * - `'safe'` (default): run it again. Finished steps return their stored
   *   values.
   * - `'never'`: give the model a tool error. The call does not run again.
   */
  replay?: 'safe' | 'never'
}

/**
 * Make a server tool whose side effects survive a crash. `execute` gets
 * `step` and `append` next to the normal tool context. Put each side effect
 * in `step.do(name, fn)`: when a crash makes the harness run the call again,
 * finished steps return their stored values. The tool has `replay: 'safe'`
 * unless `options.replay` says `'never'`.
 *
 * Outside a harness session (plain `chat()`), `step.do` runs `fn` each
 * time and `append` throws.
 *
 * @example
 * ```ts
 * const createInvoice = durableTool(
 *   toolDefinition({ name: 'create_invoice', description: 'Create an invoice', inputSchema }),
 *   async ({ orderId }, { step }) => {
 *     const invoice = await step.do(`create:${orderId}`, () => billing.create(orderId))
 *     return { invoiceId: invoice.id }
 *   },
 * )
 * ```
 */
export function durableTool<
  TInput extends SchemaInput | undefined,
  TOutput extends SchemaInput | undefined,
  TName extends string,
  TNeedsApproval extends boolean,
  TApprovalSchema extends ApprovalSchemaConfig | undefined,
>(
  definition: ToolDefinition<
    TInput,
    TOutput,
    TName,
    TNeedsApproval,
    TApprovalSchema
  >,
  execute: (
    args: InferSchemaType<TInput>,
    context: DurableToolContext,
  ) => Promise<InferSchemaType<TOutput>> | InferSchemaType<TOutput>,
  options: DurableToolOptions = {},
) {
  const tool = definition.server((args, context) =>
    execute(args, {
      ...(context ?? emptyContext),
      step: createToolStep({
        recorded: () => ({ found: false }),
        record: async () => {},
        run: stepRunWithoutSession,
        sleep: ({ wakeAt }) => waitUntil(wakeAt, context?.abortSignal),
      }),
      append: noLog,
    }),
  )
  Object.defineProperty(tool, DURABLE_EXECUTE, {
    value: execute,
    enumerable: true,
  })
  return Object.assign(tool, { replay: options.replay ?? 'safe' })
}

function isDurableTool(
  tool: AnyTool,
): tool is AnyTool & { [DURABLE_EXECUTE]: DurableExecute } {
  return typeof Reflect.get(tool, DURABLE_EXECUTE) === 'function'
}

/**
 * The binder that bound a durable tool. An own enumerable symbol key, so a
 * spread copy (a middleware wrapper) stays bound.
 */
const DURABLE_BINDER: unique symbol = Symbol(
  'tanstack.ai-harness.durable-binder',
)

/** @internal */
export type DurableBind = (toolCallId: string) => {
  step: ToolStep
  append: DurableToolContext['append']
  /** The call ended, and no run again reads what its steps keep. */
  done?: () => Promise<void>
}

/**
 * Give a {@link durableTool} the `step` and `append` of a durable session.
 * `bind` gets the id of each call. Another tool, and a tool that `bind`
 * already bound, comes back as it is.
 *
 * @internal
 */
export function bindDurable(tool: AnyTool, bind: DurableBind) {
  if (!isDurableTool(tool) || Reflect.get(tool, DURABLE_BINDER) === bind) {
    return tool
  }
  const execute = tool[DURABLE_EXECUTE]
  const bound = {
    ...tool,
    execute: async (args: unknown, context?: ToolExecutionContext) => {
      const base = context ?? emptyContext
      if (!base.toolCallId) {
        throw new Error('A durable tool call needs a tool call id.')
      }
      const { done, ...bound } = bind(base.toolCallId)
      try {
        return await execute(args, { ...base, ...bound })
      } finally {
        // A stopped call runs again, and reads its steps again.
        if (!base.abortSignal?.aborted) await done?.().catch(() => {})
      }
    },
  }
  Object.defineProperty(bound, DURABLE_BINDER, {
    value: bind,
    enumerable: true,
  })
  return bound
}
