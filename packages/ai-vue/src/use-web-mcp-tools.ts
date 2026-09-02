import { onScopeDispose } from 'vue'
import { registerWebMCPTools } from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
} from '@tanstack/ai-client'

/** Options for {@link useWebMCPTools}. */
export type UseWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives an asynchronous registration error. */
  onError?: (error: unknown) => void
}

type UseWebMCPToolsArguments<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext,
> =
  {} extends UseWebMCPToolsOptions<TTools, TContext>
    ? [options?: UseWebMCPToolsOptions<TTools, TContext>]
    : [options: UseWebMCPToolsOptions<TTools, TContext>]

/**
 * Registers executable client tools with WebMCP for the current Vue scope.
 *
 * Scope disposal removes every tool registered by this call.
 *
 * @param tools - The executable client tools to expose through WebMCP.
 * @param options - Runtime context, per-tool options, and error handling.
 *
 * @example
 * ```ts
 * useWebMCPTools([searchProducts])
 * ```
 */
export function useWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(tools: TTools, ...[options]: UseWebMCPToolsArguments<TTools, TContext>) {
  const controller = new AbortController()

  void registerWebMCPTools(tools, {
    ...options,
    signal: controller.signal,
  }).catch((error) => {
    if (!controller.signal.aborted) {
      options?.onError?.(error)
    }
  })

  onScopeDispose(() => controller.abort())
}
