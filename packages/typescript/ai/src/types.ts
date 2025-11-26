import { CommonOptions } from "./core/chat-common-options";

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

/**
 * Tool/Function definition for function calling.
 *
 * Tools allow the model to interact with external systems, APIs, or perform computations.
 * The model will decide when to call tools based on the user's request and the tool descriptions.
 *
 * @see https://platform.openai.com/docs/guides/function-calling
 * @see https://docs.anthropic.com/claude/docs/tool-use
 */
export interface Tool {
  /**
   * Type of tool - currently only "function" is supported.
   *
   * Future versions may support additional tool types.
   */
  type: "function";

  /**
   * Function definition and metadata.
   */
  function: {
    /**
     * Unique name of the function (used by the model to call it).
     *
     * Should be descriptive and follow naming conventions (e.g., snake_case or camelCase).
     * Must be unique within the tools array.
     *
     * @example "get_weather", "search_database", "sendEmail"
     */
    name: string;

    /**
     * Clear description of what the function does.
     *
     * This is crucial - the model uses this to decide when to call the function.
     * Be specific about what the function does, what parameters it needs, and what it returns.
     *
     * @example "Get the current weather in a given location. Returns temperature, conditions, and forecast."
     */
    description: string;

    /**
     * JSON Schema describing the function's parameters.
     *
     * Defines the structure and types of arguments the function accepts.
     * The model will generate arguments matching this schema.
     *
     * @see https://json-schema.org/
     *
     * @example
     * {
     *   type: "object",
     *   properties: {
     *     location: { type: "string", description: "City name or coordinates" },
     *     unit: { type: "string", enum: ["celsius", "fahrenheit"] }
     *   },
     *   required: ["location"]
     * }
     */
    parameters: Record<string, any>;
  };

  /**
   * Optional function to execute when the model calls this tool.
   *
   * If provided, the SDK will automatically execute the function with the model's arguments
   * and feed the result back to the model. This enables autonomous tool use loops.
   *
   * Returns the result as a string (or Promise<string>) to send back to the model.
   *
   * @param args - The arguments parsed from the model's tool call (matches the parameters schema)
   * @returns Result string to send back to the model
   *
   * @example
   * execute: async (args) => {
   *   const weather = await fetchWeather(args.location);
   *   return JSON.stringify(weather);
   * }
   */
  execute?: (args: any) => Promise<string> | string;
  /** If true, tool execution requires user approval before running. Works with both server and client tools. */
  needsApproval?: boolean;

  metadata?: Record<string, any>;
}

export interface ToolConfig {
  [key: string]: Tool;
}

/**
 * Structured output format specification.
 *
 * Constrains the model's output to match a specific JSON structure.
 * Useful for extracting structured data, form filling, or ensuring consistent response formats.
 *
 * @see https://platform.openai.com/docs/guides/structured-outputs
 * @see https://sdk.vercel.ai/docs/ai-sdk-core/structured-outputs
 *
 * @template TData - TypeScript type of the expected data structure (for type safety)
 */
export interface ResponseFormat<TData = any> {
  /**
   * Type of structured output.
   *
   * - "json_object": Forces the model to output valid JSON (any structure)
   * - "json_schema": Validates output against a provided JSON Schema (strict structure)
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-response_format
   */
  type: "json_object" | "json_schema";

  /**
   * JSON schema specification (required when type is "json_schema").
   *
   * Defines the exact structure the model's output must conform to.
   * OpenAI's structured outputs will guarantee the output matches this schema.
   */
  json_schema?: {
    /**
     * Unique name for the schema.
     *
     * Used to identify the schema in logs and debugging.
     * Should be descriptive (e.g., "user_profile", "search_results").
     */
    name: string;

    /**
     * Optional description of what the schema represents.
     *
     * Helps document the purpose of this structured output.
     *
     * @example "User profile information including name, email, and preferences"
     */
    description?: string;

    /**
     * JSON Schema definition for the expected output structure.
     *
     * Must be a valid JSON Schema (draft 2020-12 or compatible).
     * The model's output will be validated against this schema.
     *
     * @see https://json-schema.org/
     *
     * @example
     * {
     *   type: "object",
     *   properties: {
     *     name: { type: "string" },
     *     age: { type: "number" },
     *     email: { type: "string", format: "email" }
     *   },
     *   required: ["name", "email"],
     *   additionalProperties: false
     * }
     */
    schema: Record<string, any>;

    /**
     * Whether to enforce strict schema validation.
     *
     * When true (recommended), the model guarantees output will match the schema exactly.
     * When false, the model will "best effort" match the schema.
     *
     * Default: true (for providers that support it)
     *
     * @see https://platform.openai.com/docs/guides/structured-outputs#strict-mode
     */
    strict?: boolean;
  };

