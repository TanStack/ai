import type {
  AnyTool,
  ApprovalSchemaConfig,
  InferSchemaType,
  SchemaInput,
  ToolDefinition,
  ToolExecutionContext,
} from '@tanstack/ai'
import type { LogRecord } from '@tanstack/ai-persistence'

/** The durable steps of one tool call. */
export interface ToolStep {
  /**
   * Run `fn` once for `name` in this tool call, and store its value in the
   * session log before `do` resolves. When a crash makes the harness run the
   * call again, a stored step returns its value and `fn` does not run again.
   *
   * A step is stored once and runs at least once: a crash after `fn` ends but
   * before the value is stored runs `fn` again. The value must be JSON. Use a
   * name that is the same on every run (for example `charge:${orderId}`).
   * The same name twice in one call throws.
   */
  do: <T>(name: string, fn: () => T | Promise<T>) => Promise<T>
}

/** What the `execute` of a {@link durableTool} gets. */
export type DurableToolContext<TContext = unknown> =
  ToolExecutionContext<TContext> & {
    step: ToolStep
    /**
     * Add host records to the session log with this tool batch. They land in
     * the same append as the batch's transcript commit. If the batch never
     * commits (a crash), the records never happened.
     */
    append: (records: ReadonlyArray<LogRecord>) => void
  }

type DurableExecute = (args: any, context: DurableToolContext) => unknown

/**
 * The key that keeps the durable `execute` on a tool. An own enumerable
 * symbol key, so `{ ...tool }` in a plugin keeps it.
 *
 * @internal
 */
export const DURABLE_EXECUTE: unique symbol = Symbol(
  'tanstack.ai-harness.durable-execute',
)

/** @internal Steps over `recorded` values, stored with `record`. */
export function createToolStep(options: {
  recorded: (name: string) => { found: true; value: unknown } | { found: false }
  record: (name: string, value: unknown) => Promise<void>
}) {
  const used = new Set<string>()
  const step = {
    do: async <T>(name: string, fn: () => T | Promise<T>) => {
      if (used.has(name)) {
        throw new Error(
          `step.do: the step name ${JSON.stringify(name)} is already used in this tool call.`,
        )
      }
      used.add(name)
      const stored = options.recorded(name)
      // The log holds what an earlier run of this step returned.
      if (stored.found) return stored.value as T
      const value = await fn()
      await options.record(name, value)
      return value
    },
  } satisfies ToolStep
  return step
}

const noLog = () => {
  throw new Error(
    'durableTool append needs a durable harness session (a host with stores.log).',
  )
}

const emptyContext: ToolExecutionContext = { emitCustomEvent: () => {} }

/**
 * Make a server tool whose side effects survive a crash. `execute` gets
 * `step` and `append` next to the normal tool context. Put each side effect
 * in `step.do(name, fn)`: when a crash makes the harness run the call again,
 * finished steps return their stored values. The tool has `replay: 'safe'`.
 *
 * Outside a durable harness session (plain `chat()`, or a host without
 * `stores.log`), `step.do` runs `fn` each time and `append` throws.
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
) {
  const tool = definition.server((args, context) =>
    execute(args, {
      ...(context ?? emptyContext),
      step: createToolStep({
        recorded: () => ({ found: false }),
        record: async () => {},
      }),
      append: noLog,
    }),
  )
  Object.defineProperty(tool, DURABLE_EXECUTE, {
    value: execute,
    enumerable: true,
  })
  return Object.assign(tool, { replay: 'safe' as const })
}

function isDurableTool(
  tool: AnyTool,
): tool is AnyTool & { [DURABLE_EXECUTE]: DurableExecute } {
  return typeof Reflect.get(tool, DURABLE_EXECUTE) === 'function'
}

/**
 * Give a {@link durableTool} the `step` and `append` of a durable session.
 * `bind` gets the id of each call. Another tool comes back as it is.
 *
 * @internal
 */
export function bindDurable(
  tool: AnyTool,
  bind: (toolCallId: string) => {
    step: ToolStep
    append: DurableToolContext['append']
  },
) {
  if (!isDurableTool(tool)) return tool
  const execute = tool[DURABLE_EXECUTE]
  return {
    ...tool,
    execute: (args: unknown, context?: ToolExecutionContext) => {
      const base = context ?? emptyContext
      if (!base.toolCallId) {
        throw new Error('A durable tool call needs a tool call id.')
      }
      return execute(args, { ...base, ...bind(base.toolCallId) })
    },
  }
}
