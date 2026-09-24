import {
  DestroyRef,
  assertInInjectionContext,
  inject,
  signal,
} from '@angular/core'
import { registerWebMCPTools, subscribeWebMCPTools } from '@tanstack/ai-client'
import type { Signal } from '@angular/core'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
  SubscribeWebMCPToolsOptions,
} from '@tanstack/ai-client'

/**
 * Options for {@link injectRegisterWebMCPTools}.
 *
 * Context is required when a client tool declares a required runtime context.
 */
export type InjectRegisterWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives asynchronous WebMCP registration errors. */
  onError?: (error: unknown) => void
}

/** @deprecated Use `InjectRegisterWebMCPToolsOptions`. Removed in 1.0.0. */
export type InjectWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = InjectRegisterWebMCPToolsOptions<TTools, TContext>

/**
 * Registers executable client tools with WebMCP for the current Angular owner.
 *
 * Angular removes the registrations when it destroys the injection owner. Call
 * this function in an injection context, such as a component field initializer.
 *
 * @param tools - The executable client tools to expose through WebMCP.
 * @param options - Runtime context, per-tool options, and error handling.
 *
 * @example
 * ```ts
 * registration = injectRegisterWebMCPTools([statusTool], {
 *   onError: (error) => console.error(error),
 * })
 * ```
 */
export function injectRegisterWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  tools: TTools,
  ...[options]: {} extends InjectRegisterWebMCPToolsOptions<TTools, TContext>
    ? [options?: InjectRegisterWebMCPToolsOptions<TTools, TContext>]
    : [options: InjectRegisterWebMCPToolsOptions<TTools, TContext>]
) {
  assertInInjectionContext(injectRegisterWebMCPTools)
  const destroyRef = inject(DestroyRef)
  const registrationController = new AbortController()
  const { onError, ...registrationOptions } = options ?? {}

  destroyRef.onDestroy(() => registrationController.abort())

  void registerWebMCPTools(tools, {
    ...registrationOptions,
    signal: registrationController.signal,
  }).catch((error) => {
    if (!registrationController.signal.aborted) {
      onError?.(error)
    }
  })
}

/**
 * @deprecated Use `injectRegisterWebMCPTools`. Removed in 1.0.0.
 * @alias
 */
export const injectWebMCPTools = injectRegisterWebMCPTools

/** Options for {@link injectPageWebMCPTools}. */
export type InjectPageWebMCPToolsOptions = Omit<
  SubscribeWebMCPToolsOptions,
  'signal'
>

/**
 * Returns the WebMCP tools on the page as client tools for `injectChat`.
 *
 * The signal starts empty and updates when the page registers or removes a
 * tool. Angular stops the updates when it destroys the injection owner. Call
 * this function in an injection context.
 *
 * @param options - A filter that skips tools, and an error callback.
 *
 * @example
 * ```ts
 * pageTools = injectPageWebMCPTools({
 *   filter: (tool) => tool.origin === location.origin,
 * })
 * chat = injectChat({ connection, tools: this.pageTools })
 * ```
 */
export function injectPageWebMCPTools(
  options?: InjectPageWebMCPToolsOptions,
): Signal<Array<AnyClientTool>> {
  assertInInjectionContext(injectPageWebMCPTools)
  const destroyRef = inject(DestroyRef)
  const tools = signal<Array<AnyClientTool>>([])
  const controller = new AbortController()

  destroyRef.onDestroy(() => controller.abort())

  subscribeWebMCPTools((nextTools) => tools.set(nextTools), {
    signal: controller.signal,
    filter: (tool) => options?.filter?.(tool) ?? true,
    onError: (error) => options?.onError?.(error),
  })

  return tools.asReadonly()
}
