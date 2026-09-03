// Declaration companion generated from use-web-mcp-tools.tsrx.
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
} from '@tanstack/ai-client'

/** Options for the Octane {@link useWebMCPTools} lifecycle hook. */
export type UseWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives an asynchronous registration failure. */
  onError?: (error: unknown) => void
}
type UseWebMCPToolsArguments<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext,
> =
  RegisterWebMCPToolsOptions<TTools, TContext> extends { context: unknown }
    ? [options: UseWebMCPToolsOptions<TTools, TContext>]
    : [options?: UseWebMCPToolsOptions<TTools, TContext>]
/**
 * Registers client tools with WebMCP for the lifetime of an Octane component.
 *
 * The hook replaces the registration when `tools` or `options` changes.
 * Unsupported browsers and server rendering do not register tools.
 *
 * @param tools - The executable client tools to expose through WebMCP.
 * @param options - Runtime context, per-tool options, and an error callback.
 *
 * @example
 * ```tsx
 * useWebMCPTools([searchProducts], {
 *   toolOptions: { searchProducts: { title: 'Search products' } },
 * })
 * ```
 */
export declare function useWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(tools: TTools, ...[options]: UseWebMCPToolsArguments<TTools, TContext>): void
