import { DestroyRef, assertInInjectionContext, inject } from '@angular/core'
import { registerWebMCPTools } from '@tanstack/ai-client'
import type {
  AnyClientTool,
  InferredClientContext,
  RegisterWebMCPToolsOptions,
} from '@tanstack/ai-client'

/**
 * Options for {@link injectWebMCPTools}.
 *
 * Context is required when a client tool declares a required runtime context.
 */
export type InjectWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = Omit<RegisterWebMCPToolsOptions<TTools, TContext>, 'signal'> & {
  /** Receives asynchronous WebMCP registration errors. */
  onError?: (error: unknown) => void
}

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
 * registration = injectWebMCPTools([statusTool], {
 *   onError: (error) => console.error(error),
 * })
 * ```
 */
export function injectWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(
  tools: TTools,
  ...[options]: {} extends InjectWebMCPToolsOptions<TTools, TContext>
    ? [options?: InjectWebMCPToolsOptions<TTools, TContext>]
    : [options: InjectWebMCPToolsOptions<TTools, TContext>]
) {
  assertInInjectionContext(injectWebMCPTools)
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