  /**
   * Type-only property to carry the inferred data type.
   *
   * This is never set at runtime - it only exists for TypeScript type inference.
   * Allows the SDK to know what type to expect when parsing the response.
   *
   * @internal
   */
  __data?: TData;
}

/**
 * State passed to agent loop strategy for determining whether to continue
 */
export interface AgentLoopState {
  /** Current iteration count (0-indexed) */
  iterationCount: number;
  /** Current messages array */
  messages: ModelMessage[];
  /** Finish reason from the last response */
  finishReason: string | null;
}

/**
 * Strategy function that determines whether the agent loop should continue
 *
 * @param state - Current state of the agent loop
 * @returns true to continue looping, false to stop
 *
 * @example
 * ```typescript
 * // Continue for up to 5 iterations
 * const strategy: AgentLoopStrategy = ({ iterationCount }) => iterationCount < 5;
 * ```
 */
export type AgentLoopStrategy = (state: AgentLoopState) => boolean;

/**
 * Options passed into the SDK and further piped to the AI provider.
 */
export interface ChatOptions<
  TModel extends string = string,
  TProviderOptionsSuperset extends Record<string, any> = Record<string, any>,
  TOutput extends ResponseFormat<any> | undefined = undefined,
  TProviderOptionsForModel = TProviderOptionsSuperset
> {
  model: TModel;
  messages: ModelMessage[];
  tools?: Array<Tool>;
  systemPrompts?: string[];
  agentLoopStrategy?: AgentLoopStrategy;
  options?: CommonOptions;
  providerOptions?: TProviderOptionsForModel;
  request?: Request | RequestInit;
  output?: TOutput;
  /**
   * AbortController for request cancellation.
   *
   * Allows you to cancel an in-progress request using an AbortController.
   * Useful for implementing timeouts or user-initiated cancellations.
   *
   * @example
   * const abortController = new AbortController();
   * setTimeout(() => abortController.abort(), 5000); // Cancel after 5 seconds
   * await chat({ ..., abortController });
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/AbortController
   */
  abortController?: AbortController;
}

export type StreamChunkType =
  | "content"
  | "tool_call"
  | "tool_result"
  | "done"
  | "error"
  | "approval-requested"
  | "tool-input-available"
  | "thinking";

export interface BaseStreamChunk {
  type: StreamChunkType;
  id: string;
  model: string;
  timestamp: number;
}

export interface ContentStreamChunk extends BaseStreamChunk {
  type: "content";
  delta: string; // The incremental content token
  content: string; // Full accumulated content so far
  role?: "assistant";
}

export interface ToolCallStreamChunk extends BaseStreamChunk {
  type: "tool_call";
  toolCall: {
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string; // Incremental JSON arguments
    };
  };
  index: number;
}

export interface ToolResultStreamChunk extends BaseStreamChunk {
  type: "tool_result";
  toolCallId: string;
  content: string;
}

