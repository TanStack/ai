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

export interface ChatCompletionOptions {
  /** The model to use for chat completion */
  model: string;
  /** Array of messages in the conversation */
  messages: ModelMessage[];
  /** Controls randomness in the output (0-2). Lower values make output more focused and deterministic. */
  temperature?: number;

  /**
   * Maximum number of tokens to generate in the completion.
   *
   * Limits the length of the model's response. The exact behavior varies by provider:
   * - OpenAI: Counts both prompt and completion tokens towards context limit
   * - Anthropic: Separate from input token count
   *
   * Note: One token ≈ 4 characters for English text
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-max_tokens
   * @see https://docs.anthropic.com/claude/reference/messages_post#body-max_tokens
   */
  maxTokens?: number;

  /**
   * Nucleus sampling parameter (0.0-1.0).
   *
   * An alternative to temperature for controlling randomness. The model considers
   * the tokens with top_p probability mass. For example, 0.1 means only tokens
   * comprising the top 10% probability mass are considered.
   *
   * Recommended: Alter either temperature OR top_p, but not both.
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-top_p
   * @see https://docs.anthropic.com/claude/reference/messages_post#body-top_p
   */
  topP?: number;

  /**
   * Penalizes new tokens based on their frequency in the text so far (-2.0 to 2.0).
   *
   * Positive values decrease the model's likelihood of repeating the same line verbatim.
   * - Positive values: Reduce repetition
   * - Negative values: Increase repetition
   * - 0: No penalty (default)
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-frequency_penalty
   * @see https://docs.anthropic.com/claude/reference/messages_post (not directly supported, handled via prompting)
   */
  frequencyPenalty?: number;

  /**
   * Penalizes new tokens based on whether they appear in the text so far (-2.0 to 2.0).
   *
   * Positive values increase the model's likelihood to talk about new topics.
   * - Positive values: Encourage new topics
   * - Negative values: Stay on existing topics
   * - 0: No penalty (default)
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-presence_penalty
   */
  presencePenalty?: number;

  /**
   * Random seed for deterministic generation (integer).
   *
   * When provided, the model will make a best effort to generate the same output
   * for the same inputs. Useful for reproducible results and testing.
   *
   * Note: Determinism is not guaranteed across model versions or providers.
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-seed
   * @see https://github.com/ollama/ollama/blob/main/docs/modelfile.md#parameter (Ollama)
   */
  seed?: number;

  // Control parameters
  /**
   * Sequences where the API will stop generating further tokens.
   *
   * Up to 4 sequences where the model will stop generating. The returned text
   * will not contain the stop sequence.
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-stop
   * @see https://docs.anthropic.com/claude/reference/messages_post#body-stop_sequences
   */
  stopSequences?: string[];

  /**
   * Whether to stream the response incrementally using Server-Sent Events (SSE).
   *
   * When true, tokens are sent as they're generated rather than waiting for completion.
   * Useful for providing real-time feedback in chat interfaces.
   *
   * Default: false
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-stream
   * @see https://docs.anthropic.com/claude/reference/messages-streaming
   */
  stream?: boolean;

  // Tool/Function calling
  /**
   * Array of tools/functions that the model can call.
   *
   * Tools allow the model to interact with external APIs and perform actions.
   * Each tool must have a unique name and a JSON Schema describing its parameters.
   *
   * @see https://platform.openai.com/docs/guides/function-calling
   * @see https://docs.anthropic.com/claude/docs/tool-use
   */
  tools?: Tool[];

  /**
   * Controls which (if any) tool is called by the model.
   *
   * Options:
   * - "auto": Model decides whether to call a tool and which one (default)
   * - "none": Model will not call any tools
   * - "required": Model must call at least one tool
   * - Object: Forces the model to call a specific tool
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-tool_choice
   * @see https://docs.anthropic.com/claude/docs/tool-use#controlling-claudes-output
   */
  toolChoice?:
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };
  /** Structured output format specification. Use with responseFormat() helper for type-safe outputs. */
  responseFormat?: ResponseFormat;
  /** Strategy for determining when to stop the agent loop. Defaults to maxIterations(5) */
  agentLoopStrategy?: AgentLoopStrategy;
  /** Additional metadata to attach to the request */
  metadata?: Record<string, any>;

  /**
   * Unique identifier for the end-user.
   *
   * Used for abuse monitoring and tracking. Can help providers detect and prevent abuse.
   * Should be a unique identifier for your end-user (not your app's API key).
   *
   * @see https://platform.openai.com/docs/api-reference/chat/create#chat-create-user
   */
  user?: string;

  /**
   * AbortSignal for request cancellation.
   *
   * Allows you to cancel an in-progress request using an AbortController.
   * Useful for implementing timeouts or user-initiated cancellations.
   *
   * @example
   * const controller = new AbortController();
   * setTimeout(() => controller.abort(), 5000); // Cancel after 5 seconds
   * await chat({ ..., abortSignal: controller.signal });
   *
   * @see https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal
   */
  abortSignal?: AbortSignal;

  /**
   * Custom HTTP headers to include in the request.
   *
   * Useful for adding authorization, tracking, or custom headers required by proxies.
   *
   * @example
   * headers: { "X-Custom-Header": "value" }
   */
  headers?: Record<string, string>;

  /**
   * Provider-specific options that don't fit into common options.
   *
   * Each provider has unique features (e.g., OpenAI's store, Anthropic's thinking).
   * These are strongly typed when using a specific adapter.
   *
   * @see OpenAIChatProviderOptions for OpenAI-specific options
   * @see AnthropicProviderOptions for Anthropic-specific options
   * @see OllamaProviderOptions for Ollama-specific options
   * @see GeminiProviderOptions for Gemini-specific options
   */
  providerOptions?: Record<string, any>;
}

