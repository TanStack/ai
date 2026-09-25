import { createSignal, onCleanup } from 'solid-js'
import { registerWebMCPTools, subscribeWebMCPTools } from '@tanstack/ai-client'
import type { Accessor } from 'solid-js'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
  SubscribeWebMCPToolsOptions,
} from '@tanstack/ai-client'

/** Options for {@link useRegisterWebMCPTools}. */
export type UseRegisterWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives an asynchronous registration error. */
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
  {} extends UseRegisterWebMCPToolsOptions<TTools, TContext>
    ? [options?: UseRegisterWebMCPToolsOptions<TTools, TContext>]
    : [options: UseRegisterWebMCPToolsOptions<TTools, TContext>]

/**
 * Registers executable client tools with WebMCP for the current Solid owner.
 *
 * The owner cleanup removes every tool registered by this call.
 *
 * @param tools - The executable client tools to expose through WebMCP.
 * @param options - Runtime context, per-tool options, and error handling.
 *
 * @example
 * ```ts
 * useRegisterWebMCPTools([searchProducts])
 * ```
 */
export function useRegisterWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  tools: TTools,
  ...[options]: UseRegisterWebMCPToolsArguments<TTools, TContext>
) {
  const controller = new AbortController()

  void registerWebMCPTools(tools, {
    ...options,
    signal: controller.signal,
  }).catch((error) => {
    if (!controller.signal.aborted) {
      options?.onError?.(error)
    }
  })

  onCleanup(() => controller.abort())
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
 * The accessor starts empty and updates when the page registers or removes a
 * tool. The owner cleanup stops the updates. Unsupported browsers and server
 * rendering keep an empty array.
 *
 * @param options - A filter that skips tools, and an error callback.
 *
 * @example
 * ```tsx
 * const pageTools = usePageWebMCPTools({
 *   filter: (tool) => tool.origin === location.origin,
 * })
 * const chat = useChat({
 *   connection,
 *   get tools() {
 *     return pageTools()
 *   },
 * })
 * ```
 */
export function usePageWebMCPTools(
  options?: UsePageWebMCPToolsOptions,
): Accessor<Array<AnyClientTool>> {
  const [tools, setTools] = createSignal<Array<AnyClientTool>>([])
  const controller = new AbortController()

  subscribeWebMCPTools((nextTools) => setTools(nextTools), {
    signal: controller.signal,
    filter: (tool) => options?.filter?.(tool) ?? true,
    onError: (error) => options?.onError?.(error),
  })

  onCleanup(() => controller.abort())
  return tools
}