export interface DoneStreamChunk extends BaseStreamChunk {
  type: "done";
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ErrorStreamChunk extends BaseStreamChunk {
  type: "error";
  error: {
    message: string;
    code?: string;
  };
}

export interface ApprovalRequestedStreamChunk extends BaseStreamChunk {
  type: "approval-requested";
  toolCallId: string;
  toolName: string;
  input: any;
  approval: {
    id: string;
    needsApproval: true;
  };
}

export interface ToolInputAvailableStreamChunk extends BaseStreamChunk {
  type: "tool-input-available";
  toolCallId: string;
  toolName: string;
  input: any;
}

export interface ThinkingStreamChunk extends BaseStreamChunk {
  type: "thinking";
  delta?: string; // The incremental thinking token
  content: string; // Full accumulated thinking content so far
}

/**
 * Chunk returned by the sdk during streaming chat completions.
 */
export type StreamChunk =
  | ContentStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolInputAvailableStreamChunk
  | ThinkingStreamChunk;

// Simple streaming format for basic chat completions
// Converted to StreamChunk format by convertChatCompletionStream()
export interface ChatCompletionChunk {
  id: string;
  model: string;
  content: string;
  role?: "assistant";
  finishReason?: "stop" | "length" | "content_filter" | null;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}




export interface SummarizationOptions {
  model: string;
  text: string;
  maxLength?: number;
  style?: "bullet-points" | "paragraph" | "concise";
  focus?: string[];
}

export interface SummarizationResult {
  id: string;
  model: string;
  summary: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface EmbeddingOptions {
  model: string;
  input: string | string[];
  dimensions?: number;
}

export interface EmbeddingResult {
  id: string;
  model: string;
  embeddings: number[][];
  usage: {
    promptTokens: number;
    totalTokens: number;
  };
}


/**
 * AI adapter interface with support for endpoint-specific models and provider options.
 *
 * Generic parameters:
 * - TChatModels: Models that support chat/text completion
 * - TImageModels: Models that support image generation
 * - TEmbeddingModels: Models that support embeddings
 * - TAudioModels: Models that support audio (transcription and text-to-speech)
 * - TVideoModels: Models that support video generation
 * - TChatProviderOptions: Provider-specific options for chat endpoint
 * - TImageProviderOptions: Provider-specific options for image endpoint
 * - TEmbeddingProviderOptions: Provider-specific options for embedding endpoint
 * - TAudioProviderOptions: Provider-specific options for audio endpoint
 * - TVideoProviderOptions: Provider-specific options for video endpoint
 */
export interface AIAdapter<
  TChatModels extends readonly string[] = readonly string[],
  TEmbeddingModels extends readonly string[] = readonly string[],
  TChatProviderOptions extends Record<string, any> = Record<string, any>,
  TEmbeddingProviderOptions extends Record<string, any> = Record<string, any>,
  TModelProviderOptionsByName extends Record<string, any> = Record<string, any>
> {
  name: string;
  /** Models that support chat/text completion */
  models: TChatModels;

  /** Models that support embeddings */
  embeddingModels?: TEmbeddingModels;

  // Type-only properties for provider options inference
  _providerOptions?: TChatProviderOptions; // Alias for _chatProviderOptions
  _chatProviderOptions?: TChatProviderOptions;
  _embeddingProviderOptions?: TEmbeddingProviderOptions;
  /**
   * Type-only map from model name to its specific provider options.
   * Used by the core AI types to narrow providerOptions based on the selected model.
   * Must be provided by all adapters.
   */
  _modelProviderOptionsByName: TModelProviderOptionsByName;

  // Structured streaming with JSON chunks (supports tool calls and rich content)
  chatStream(
    options: ChatOptions<string, TChatProviderOptions>
  ): AsyncIterable<StreamChunk>;

  // Summarization
  summarize(options: SummarizationOptions): Promise<SummarizationResult>;

  // Embeddings
  createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>;
}

export interface AIAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}


export type ChatStreamOptionsUnion<
  TAdapter extends AIAdapter<any, any, any, any, any>
> = TAdapter extends AIAdapter<
  infer Models,
  any,
  any,
  any,
  infer ModelProviderOptions
>
  ? Models[number] extends infer TModel
  ? TModel extends string
  ? Omit<ChatOptions, "model" | "providerOptions" | "responseFormat"> & {
    adapter: TAdapter;
    model: TModel;
    providerOptions?: TModel extends keyof ModelProviderOptions
    ? ModelProviderOptions[TModel]
    : never;
  }
  : never
  : never
  : never;

// Extract types from adapter (updated to 5 generics)
export type ExtractModelsFromAdapter<T> = T extends AIAdapter<
  infer M,
  any,
  any,
  any,
  any
>
  ? M[number]
  : never;
