import { registerWebMCPTools } from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
} from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'

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
 * Registers executable client tools with WebMCP for a Remix component.
 *
 * The component Handle signal removes every tool registered by this call.
 *
 * @param handle - The Remix component Handle from setup.
 * @param tools - The executable client tools to expose through WebMCP.
 * @param options - Runtime context, per-tool options, and error handling.
 *
 * @example
 * ```tsx
 * function Products(handle: Handle) {
 *   createWebMCPTools(handle, [searchProducts])
 *   return () => <ProductList />
 * }
 * ```
 */
export function createWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  handle: Pick<Handle, 'signal'>,
  tools: TTools,
  ...[options]: CreateWebMCPToolsArguments<TTools, TContext>
) {
  void registerWebMCPTools(tools, {
    ...options,
    signal: handle.signal,
  }).catch((error) => {
    if (!handle.signal.aborted) {
      options?.onError?.(error)
    }
  })
}
