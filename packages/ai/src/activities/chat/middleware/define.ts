import type { CapabilityHandle } from './capabilities'
import type { ChatMiddleware } from './types'
import type { InterruptDefinition } from '../../../interrupt-definition'

type AnyInterruptDefinition = InterruptDefinition<any, any, any, any>

export interface DefinedChatMiddleware<
  TContext,
  TRequires extends ReadonlyArray<CapabilityHandle>,
  TProvides extends ReadonlyArray<CapabilityHandle>,
  TInterruptDefinitions extends AnyInterruptDefinition = never,
> extends ChatMiddleware<TContext, TInterruptDefinitions> {
  requires?: TRequires
  provides?: TProvides
}

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
