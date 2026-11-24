import { toolDefinition } from '@tanstack/ai'
import { runSandboxed } from './run'
import type {
  InferSchemaType,
  SchemaInput,
  ToolExecutionContext,
} from '@tanstack/ai'
import type { Facades, IsolateDriver, Limits } from './types'

export interface SandboxedChatToolConfig<
  TInput extends SchemaInput,
  TContext = unknown,
> {
  name: string
  description: string
  /** Zod or JSON-Schema input shape. The snippet sees the validated args as `input`. */
  inputSchema: TInput
  /** Raw function body: top-level `await` / `return`, sees `input` + `host.*`. */
  snippet: string
  /**
   * Host functions the snippet may call. Its only egress. Each gets the
   * `chat({ context })` value as `ctx.context`.
   */
  facades: Facades<TContext>
  driver: IsolateDriver
  limits: Limits
  truncatable?: ReadonlyArray<string>
}

/**
 * Build a `chat()` tool whose implementation runs in an isolate. The agent calls
 * the tool; the tool's body can only reach the injected facades, under the given
 * limits. Drop the result into `chat({ tools: [...] })` like any other tool.
 *
 * A blocked run (timeout, injected-call limit, a thrown error such as an
 * undefined `fetch`, oversized result) throws, so the agent loop sees a normal
 * tool error. The message the model sees names only the kind of stop; the raw
 * text, which can carry facade internals, is on `error.cause` for host logs.
 * Facades get the `chat({ context })` value as `ctx.context`, typed by
 * `TContext`. Take the user from there, never from the facade `args`: the
 * snippet picks the args.
 */
export function sandboxedChatTool<
  TInput extends SchemaInput,
  TContext = unknown,
>(config: SandboxedChatToolConfig<TInput, TContext>) {
  const { name, description, inputSchema, snippet, facades, driver, limits } =
    config
  return toolDefinition({ name, description, inputSchema }).server<TContext>(
    async (
      args: InferSchemaType<TInput>,
      context?: ToolExecutionContext<TContext>,
    ) => {
      const run = await runSandboxed({
        snippet,
        input: args,
        facades,
        driver,
        limits,
        truncatable: config.truncatable,
        signal: context?.abortSignal,
        context: context?.context,
      })
      if (!run.ok) {
        const reason =
          run.kind === 'limit'
            ? 'a sandbox limit was hit'
            : 'the snippet failed'
        throw new Error(`sandboxed tool "${name}" blocked: ${reason}`, {
          cause: run.error,
        })
      }
      return run.value
    },
  )
}
