export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string; // JSON string
  };
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Tool {
  /** Always "function" - indicates this is a function tool */
  type: "function";
  /** Function definition and metadata */
  function: {
    /** Unique name of the function (used by the model to call it) */
    name: string;
    /** Clear description of what the function does (helps the model decide when to use it) */
    description: string;
    /** JSON Schema describing the function's parameters */
    parameters: Record<string, any>;
  };
  /** Optional function to execute when the model calls this tool. Returns the result as a string. */
  execute?: (args: any) => Promise<string> | string;
}

export interface ToolConfig {
  [key: string]: Tool
}

export interface ResponseFormat<TData = any> {
  /** Type of structured output: "json_object" for any JSON or "json_schema" for schema-validated JSON */
  type: "json_object" | "json_schema";
  /** JSON schema specification (required when type is "json_schema") */
  json_schema?: {
    /** Unique name for the schema */
    name: string;
    /** Optional description of what the schema represents */
    description?: string;
    /** JSON Schema definition for the expected output structure */
    schema: Record<string, any>;
    /** Whether to enforce strict schema validation (recommended: true) */
    strict?: boolean;
  };
  // Type-only property to carry the inferred data type
  __data?: TData;
}

export interface ChatCompletionOptions {
  /** The model to use for chat completion */
  model: string;
  /** Array of messages in the conversation */
  messages: Message[];
  /** Controls randomness in the output (0-2). Lower values make output more focused and deterministic. */
  temperature?: number;
  /** Maximum number of tokens to generate in the completion */
  maxTokens?: number;
  /** Nucleus sampling parameter (0-1). Alternative to temperature for controlling randomness. */
  topP?: number;
  /** Penalizes new tokens based on their frequency in the text so far (-2.0 to 2.0). Positive values decrease repetition. */
  frequencyPenalty?: number;
  /** Penalizes new tokens based on whether they appear in the text so far (-2.0 to 2.0). Positive values encourage new topics. */
  presencePenalty?: number;
  /** Up to 4 sequences where the API will stop generating further tokens */
  stopSequences?: string[];
  /** Whether to stream the response incrementally */
  stream?: boolean;
  /** Array of tools/functions that the model can call */
  tools?: Tool[];
  /** Controls which (if any) tool is called. Can be "auto", "none", or specify a particular function */
  toolChoice?:
  | "auto"
  | "none"
  | { type: "function"; function: { name: string } };
  /** Structured output format specification. Use with responseFormat() helper for type-safe outputs. */
  responseFormat?: ResponseFormat;
  /** Maximum number of automatic tool execution iterations (default: 5) */
  maxIterations?: number;
  /** Additional metadata to attach to the request */
  metadata?: Record<string, any>;
  /** Provider-specific options (e.g., OpenAI's store, parallel_tool_calls, etc.) */
  providerOptions?: Record<string, any>;
}

export type StreamChunkType = "content" | "tool_call" | "tool_result" | "done" | "error";

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

export type StreamChunk =
  | ContentStreamChunk
  | ToolCallStreamChunk
  | ToolResultStreamChunk
  | DoneStreamChunk
  | ErrorStreamChunk;

// Legacy support - keep for backwards compatibility
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
  _providerOptions?: TChatProviderOptions; // Legacy - same as _chatProviderOptions
  _chatProviderOptions?: TChatProviderOptions;
  _imageProviderOptions?: TImageProviderOptions;
  _embeddingProviderOptions?: TEmbeddingProviderOptions;
  _audioProviderOptions?: TAudioProviderOptions;
  _videoProviderOptions?: TVideoProviderOptions;

  // Chat methods
  chatCompletion(options: ChatCompletionOptions): Promise<ChatCompletionResult>;

  // Legacy streaming (kept for backwards compatibility)
  chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk>;

  // New structured streaming with JSON chunks
  chatStream(options: ChatCompletionOptions): AsyncIterable<StreamChunk>;

  // Text generation methods
  generateText(options: TextGenerationOptions): Promise<TextGenerationResult>;
  generateTextStream(options: TextGenerationOptions): AsyncIterable<string>;

  // Summarization
  summarize(options: SummarizationOptions): Promise<SummarizationResult>;

  // Embeddings
  createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult>;

  // Image generation (optional)
  generateImage?(options: ImageGenerationOptions): Promise<ImageGenerationResult>;

  // Audio transcription (optional)
  transcribeAudio?(options: AudioTranscriptionOptions): Promise<AudioTranscriptionResult>;

  // Text-to-speech (optional)
  generateSpeech?(options: TextToSpeechOptions): Promise<TextToSpeechResult>;

  // Video generation (optional)
  generateVideo?(options: VideoGenerationOptions): Promise<VideoGenerationResult>;
}

export interface AIAdapterConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
  headers?: Record<string, string>;
}
