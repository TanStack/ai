import { onDestroy } from 'svelte'
import { registerWebMCPTools, subscribeWebMCPTools } from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
  SubscribeWebMCPToolsOptions,
} from '@tanstack/ai-client'

/** Options for {@link createRegisterWebMCPTools}. */
export type CreateRegisterWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives an asynchronous registration error. */
  onError?: (error: unknown) => void
}

/** @deprecated Use `CreateRegisterWebMCPToolsOptions`. Removed in 1.0.0. */
export type CreateWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = CreateRegisterWebMCPToolsOptions<TTools, TContext>

type CreateRegisterWebMCPToolsArguments<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext,
> =
  {} extends CreateRegisterWebMCPToolsOptions<TTools, TContext>
    ? [options?: CreateRegisterWebMCPToolsOptions<TTools, TContext>]
    : [options: CreateRegisterWebMCPToolsOptions<TTools, TContext>]

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
 *   createRegisterWebMCPTools([searchProducts])
 * </script>
 * ```
 */
export function createRegisterWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  tools: TTools,
  ...[options]: CreateRegisterWebMCPToolsArguments<TTools, TContext>
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

  onDestroy(() => controller.abort())
}

/**
 * @deprecated Use `createRegisterWebMCPTools`. Removed in 1.0.0.
 * @alias
 */
export const createWebMCPTools = createRegisterWebMCPTools

/** Options for {@link createPageWebMCPTools}. */
export type CreatePageWebMCPToolsOptions = Omit<
  SubscribeWebMCPToolsOptions,
  'signal'
>

/**
 * Reads the WebMCP tools on the page as client tools for `createChat`.
 *
 * `tools` starts empty and updates when the page registers or removes a tool.
 * Component destruction stops the updates. Unsupported browsers and server
 * rendering keep an empty array.
 *
 * @param options - A filter that skips tools, and an error callback.
 *
 * @example
 * ```svelte
 * <script lang="ts">
 *   const page = createPageWebMCPTools({
 *     filter: (tool) => tool.origin === location.origin,
 *   })
 *   const chat = createChat({
 *     connection,
 *     get tools() {
 *       return page.tools
 *     },
 *   })
 * </script>
 * ```
 */
export function createPageWebMCPTools(options?: CreatePageWebMCPToolsOptions) {
  let tools = $state.raw<Array<AnyClientTool>>([])
  const controller = new AbortController()

  subscribeWebMCPTools((nextTools) => (tools = nextTools), {
    signal: controller.signal,
    filter: (tool) => options?.filter?.(tool) ?? true,
    onError: (error) => options?.onError?.(error),
  })

  onDestroy(() => controller.abort())
  return {
    /** The current page tools. */
    get tools() {
      return tools
    },
  }
}
