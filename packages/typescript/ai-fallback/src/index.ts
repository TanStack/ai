import type { AIAdapter, ChatCompletionOptions, Tool } from "@tanstack/ai";
import { BoundAI } from "./bound-ai";
import { FallbackAI } from "./fallback-ai";
import type { BoundOptions, FallbackConfig, AI } from "./types";

// Extract types from adapter
type ExtractModels<T> = T extends AIAdapter<
  infer M,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any,
  any
>
  ? M[number]
  : string;

type ExtractChatProviderOptions<T> = T extends AIAdapter<
  any,
  any,
  any,
  any,
  any,
  infer P,
  any,
  any,
  any,
  any
>
  ? P
  : Record<string, any>;

/**
 * Create a BoundAI instance that wraps an AI instance with pre-bound model and options
 * 
 * @param ai - The AI instance to wrap
 * @param options - Model and options to bind (everything except messages/input)
 * @returns A BoundAI instance with model and options pre-configured
 * 
 * @example
 * ```typescript
 * import { ai } from '@tanstack/ai';
 * import { openai } from '@tanstack/ai-openai';
 * import { withModel } from '@tanstack/ai-fallback';
 * 
 * const openAI = withModel(ai(openai()), {
 *   model: 'gpt-4',
 *   temperature: 0.7,
 * });
 * 
 * // Now you can call chat without specifying model
 * const stream = openAI.chat({ messages: [...] });
 * ```
 */
export function withModel<
  TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>
>(
  aiInstance: AI<TAdapter>,
  options: Omit<ChatCompletionOptions, "model" | "messages" | "providerOptions" | "responseFormat"> & {
    model: ExtractModels<TAdapter>;
    providerOptions?: ExtractChatProviderOptions<TAdapter>;
    tools?: ReadonlyArray<Tool>;
    systemPrompts?: string[];
  }
): BoundAI<TAdapter> {
  return new BoundAI(aiInstance, options as BoundOptions<TAdapter>);
}

/**
 * Create a FallbackAI instance that tries multiple BoundAI instances in sequence
 * 
 * @param instances - Array of BoundAI instances to try in order
 * @param config - Optional fallback configuration
 * @returns A FallbackAI instance that tries each adapter until one succeeds
 * 
 * @example
 * ```typescript
 * import { ai } from '@tanstack/ai';
 * import { openai } from '@tanstack/ai-openai';
 * import { anthropic } from '@tanstack/ai-anthropic';
 * import { fallback, withModel } from '@tanstack/ai-fallback';
 * 
 * const openAI = withModel(ai(openai()), { model: 'gpt-4' });
 * const anthropicAI = withModel(ai(anthropic()), { model: 'claude-3-5-sonnet-20241022' });
 * 
 * const aiWithFallback = fallback([openAI, anthropicAI]);
 * 
 * // Tries openAI first, then anthropicAI if it fails
 * const stream = aiWithFallback.chat({ messages: [...] });
 * ```
 */
export function fallback(
  instances: BoundAI<any>[],
  config?: FallbackConfig
): FallbackAI {
  return new FallbackAI(instances, config);
}

// Re-export types
export type { BoundAI } from "./bound-ai";
export type { FallbackAI } from "./fallback-ai";
export type { BoundOptions, BoundChatOptions, FallbackConfig, ChatCompletionReturnType } from "./types";

