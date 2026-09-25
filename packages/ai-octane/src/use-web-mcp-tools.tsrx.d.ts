// Declaration companion generated from use-web-mcp-tools.tsrx.
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
  SubscribeWebMCPToolsOptions,
} from '@tanstack/ai-client'

/** Options for the Octane {@link useRegisterWebMCPTools} lifecycle hook. */
export type UseRegisterWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives an asynchronous registration failure. */
  onError?: (error: unknown) => void
}
/** @deprecated Use `UseRegisterWebMCPToolsOptions`. Removed in 1.0.0. */
export type UseWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = UseRegisterWebMCPToolsOptions<TTools, TContext>
type UseRegisterWebMCPToolsArguments<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext,
> =
  RegisterWebMCPToolsOptions<TTools, TContext> extends { context: unknown }
    ? [options: UseRegisterWebMCPToolsOptions<TTools, TContext>]
    : [options?: UseRegisterWebMCPToolsOptions<TTools, TContext>]
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
 * useRegisterWebMCPTools([searchProducts], {
 *   toolOptions: { searchProducts: { title: 'Search products' } },
 * })
 * ```
 */
export declare function useRegisterWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  tools: TTools,
  ...[options]: UseRegisterWebMCPToolsArguments<TTools, TContext>
): void
/** @deprecated Use `useRegisterWebMCPTools`. Removed in 1.0.0. */
export declare const useWebMCPTools: typeof useRegisterWebMCPTools
/** Options for {@link usePageWebMCPTools}. */
export type UsePageWebMCPToolsOptions = Omit<
  SubscribeWebMCPToolsOptions,
  'signal'
>
/**
 * Returns the WebMCP tools on the page as client tools for `useChat`.
 *
 * The list starts empty and updates when the page registers or removes a
 * tool. The hook reads the latest `filter` and `onError` on each update.
 * Unsupported browsers and server rendering return an empty array.
 *
 * @param options - A filter that skips tools, and an error callback.
 *
 * @example
 * ```tsx
 * const pageTools = usePageWebMCPTools({
 *   filter: (tool) => tool.origin === location.origin,
 * })
 * const chat = useChat({ connection, tools: pageTools })
 * ```
 */
export declare function usePageWebMCPTools(
  options?: UsePageWebMCPToolsOptions,
): Array<AnyClientTool>
