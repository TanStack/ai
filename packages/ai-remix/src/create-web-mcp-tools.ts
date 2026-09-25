import { registerWebMCPTools, subscribeWebMCPTools } from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
  SubscribeWebMCPToolsOptions,
} from '@tanstack/ai-client'
import type { Handle } from 'remix/ui'

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
 *   createRegisterWebMCPTools(handle, [searchProducts])
 *   return () => <ProductList />
 * }
 * ```
 */
export function createRegisterWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  handle: Pick<Handle, 'signal'>,
  tools: TTools,
  ...[options]: CreateRegisterWebMCPToolsArguments<TTools, TContext>
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
 * `tools` starts empty. When the page registers or removes a tool, the
 * helper updates `tools` and calls `handle.update()`. The Handle signal stops
 * the updates. Unsupported browsers and server rendering keep an empty array.
 *
 * @param handle - The Remix component Handle from setup.
 * @param options - A filter that skips tools, and an error callback.
 *
 * @example
 * ```tsx
 * function Chat(handle: Handle) {
 *   const page = createPageWebMCPTools(handle)
 *   const chat = createChat(handle, {
 *     connection,
 *     get tools() {
 *       return page.tools
 *     },
 *   })
 *   return () => <Messages chat={chat} />
 * }
 * ```
 */
export function createPageWebMCPTools(
  handle: Pick<Handle, 'signal' | 'update'>,
  options?: CreatePageWebMCPToolsOptions,
) {
  let tools: Array<AnyClientTool> = []

  subscribeWebMCPTools(
    (nextTools) => {
      tools = nextTools
      void handle.update()
    },
    {
      signal: handle.signal,
      filter: (tool) => options?.filter?.(tool) ?? true,
      onError: (error) => options?.onError?.(error),
    },
  )

  return {
    /** The current page tools. */
    get tools() {
      return tools
    },
  }
}
