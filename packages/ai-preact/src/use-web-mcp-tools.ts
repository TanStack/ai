import { useEffect, useRef, useState } from 'preact/hooks'
import { registerWebMCPTools, subscribeWebMCPTools } from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
  SubscribeWebMCPToolsOptions,
} from '@tanstack/ai-client'

/** Options for the Preact {@link useRegisterWebMCPTools} lifecycle hook. */
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
 * Registers client tools with WebMCP for the lifetime of a Preact component.
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
export function useRegisterWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  tools: TTools,
  ...[options]: UseRegisterWebMCPToolsArguments<TTools, TContext>
) {
  useEffect(() => {
    const controller = new AbortController()
    const { onError, ...registrationOptions } = options ?? {}

    registerWebMCPTools(tools, {
      ...registrationOptions,
      signal: controller.signal,
    }).catch((error) => {
      if (!controller.signal.aborted) onError?.(error)
    })

    return () => controller.abort()
  }, [tools, options])
}

/**
 * @deprecated Use `useRegisterWebMCPTools`. Removed in 1.0.0.
 * @alias
 */
export const useWebMCPTools = useRegisterWebMCPTools

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
export function usePageWebMCPTools(
  options?: UsePageWebMCPToolsOptions,
): Array<AnyClientTool> {
  const [tools, setTools] = useState<Array<AnyClientTool>>([])
  const optionsRef = useRef(options)
  optionsRef.current = options

  useEffect(() => {
    const controller = new AbortController()
    subscribeWebMCPTools(setTools, {
      signal: controller.signal,
      filter: (tool) => optionsRef.current?.filter?.(tool) ?? true,
      onError: (error) => optionsRef.current?.onError?.(error),
    })
    return () => controller.abort()
  }, [])

  return tools
}
