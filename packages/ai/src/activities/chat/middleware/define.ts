import type { CapabilityHandle } from './capabilities'
import type { ChatMiddleware } from './types'
import type { InterruptDefinition } from '../../../interrupt-definition'

type AnyInterruptDefinition = InterruptDefinition<any, any, any, any>

/**
 * A middleware whose `requires`/`provides` tuple types are captured precisely
 * (via `const` inference) for the array coverage check and the builder.
 */
export interface DefinedChatMiddleware<
  TContext,
  TRequires extends ReadonlyArray<CapabilityHandle>,
  TProvides extends ReadonlyArray<CapabilityHandle>,
  TInterruptDefinitions extends AnyInterruptDefinition = never,
> extends ChatMiddleware<TContext, TInterruptDefinitions> {
  requires?: TRequires
  provides?: TProvides
}

/**
 * Identity helper for authoring middleware with precise capability inference.
 * Returns the middleware unchanged at runtime; only sharpens its type so the
 * `chat()` array coverage check and `createChatMiddleware` builder can read the
 * exact `requires`/`provides`.
 */
export function defineChatMiddleware<
  TContext = unknown,
  const TRequires extends ReadonlyArray<CapabilityHandle> = readonly [],
  const TProvides extends ReadonlyArray<CapabilityHandle> = readonly [],
  TInterruptDefinitions extends AnyInterruptDefinition = never,
>(
  middleware: ChatMiddleware<TContext, TInterruptDefinitions> & {
    requires?: TRequires
    provides?: TProvides
  },
): DefinedChatMiddleware<
  TContext,
  TRequires,
  TProvides,
  TInterruptDefinitions
> {
  return middleware
}
