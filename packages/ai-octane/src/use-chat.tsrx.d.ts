// Declaration companion generated from use-chat.tsrx.
import type { AnyClientTool, SchemaInput } from '@tanstack/ai/client';
import type { InferredClientContext } from '@tanstack/ai-client';
import type { UseChatOptions, UseChatReturn } from './types';
export declare function useChat<const TTools extends ReadonlyArray<AnyClientTool> = any, TSchema extends SchemaInput | undefined = undefined, TContext = InferredClientContext<TTools>>(options: UseChatOptions<TTools, TSchema, TContext>): UseChatReturn<TTools, TSchema>;