export type StreamChunkType =
  | "content"
  | "tool_call"
  | "tool_result"
  | "done"
  | "error"
  | "approval-requested"
  | "tool-input-available";

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

export type StreamChunk =
  | ContentStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk
  | ApprovalRequestedStreamChunk
  | ToolInputAvailableStreamChunk;

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

export interface ChatCompletionResult<TData = never> {
  id: string;
  model: string;
  content: string | null;
  role: "assistant";
  finishReason: "stop" | "length" | "content_filter" | "tool_calls" | null;
  toolCalls?: ToolCall[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  data?: TData;
}

export interface TextGenerationOptions {
  model: string;
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stopSequences?: string[];
  stream?: boolean;
  /** Provider-specific options (e.g., { openai: OpenAIProviderOptions }) */
  providerOptions?: Record<string, any>;
}

export interface TextGenerationResult {
  id: string;
  model: string;
  text: string;
  finishReason: "stop" | "length" | null;
  usage: {
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

export interface ImageGenerationOptions {
  model: string;
  prompt: string;
  /** Number of images to generate (default: 1) */
  n?: number;
  /** Image size in format "widthxheight" (e.g., "1024x1024") */
  size?: string;
  /** Aspect ratio in format "width:height" (e.g., "16:9") */
  aspectRatio?: string;
  /** Seed for reproducible generation */
  seed?: number;
  /** Maximum images per API call (for batching) */
  maxImagesPerCall?: number;
  /** Provider-specific options */
  providerOptions?: Record<string, any>;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** Custom headers */
  headers?: Record<string, string>;
}

export interface ImageData {
  /** Base64-encoded image data */
  base64: string;
  /** Binary image data */
  uint8Array: Uint8Array;
  /** MIME type of the image */
  mediaType: string;
}

export interface ImageGenerationResult {
  /** Generated image (when n=1) */
  image?: ImageData;
  /** Generated images (when n>1) */
  images?: ImageData[];
  /** Warnings from the provider */
  warnings?: string[];
  /** Provider-specific metadata */
  providerMetadata?: Record<string, any>;
  /** Response metadata */
  response?: {
    id: string;
    model: string;
    timestamp: number;
  };
}

// Audio transcription types
export interface AudioTranscriptionOptions {
  model: string;
  /** Audio file to transcribe (File, Blob, or Buffer) */
  file: File | Blob | Buffer;
  /** Optional prompt to guide the transcription */
  prompt?: string;
  /** Response format (json, text, srt, verbose_json, vtt, diarized_json) */
  responseFormat?: string;
  /** Temperature for sampling (0-1) */
  temperature?: number;
  /** Language of the audio (ISO-639-1 code) */
  language?: string;
  /** Provider-specific options */
  providerOptions?: Record<string, any>;
}

export interface AudioTranscriptionResult {
  id: string;
  model: string;
  /** Transcribed text */
  text: string;
  /** Language detected (if applicable) */
  language?: string;
  /** Duration in seconds */
  duration?: number;
  /** Segments with timestamps (if requested) */
  segments?: Array<{
    id: number;
    start: number;
    end: number;
    text: string;
    /** Speaker label (if diarization enabled) */
    speaker?: string;
    /** Words with timestamps */
    words?: Array<{
      word: string;
      start: number;
      end: number;
    }>;
  }>;
  /** Log probabilities (if requested) */
  logprobs?: Array<{
    token: string;
    logprob: number;
  }>;
}

// Text-to-speech types
export interface TextToSpeechOptions {
  model: string;
  /** Text to convert to speech */
  input: string;
  /** Voice to use (alloy, echo, fable, onyx, nova, shimmer, etc.) */
  voice: string;
  /** Audio format (mp3, opus, aac, flac, wav, pcm) */
  responseFormat?: string;
  /** Speed of the generated audio (0.25 to 4.0) */
  speed?: number;
  /** Provider-specific options */
  providerOptions?: Record<string, any>;
}

export interface TextToSpeechResult {
  id: string;
  model: string;
  /** Audio data as Buffer or Blob */
  audio: Buffer | Blob;
  /** Audio format */
  format: string;
  /** Duration in seconds (if available) */
  duration?: number;
}

// Video generation types
export interface VideoGenerationOptions {
  model: string;
  /** Text prompt describing the video */
  prompt: string;
  /** Number of seconds (duration) */
  duration?: number;
  /** Video resolution (e.g., "1920x1080", "1280x720") */
  resolution?: string;
  /** Frame rate (fps) */
  fps?: number;
  /** Seed for reproducible generation */
  seed?: number;
  /** Provider-specific options */
  providerOptions?: Record<string, any>;
}

export interface VideoGenerationResult {
  id: string;
  model: string;
  /** Video data as Buffer or Blob */
  video: Buffer | Blob;
  /** Video format (mp4, webm, etc.) */
  format: string;
  /** Duration in seconds */
  duration?: number;
  /** Video resolution */
  resolution?: string;
  /** Thumbnail as base64 (if available) */
  thumbnail?: string;
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
  TImageModels extends readonly string[] = readonly string[],
  TEmbeddingModels extends readonly string[] = readonly string[],
  TAudioModels extends readonly string[] = readonly string[],
  TVideoModels extends readonly string[] = readonly string[],
  TChatProviderOptions extends Record<string, any> = Record<string, any>,
  TImageProviderOptions extends Record<string, any> = Record<string, any>,
  TEmbeddingProviderOptions extends Record<string, any> = Record<string, any>,
  TAudioProviderOptions extends Record<string, any> = Record<string, any>,
  TVideoProviderOptions extends Record<string, any> = Record<string, any>
> {
  name: string;
  /** Models that support chat/text completion */
  models: TChatModels;
  /** Models that support image generation */
  imageModels?: TImageModels;
  /** Models that support embeddings */
  embeddingModels?: TEmbeddingModels;
  /** Models that support audio (transcription and text-to-speech) */
  audioModels?: TAudioModels;
  /** Models that support video generation */
  videoModels?: TVideoModels;

  // Type-only properties for provider options inference
  _providerOptions?: TChatProviderOptions; // Alias for _chatProviderOptions
  _chatProviderOptions?: TChatProviderOptions;
  _imageProviderOptions?: TImageProviderOptions;
  _embeddingProviderOptions?: TEmbeddingProviderOptions;
  _audioProviderOptions?: TAudioProviderOptions;
  _videoProviderOptions?: TVideoProviderOptions;

  // Chat methods
  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;

  // Simple streaming (returns ChatCompletionChunk - text only, no tool calls)
  chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk>;

  // Structured streaming with JSON chunks (supports tool calls and rich content)
  chatStream(options: ChatCompletionOptions): AsyncIterable<StreamChunk>;

  // Text generation methods
  generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;
  generateTextStream(options: TextGenerationOptions): AsyncIterable<string>;

  // Summarization
  summarize(options: SummarizationOptions): Promise<SummarizationResult>;

  // Embeddings
  createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>;

  // Image generation (optional)
  generateImage?(
    options: ImageGenerationOptions
  ): Promise<ImageGenerationResult>;

  // Audio transcription (optional)
  transcribeAudio?(
    options: AudioTranscriptionOptions
  ): Promise<AudioTranscriptionResult>;

  // Text-to-speech (optional)
  generateSpeech?(options: TextToSpeechOptions): Promise<TextToSpeechResult>;

  // Video generation (optional)
  generateVideo?(
    options: VideoGenerationOptions
  ): Promise<VideoGenerationResult>;
}

export interface AIAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}


export interface ModelMeta {
  name: string;
  supports: {
    input: ("text" | "image" | "audio" | "video")[];
    output: ("text" | "image" | "audio" | "video")[];
    endpoints: ("chat" | "chat-completions" | "assistants" | "speech_generation" | "image-generation" | "fine-tuning" | "batch" | "image-edit" | "moderation" | "translation" | "realtime" | "embedding" | "audio" | "video" | "transcription")[];
    features: ("streaming" | "function_calling" | "structured_outputs" | "predicted_outcomes" | "distillation" | "fine_tuning")[];
    tools?: ("web_search" | "file_search" | "image_generation" | "code_interpreter" | "mcp" | "computer_use")[];
  };
  context_window?: number;
  max_output_tokens?: number;
  knowledge_cutoff?: string;
  pricing: {
    input: {
      normal: number;
      cached?: number;
    };
    output: {
      normal: number;
    };
  };
}