import { useChat as useUnboundChat } from './use-chat'
import type {
  AnyClientTool,
  InterruptDefinition,
  SchemaInput,
} from '@tanstack/ai/client'
import type {
  DistributedOmit,
  InferredClientContext,
} from '@tanstack/ai-client'
import type { UseChatOptions } from './types'

type ChatHookOverrides<
  TTools extends ReadonlyArray<AnyClientTool>,
  TSchema extends SchemaInput | undefined,
  TContext,
  TInterrupts extends ReadonlyArray<InterruptDefinition<any, any, any, any>>,
  TSubagents extends ReadonlyArray<{ name: string }> | undefined,
> = {
  threadId: string
  live?: boolean
  forwardedProps?: Record<string, any>
  initialMessages?: UseChatOptions<
    TTools,
    TSchema,
    TContext,
    TInterrupts,
    TSubagents
  >['initialMessages']
}

/**
 * Bind chat options once at module scope. The returned `useChat` hook
 * creates a chat instance from those options.
 *
 * Pass `threadId` on every call. You can also override `initialMessages`,
 * `live`, and `forwardedProps` per call. Do not change `tools`,
 * `interrupts`, or `outputSchema` here. Those stay on the factory options.
 *
 * Rename the hook at the call site if you already import `useChat` from
 * `@tanstack/ai-react`: `const { useChat: useAppChat } = createChatHook(chatOptions)`.
 *
 * @example
 * ```tsx
 * const { useChat } = createChatHook(chatOptions)
 *
 * function Support() {
 *   const chat = useChat({ threadId: 'support-1' })
 *   return <UI.Chat chat={chat} />
 * }
 * ```
 */
export function createChatHook<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
  const TSubagents extends ReadonlyArray<{ name: string }> | undefined =
    undefined,
>(
  options: DistributedOmit<
    UseChatOptions<TTools, TSchema, TContext, TInterrupts, TSubagents>,
    'threadId'
  > & {
    // Plain keys so TypeScript can infer the generics through the Omit.
    tools?: TTools
    outputSchema?: TSchema
    interrupts?: TInterrupts
    subagents?: TSubagents
  },
) {
  function useChat(
    overrides: ChatHookOverrides<
      TTools,
      TSchema,
      TContext,
      TInterrupts,
      TSubagents
    >,
  ) {
    // `overrides` carries the required `threadId`.
    return useUnboundChat({ ...options, ...overrides } as UseChatOptions<
      TTools,
      TSchema,
      TContext,
      TInterrupts,
      TSubagents
    >)
  }

  return { useChat }
}
