import type { ai } from "@tanstack/ai";
import type {
  AIAdapter,
  ChatCompletionOptions,
  ResponseFormat,
  Tool,
  ChatCompletionResult,
} from "@tanstack/ai";

// Extract AI type from the ai function
export type AI<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any> = AIAdapter<any, any, any, any, any, any, any, any, any, any>> = ReturnType<typeof ai<TAdapter>>;

// Extract adapter type from AI instance
export type ExtractAdapter<T> = T extends AI<infer A> ? A : never;

// Extract model types from adapter
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

// Bound options type - all chat options except messages and model
export type BoundChatOptions<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> = Omit<
  ChatCompletionOptions,
  "model" | "messages" | "providerOptions" | "responseFormat"
> & {
  model: ExtractModels<TAdapter>;
  providerOptions?: ExtractChatProviderOptions<TAdapter>;
  tools?: ReadonlyArray<Tool>;
  systemPrompts?: string[];
};

// Options that can be bound (excludes messages/input)
export type BoundOptions<TAdapter extends AIAdapter<any, any, any, any, any, any, any, any, any, any>> = Omit<
  BoundChatOptions<TAdapter>,
  "messages"
>;

// Helper type for chatCompletion return type
export type ChatCompletionReturnType<
  TOptions extends { output?: ResponseFormat<any> }
> = TOptions["output"] extends ResponseFormat<infer TData>
  ? ChatCompletionResult<TData>
  : ChatCompletionResult;

// Fallback configuration
export interface FallbackConfig {
  onError?: (adapterName: string, error: Error) => void;
  stopOnError?: (error: Error) => boolean;
}

