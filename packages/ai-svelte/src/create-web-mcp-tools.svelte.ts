import { onDestroy } from 'svelte'
import { registerWebMCPTools } from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
} from '@tanstack/ai-client'

/** Options for {@link createWebMCPTools}. */
export type CreateWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives an asynchronous registration error. */
  onError?: (error: unknown) => void
}

type CreateWebMCPToolsArguments<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext,
> =
  {} extends CreateWebMCPToolsOptions<TTools, TContext>
    ? [options?: CreateWebMCPToolsOptions<TTools, TContext>]
    : [options: CreateWebMCPToolsOptions<TTools, TContext>]

/**
 * Registers executable client tools with WebMCP for the current Svelte component.
 *
 * Component destruction removes every tool registered by this call.
 *
 * @param tools - The executable client tools to expose through WebMCP.
 * @param options - Runtime context, per-tool options, and error handling.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   createWebMCPTools([searchProducts])
 * </script>
 * ```
 */
export function createWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(tools: TTools, ...[options]: CreateWebMCPToolsArguments<TTools, TContext>) {
  const controller = new AbortController()

  void registerWebMCPTools(tools, {
    ...options,
    signal: controller.signal,
  }).catch((error) => {
    if (!controller.signal.aborted) {
      options?.onError?.(error)
    }
  })

  onDestroy(() => controller.abort())
}
