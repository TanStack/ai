// Declaration companion generated from use-chat.tsrx.
import type {
  AnyActivityTypeDefinition,
  AnyClientTool,
  InterruptDefinition,
  SchemaInput,
} from '@tanstack/ai/client'
import type { InferredClientContext } from '@tanstack/ai-client'
import type { UseChatOptions, UseChatReturn } from './types'

export declare function useChat<
  const TTools extends ReadonlyArray<AnyClientTool> = any,
  TSchema extends SchemaInput | undefined = undefined,
  TContext = InferredClientContext<TTools>,
  const TInterrupts extends ReadonlyArray<
    InterruptDefinition<any, any, any, any>
  > = readonly [],
  const TActivities extends ReadonlyArray<AnyActivityTypeDefinition> =
    readonly [],
>(
  options: UseChatOptions<TTools, TSchema, TContext, TInterrupts, TActivities>,
): UseChatReturn<TTools, TSchema, TInterrupts, TActivities>
