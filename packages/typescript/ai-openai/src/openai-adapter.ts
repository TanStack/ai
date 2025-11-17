import OpenAI_SDK from "openai";
import {
  BaseAdapter,
  type ChatCompletionOptions,
  type ChatCompletionResult,
  type ChatCompletionChunk,
  type TextGenerationOptions,
  type TextGenerationResult,
  type SummarizationOptions,
  type SummarizationResult,
  type EmbeddingOptions,
  type EmbeddingResult,
  type ImageGenerationOptions,
  type ImageGenerationResult,
  type ImageData,
} from "@tanstack/ai";

export interface OpenAIConfig {
  apiKey: string;
  organization?: string;
  baseURL?: string;
}

// Chat/text completion models (from OpenAI docs - platform.openai.com/docs/models)
const OPENAI_CHAT_MODELS = [
  // Frontier models
  "gpt-5",
  "gpt-5-mini",
  "gpt-5-nano",
  "gpt-5-pro",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
  // Open-weight models
  "gpt-oss-120b",
  "gpt-oss-20b",
  // Reasoning models
  "o3",
  "o3-pro",
  "o3-mini",
  "o4-mini",
  "o3-deep-research",
  "o4-mini-deep-research",
  // Legacy and previous generation
  "gpt-4",
  "gpt-4-turbo",
  "gpt-4-turbo-preview",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-3.5-turbo",
  // Audio-enabled chat models
  "gpt-audio",
  "gpt-audio-mini",
  "gpt-4o-audio-preview",
  "gpt-4o-mini-audio-preview",
  // Realtime models
  "gpt-realtime",
  "gpt-realtime-mini",
  "gpt-4o-realtime-preview",
  "gpt-4o-mini-realtime-preview",
  // ChatGPT models
  "gpt-5-chat-latest",
  "chatgpt-4o-latest",
  // Specialized
  "gpt-5-codex",
  "codex-mini-latest",
  // Preview models
  "gpt-4o-search-preview",
  "gpt-4o-mini-search-preview",
  "computer-use-preview",
  // Legacy reasoning (deprecated but still available)
  "o1",
  "o1-mini",
  "o1-preview",
  // Legacy base models
  "davinci-002",
  "babbage-002",
] as const;

// Image generation models (from OpenAI docs)
const OPENAI_IMAGE_MODELS = [
  "gpt-image-1",
  "gpt-image-1-mini",
  "dall-e-3",
  "dall-e-2",
] as const;

// Embedding models (from OpenAI docs)
const OPENAI_EMBEDDING_MODELS = [
  "text-embedding-3-large",
  "text-embedding-3-small",
  "text-embedding-ada-002",
] as const;

// Audio models (transcription and text-to-speech)
const OPENAI_AUDIO_MODELS = [
  // Transcription models
  "whisper-1",
  "gpt-4o-transcribe",
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe-diarize",
  // Text-to-speech models
  "tts-1",
  "tts-1-hd",
  "gpt-4o-mini-tts",
] as const;

// Video generation models (from OpenAI docs)
const OPENAI_VIDEO_MODELS = [
  "sora-2",
  "sora-2-pro",
] as const;

export type OpenAIChatModel = (typeof OPENAI_CHAT_MODELS)[number];
export type OpenAIImageModel = (typeof OPENAI_IMAGE_MODELS)[number];
export type OpenAIEmbeddingModel = (typeof OPENAI_EMBEDDING_MODELS)[number];
export type OpenAIAudioModel = (typeof OPENAI_AUDIO_MODELS)[number];
export type OpenAIVideoModel = (typeof OPENAI_VIDEO_MODELS)[number];
/**
 * Options your SDK forwards to OpenAI when doing chat/responses.
 * Tip: gate these by model capability in your SDK, not just by presence.
 */
export type ProviderOptions = {
  /**

Whether to run the model response in the background. Learn more here:
https://platform.openai.com/docs/api-reference/responses/create#responses_create-background
 @default false
   */
  background?: boolean;
  /**
   * The conversation that this response belongs to. Items from this conversation are prepended to input_items for this response request. Input items and output items from this response are automatically added to this conversation after this response completes.
   * 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-conversation
   */
  conversation?: string | { id: string }
  /**
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-include
   Specify additional output data to include in the model response. Currently supported values are:
  
  web_search_call.action.sources: Include the sources of the web search tool call.
  code_interpreter_call.outputs: Includes the outputs of python code execution in code interpreter tool call items.
  computer_call_output.output.image_url: Include image urls from the computer call output.
  file_search_call.results: Include the search results of the file search tool call.
  message.input_image.image_url: Include image urls from the input message.
  message.output_text.logprobs: Include logprobs with assistant messages.
  reasoning.encrypted_content: Includes an encrypted version of reasoning tokens in reasoning item outputs. This enables reasoning items to be used in multi-turn conversations when using the Responses API statelessly (like when the store parameter is set to false, or when an organization is enrolled in the zero data retention program).
  */
  include?: ("web_search_call.action.sources" |
    "code_interpreter_call.outputs" |
    "computer_call_output.output.image_url" |
    "file_search_call.results" |
    "message.input_image.image_url" |
    "message.output_text.logprobs" |
    "reasoning.encrypted_content")[];
  /**
   * A system (or developer) message inserted into the model's context.

When using along with previous_response_id, the instructions from a previous response will not be carried over to the next response. This makes it simple to swap out system (or developer) messages in new responses.
https://platform.openai.com/docs/api-reference/responses/create#responses_create-instructions
   */
  instructions?: string;
  /**
  * An upper bound for the number of tokens that can be generated for a response, including visible output tokens and reasoning tokens.
  * (Responses API name: max_output_tokens)
  * https://platform.openai.com/docs/api-reference/responses/create#responses_create-max_output_tokens
  */
  max_output_tokens?: number;
  /**
   * The maximum number of total calls to built-in tools that can be processed in a response. This maximum number applies across all built-in tool calls, not per individual tool. Any further attempts to call a tool by the model will be ignored.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-max_tool_calls
   */
  max_tool_calls?: number;

  /**
   * Set of 16 key-value pairs that can be attached to an object. This can be useful for storing additional information about the object in a structured format, and querying for objects via API or the dashboard.

Keys are strings with a maximum length of 64 characters. Values are strings with a maximum length of 512 characters.
https://platform.openai.com/docs/api-reference/responses/create#responses_create-metadata
   */
  metadata?: Record<string, string>;
  /**
    * The model name (e.g. "gpt-4o", "gpt-5", "gpt-4.1-mini", etc).
    * https://platform.openai.com/docs/api-reference/responses/create#responses_create-model
  */
  model: string;
  /**
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-parallel_tool_calls
  * Whether to allow the model to run tool calls in parallel.
  * @default true
   */
  parallel_tool_calls?: boolean;

  /**
   * The unique ID of the previous response to the model. Use this to create multi-turn conversations. Cannot be used in conjunction with conversation.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-previous_response_id
  */
  previous_response_id?: string;
  /**
   * Reference to a prompt template and its variables. 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-prompt
   */
  prompt?: {
    /**
     * Unique identifier of your prompt, found in the dashboard
     */
    id: string,
    /**
     * A specific version of your prompt (defaults to the "current" version as specified in the dashboard)
     */
    version?: string,
    /**
     * A map of values to substitute in for variables in your prompt. The substitution values can either be strings, or other Response input message types like input_image or input_file
     */
    variables?: Record<string, any>;
  }
  /**
   * Used by OpenAI to cache responses for similar requests to optimize your cache hit rates. Replaces the user field. 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-prompt_cache_key
   */
  prompt_cache_key?: string;

  /**
   * The retention policy for the prompt cache. Set to 24h to enable extended prompt caching, which keeps cached prefixes active for longer, up to a maximum of 24 hours
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-prompt_cache_retention
   */
  prompt_cache_retention?: "in-memory" | "24h";

  /**
  * Reasoning controls for models that support it.
  * Lets you guide how much chain-of-thought computation to spend.
  * https://platform.openai.com/docs/api-reference/responses/create#responses_create-reasoning
  * https://platform.openai.com/docs/guides/reasoning
   */
  reasoning?: {
    /**
     * gpt-5.1 defaults to none, which does not perform reasoning. The supported reasoning values for gpt-5.1 are none, low, medium, and high. Tool calls are supported for all reasoning values in gpt-5.1.
All models before gpt-5.1 default to medium reasoning effort, and do not support none.
The gpt-5-pro model defaults to (and only supports) high reasoning effort.
     */
    effort?: "none" | "minimal" | "low" | "medium" | "high";
  };
  /**
   * A summary of the reasoning performed by the model. This can be useful for debugging and understanding the model's reasoning process
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-reasoning-summary
   */
  summary?: "auto" | "concise" | "detailed";
  /**
     * A stable identifier used to help detect users of your application that may be violating OpenAI's usage policies. The IDs should be a string that uniquely identifies each user. 
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-safety_identifier
     */
  safety_identifier?: string;


  /**
   * Specifies the processing type used for serving the request.

If set to 'auto', then the request will be processed with the service tier configured in the Project settings. Unless otherwise configured, the Project will use 'default'.
If set to 'default', then the request will be processed with the standard pricing and performance for the selected model.
If set to 'flex' or 'priority', then the request will be processed with the corresponding service tier.
When not set, the default behavior is 'auto'.
When the service_tier parameter is set, the response body will include the service_tier value based on the processing mode actually used to serve the request. This response value may be different from the value set in the parameter.

https://platform.openai.com/docs/api-reference/responses/create#responses_create-service_tier
@default 'auto'
   */
  service_tier?: "auto" | "default" | "flex" | "priority";

  /**
     * Whether to store the generated model response for later retrieval via API.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-store
     * @default true
     */
  store?: boolean;
  /**
   * If set to true, the model response data will be streamed to the client as it is generated using server-sent events. 
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-stream
   * @default false
   */
  stream?: boolean;
  /**
   * Options for streaming responses. Only set this when you set stream: true
   */
  stream_options?: {
    /**
     * When true, stream obfuscation will be enabled. Stream obfuscation adds random characters to an obfuscation field on streaming delta events to normalize payload sizes as a mitigation to certain side-channel attacks. These obfuscation fields are included by default, but add a small amount of overhead to the data stream. You can set include_obfuscation to false to optimize for bandwidth if you trust the network links between your application and the OpenAI API.
     */
    include_obfuscation?: boolean;
  };

  /**
   *  What sampling temperature to use, between 0 and 2. Higher values like 0.8 will make the output more random, while lower values like 0.2 will make it more focused and deterministic. We generally recommend altering this or top_p but not both.
   * https://platform.openai.com/docs/api-reference/responses/create#responses_create-temperature
   */
  temperature?: number;

  /**
   * Configuration options for a text response from the model. Can be plain text or structured JSON data. Learn more:
  https://platform.openai.com/docs/api-reference/responses/create#responses_create-text
   */
  text?: {
    format?: {
      type: "text"
    } | {
      type: "json_schema";
      json_schema: {
        name: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
    };
    /**
     * Constrains the verbosity of the model's response. Lower values will result in more concise responses, while higher values will result in more verbose responses.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-text-verbosity
     */
    verbosity?: "low" | "medium" | "high";
    /**
     * An integer between 0 and 20 specifying the number of most likely tokens to return at each token position, each with an associated log probability.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-top_logprobs
     */
    top_logprobs?: number;
    /**
     * An alternative to sampling with temperature, called nucleus sampling, where the model considers the results of the tokens with top_p probability mass. So 0.1 means only the tokens comprising the top 10% probability mass are considered.
     * https://platform.openai.com/docs/api-reference/responses/create#responses_create-top_p
     */
    top_p?: number;
    /**
     * The truncation strategy to use for the model response.
    
    auto: If the input to this Response exceeds the model's context window size, the model will truncate the response to fit the context window by dropping items from the beginning of the conversation.
    disabled (default): If the input size will exceed the context window size for a model, the request will fail with a 400 error.
     */
    truncation?: "auto" | "disabled";
    /**
         * Tools the model may call (functions, web_search, etc).
         * Function tool example:
         *   { type: "function", function: { name, description?, parameters: JSONSchema } }
         * https://platform.openai.com/docs/guides/tools/tool-choice
         * https://platform.openai.com/docs/guides/tools-web-search
         */
    tools?: Array<
      | {
        type: "function";
        function: {
          name: string;
          description?: string;
          parameters: Record<string, unknown>; // JSON Schema
        };
      }
      | {
        // Example of a built-in tool. Adjust to the exact shape you expose.
        type: "web_search";
        // provider/tool-specific options...
        [k: string]: unknown;
      }
    >;
    // END of text generation options

    /**
     * Stop sequences—if any are generated, the model will stop.
     * https://platform.openai.com/docs/guides/text
     */
    stop?: string | string[];

    /**
     * Frequency penalty reduces repeated tokens.
     * https://platform.openai.com/docs/guides/text
     */
    frequency_penalty?: number;

    /**
     * Presence penalty encourages novel tokens/topics.
     * https://platform.openai.com/docs/guides/text
     */
    presence_penalty?: number;

    /**
     * Make outputs more reproducible. Use with system_fingerprint in responses.
     * https://platform.openai.com/docs/advanced-usage/reproducible-outputs
     */
    seed?: number;

    /**
     * Request structured JSON with a JSON Schema (a.k.a. Structured Outputs).
     * Example:
     *   { type: "json_schema", json_schema: { name: "...", schema: {...}, strict: true } }
     * Or plain text:
     *   { type: "text" }
     * https://platform.openai.com/docs/guides/structured-outputs/examples
     */
    response_format?:
    | { type: "text" }
    | {
      type: "json_schema";
      json_schema: {
        name: string;
        schema: Record<string, unknown>;
        strict?: boolean;
      };
    };

    /**
     * Function/tool calling configuration. Supply tool schemas in `tools`
     * and control selection here:
     *  - "auto" | "none" | "required"
     *  - { type: "tool", tool_name: string } (or model-specific shape)
     * https://platform.openai.com/docs/guides/tools/tool-choice
     * https://platform.openai.com/docs/api-reference/introduction (tools array)
     */
    tool_choice?:
    | "auto"
    | "none"
    | "required"
    | { type: "tool"; tool_name: string };









  };
}
const validateConversationAndPreviousResponseId = (
  conversation: ProviderOptions["conversation"],
  previousResponseId: ProviderOptions["previous_response_id"]
) => {
  if (conversation && previousResponseId) {
    throw new Error(
      "Cannot use both 'conversation' and 'previous_response_id' in the same request."
    );
  }
};

const validateMetadata = (metadata: ProviderOptions["metadata"]) => {
  const tooManyKeys = metadata && Object.keys(metadata).length > 16;
  if (tooManyKeys) {
    throw new Error("Metadata cannot have more than 16 key-value pairs.");
  }
  const keyTooLong = metadata && Object.keys(metadata).some(key => key.length > 64);
  if (keyTooLong) {
    throw new Error("Metadata keys cannot be longer than 64 characters.");
  }
  const valueTooLong = metadata && Object.values(metadata).some(value => value.length > 512);
  if (valueTooLong) {
    throw new Error("Metadata values cannot be longer than 512 characters.");
  }
};
/**
 * OpenAI-specific provider options for chat/text generation
 * Based on OpenAI Chat Completions API documentation
 * @see https://platform.openai.com/docs/api-reference/chat/create
 */
export interface OpenAIChatProviderOptions {
  // Storage and tracking
  /** Whether to store the generation. Defaults to false */
  store?: boolean;

  // Advanced features
  /** Modifies likelihood of specific tokens appearing (token_id: bias from -100 to 100) */
  logitBias?: Record<number, number>;
  /** Return log probabilities (true or number for top n logprobs) */
  logprobs?: boolean | number;
  /** Return top_logprobs most likely tokens (0-20) */
  topLogprobs?: number;

  // Reasoning models (o1, o3, o4-mini)
  /** Reasoning effort for reasoning models: 'low' | 'medium' | 'high' */
  reasoningEffort?: 'low' | 'medium' | 'high';
  /** Maximum number of completion tokens for reasoning models */
  maxCompletionTokens?: number;

  // Structured outputs
  /** Whether to use strict JSON schema validation */
  strictJsonSchema?: boolean;

  // Service configuration
  /** Service tier: 'auto' | 'default' */
  serviceTier?: 'auto' | 'default';

  // Prediction/prefill
  /** Parameters for prediction mode (content prefill) */
  prediction?: {
    type: 'content';
    content: string | Array<{ type: 'text'; text: string }>;
  };

  // Audio (for audio-enabled models)
  /** Audio output configuration */
  audio?: {
    voice: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
    format: 'wav' | 'mp3' | 'flac' | 'opus' | 'pcm16';
  };
  /** Voice input for audio-enabled models */
  modalities?: Array<'text' | 'audio'>;

  // Prompt caching (beta)
  /** Cache key for manual prompt caching control */
  promptCacheKey?: string;

  // Safety and moderation
  /** Stable identifier for usage policy violation detection */
  safetyIdentifier?: string;

  // Search (preview feature)
  /** Web search options for search-enabled models */
  webSearchOptions?: {
    enabled?: boolean;
    mode?: 'auto' | 'always' | 'never';
  };

  // Response configuration
  /** Number of completions to generate (default: 1) */
  n?: number;
  /** Whether to stream partial progress as server-sent events */
  streamOptions?: {
    includeUsage?: boolean;
  };
}

/**
 * Maps common options to OpenAI-specific format
 * Handles translation of normalized options to OpenAI's API format
 */
export function mapCommonOptionsToOpenAI(
  options: ChatCompletionOptions,
  providerOpts?: OpenAIChatProviderOptions
): OpenAIChatProviderOptions {
  const requestParams: any = {
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    max_tokens: options.maxTokens,
    top_p: options.topP,
    frequency_penalty: options.frequencyPenalty,
    presence_penalty: options.presencePenalty,
    stop: options.stopSequences,
    stream: options.stream || false,
    seed: options.seed,
  };

  if (options.metadata) {
    requestParams.metadata = options.metadata;
  }

  // Map user identifier (common option)
  if (options.user) {
    requestParams.user = options.user;
  }

  // Map tools if provided
  if (options.tools && options.tools.length > 0) {
    requestParams.tools = options.tools.map((t) => ({
      type: t.type,
      function: {
        name: t.function.name,
        description: t.function.description,
        parameters: t.function.parameters,
        strict: providerOpts?.strictJsonSchema,
      },
    }));

    // Map tool choice
    if (options.toolChoice) {
      if (options.toolChoice === "auto") {
        requestParams.tool_choice = "auto";
      } else if (options.toolChoice === "none") {
        requestParams.tool_choice = "none";
      } else if (options.toolChoice === "required") {
        requestParams.tool_choice = "required";
      } else if (typeof options.toolChoice === "object") {
        requestParams.tool_choice = {
          type: "function",
          function: { name: options.toolChoice.function.name },
        };
      }
    }
  }

  // Map response format
  if (options.responseFormat) {
    if (options.responseFormat.type === "json_object") {
      requestParams.response_format = { type: "json_object" };
    } else if (options.responseFormat.type === "json_schema" && options.responseFormat.json_schema) {
      requestParams.response_format = {
        type: "json_schema",
        json_schema: {
          name: options.responseFormat.json_schema.name,
          description: options.responseFormat.json_schema.description,
          schema: options.responseFormat.json_schema.schema,
          strict: options.responseFormat.json_schema.strict ?? providerOpts?.strictJsonSchema ?? true,
        },
      };
    }
  }

  // Apply OpenAI-specific provider options
  if (providerOpts) {
    // Storage and tracking
    if (providerOpts.store !== undefined) {
      requestParams.store = providerOpts.store;
    }

    // Advanced features
    if (providerOpts.logitBias) {
      requestParams.logit_bias = providerOpts.logitBias;
    }
    if (providerOpts.logprobs !== undefined) {
      if (typeof providerOpts.logprobs === 'boolean') {
        requestParams.logprobs = providerOpts.logprobs;
      } else {
        requestParams.logprobs = true;
        requestParams.top_logprobs = providerOpts.logprobs;
      }
    }
    if (providerOpts.topLogprobs !== undefined) {
      requestParams.top_logprobs = providerOpts.topLogprobs;
    }

    // Reasoning models
    if (providerOpts.reasoningEffort) {
      requestParams.reasoning_effort = providerOpts.reasoningEffort;
    }
    if (providerOpts.maxCompletionTokens) {
      requestParams.max_completion_tokens = providerOpts.maxCompletionTokens;
    }

    // Service configuration
    if (providerOpts.serviceTier) {
      requestParams.service_tier = providerOpts.serviceTier;
    }

    // Prediction/prefill
    if (providerOpts.prediction) {
      requestParams.prediction = providerOpts.prediction;
    }

    // Audio
    if (providerOpts.audio) {
      requestParams.audio = providerOpts.audio;
    }
    if (providerOpts.modalities) {
      requestParams.modalities = providerOpts.modalities;
    }

    // Search
    if (providerOpts.webSearchOptions) {
      requestParams.web_search = providerOpts.webSearchOptions;
    }

    // Response configuration
    if (providerOpts.n) {
      requestParams.n = providerOpts.n;
    }
    if (providerOpts.streamOptions) {
      requestParams.stream_options = providerOpts.streamOptions;
    }
  }

  // Custom headers and abort signal handled at HTTP client level
  if (options.headers) {
    requestParams._headers = options.headers;
  }
  if (options.abortSignal) {
    requestParams._abortSignal = options.abortSignal;
  }

  return requestParams;
}

/**
 * Alias for OpenAIChatProviderOptions
 */
export type OpenAIProviderOptions = OpenAIChatProviderOptions;

/**
 * OpenAI-specific provider options for image generation
 * Based on OpenAI Images API documentation
 * @see https://platform.openai.com/docs/api-reference/images/create
 */
export interface OpenAIImageProviderOptions {
  /** Image quality: 'standard' | 'hd' (dall-e-3, gpt-image-1 only) */
  quality?: 'standard' | 'hd';
  /** Image style: 'natural' | 'vivid' (dall-e-3 only) */
  style?: 'natural' | 'vivid';
  /** Background: 'transparent' | 'opaque' (gpt-image-1 only) */
  background?: 'transparent' | 'opaque';
  /** Output format: 'png' | 'webp' | 'jpeg' (gpt-image-1 only) */
  outputFormat?: 'png' | 'webp' | 'jpeg';
}

/**
 * OpenAI-specific provider options for embeddings
 * Based on OpenAI Embeddings API documentation
 * @see https://platform.openai.com/docs/api-reference/embeddings/create
 */
export interface OpenAIEmbeddingProviderOptions {
  /** Encoding format for embeddings: 'float' | 'base64' */
  encodingFormat?: 'float' | 'base64';
  /** Unique identifier for end-user (for abuse monitoring) */
  user?: string;
}

/**
 * OpenAI-specific provider options for audio transcription
 * Based on OpenAI Audio API documentation
 * @see https://platform.openai.com/docs/api-reference/audio/createTranscription
 */
export interface OpenAIAudioTranscriptionProviderOptions {
  /** Timestamp granularities: 'word' | 'segment' (whisper-1 only) */
  timestampGranularities?: Array<'word' | 'segment'>;
  /** Chunking strategy for long audio (gpt-4o-transcribe-diarize): 'auto' or VAD config */
  chunkingStrategy?: 'auto' | { type: 'vad'; threshold?: number; prefix_padding_ms?: number; silence_duration_ms?: number };
  /** Known speaker names for diarization (gpt-4o-transcribe-diarize) */
  knownSpeakerNames?: string[];
  /** Known speaker reference audio as data URLs (gpt-4o-transcribe-diarize) */
  knownSpeakerReferences?: string[];
  /** Whether to enable streaming (gpt-4o-transcribe, gpt-4o-mini-transcribe only) */
  stream?: boolean;
  /** Include log probabilities (gpt-4o-transcribe, gpt-4o-mini-transcribe only) */
  logprobs?: boolean;
}

/**
 * OpenAI-specific provider options for text-to-speech
 * Based on OpenAI Audio API documentation
 * @see https://platform.openai.com/docs/api-reference/audio/createSpeech
 */
export interface OpenAITextToSpeechProviderOptions {
  // Currently no OpenAI-specific text-to-speech options beyond the common SDK surface.
}

/**
 * Combined audio provider options (transcription + text-to-speech)
 */
export type OpenAIAudioProviderOptions = OpenAIAudioTranscriptionProviderOptions & OpenAITextToSpeechProviderOptions;

/**
 * OpenAI-specific provider options for video generation
 * Based on OpenAI Video API documentation
 * @see https://platform.openai.com/docs/guides/video-generation
 */
export interface OpenAIVideoProviderOptions {
  /** Input reference image (File, Blob, or Buffer) for first frame */
  inputReference?: File | Blob | Buffer;
  /** Remix video ID to modify an existing video */
  remixVideoId?: string;
}

export class OpenAI extends BaseAdapter<
  typeof OPENAI_CHAT_MODELS,
  typeof OPENAI_IMAGE_MODELS,
  typeof OPENAI_EMBEDDING_MODELS,
  typeof OPENAI_AUDIO_MODELS,
  typeof OPENAI_VIDEO_MODELS,
  OpenAIChatProviderOptions,
  OpenAIImageProviderOptions,
  OpenAIEmbeddingProviderOptions,
  OpenAIAudioProviderOptions,
  OpenAIVideoProviderOptions
> {
  name = "openai" as const;
  models = OPENAI_CHAT_MODELS;
  imageModels = OPENAI_IMAGE_MODELS;
  embeddingModels = OPENAI_EMBEDDING_MODELS;
  audioModels = OPENAI_AUDIO_MODELS;
  videoModels = OPENAI_VIDEO_MODELS;
  private client: OpenAI_SDK;

  constructor(config: OpenAIConfig) {
    super({});
    this.client = new OpenAI_SDK({
      apiKey: config.apiKey,
      organization: config.organization,
      baseURL: config.baseURL,
    });
  }

  async chatCompletion(
    options: ChatCompletionOptions
  ): Promise<ChatCompletionResult> {
    const providerOpts = options.providerOptions as OpenAIChatProviderOptions | undefined;

    // Map common options to OpenAI format using the centralized mapping function
    const requestParams = mapCommonOptionsToOpenAI(options, providerOpts);

    // Transform messages to OpenAI format
    requestParams.messages = options.messages.map((msg) => {
      if (msg.role === "tool" && msg.toolCallId) {
        return {
          role: "tool" as const,
          content: msg.content || "",
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant" as const,
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content || "",
        name: msg.name,
      };
    });

    // Force stream to false for non-streaming
    requestParams.stream = false;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "gpt-3.5-turbo";
    }

    // Extract custom headers and abort signal (handled separately)
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    const response = await this.client.chat.completions.create(
      requestParams,
      {
        headers: customHeaders,
        signal: abortSignal
      }
    );

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      content: choice.message.content,
      role: "assistant",
      finishReason: choice.finish_reason as any,
      toolCalls: choice.message.tool_calls?.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: tc.function,
      })),
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async *chatCompletionStream(
    options: ChatCompletionOptions
  ): AsyncIterable<ChatCompletionChunk> {
    const providerOpts = options.providerOptions as OpenAIChatProviderOptions | undefined;

    // Map common options to OpenAI format
    const requestParams = mapCommonOptionsToOpenAI(options, providerOpts);

    // Transform messages to OpenAI format
    requestParams.messages = options.messages.map((msg) => {
      if (msg.role === "tool" && msg.toolCallId) {
        return {
          role: "tool" as const,
          content: msg.content || "",
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant" as const,
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content || "",
        name: msg.name,
      };
    });

    // Force stream to true
    requestParams.stream = true;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "gpt-3.5-turbo";
    }

    // Extract custom headers and abort signal
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    // Create with explicit streaming enabled - OpenAI SDK will return a Stream
    const streamResult = await this.client.chat.completions.create(
      requestParams,
      {
        headers: customHeaders as Record<string, string> | undefined,
        signal: abortSignal as AbortSignal | undefined
      }
    );

    // TypeScript doesn't know this is a Stream when stream:true, but it is at runtime
    const stream = streamResult as unknown as AsyncIterable<any>;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;
      if (delta?.content) {
        yield {
          id: chunk.id,
          model: chunk.model,
          content: delta.content,
          role: delta.role as "assistant" | undefined,
          finishReason: chunk.choices[0]?.finish_reason as any,
        };
      }
    }
  }

  async *chatStream(
    options: ChatCompletionOptions
  ): AsyncIterable<import("@tanstack/ai").StreamChunk> {
    const providerOpts = options.providerOptions as OpenAIChatProviderOptions | undefined;

    // Track tool call metadata by unique ID
    // OpenAI streams tool calls with deltas - first chunk has ID/name, subsequent chunks only have args
    // We assign our own indices as we encounter unique tool call IDs
    const toolCallMetadata = new Map<string, { index: number; name: string }>();
    let nextIndex = 0;

    // Debug: Log incoming options
    if (process.env.DEBUG_TOOLS) {
      console.error(
        "[DEBUG chatStream] Received options.tools:",
        options.tools ? `${options.tools.length} tools` : "undefined"
      );
      if (options.tools && options.tools.length > 0) {
        console.error(
          "[DEBUG chatStream] First tool:",
          JSON.stringify(options.tools[0], null, 2)
        );
      }
    }

    // Map common options to OpenAI format using the centralized mapping function
    const requestParams = mapCommonOptionsToOpenAI(options, providerOpts);

    // Transform messages to OpenAI format
    requestParams.messages = options.messages.map((msg) => {
      if (msg.role === "tool" && msg.toolCallId) {
        return {
          role: "tool" as const,
          content: msg.content || "",
          tool_call_id: msg.toolCallId,
        };
      }
      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant" as const,
          content: msg.content,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: tc.type,
            function: tc.function,
          })),
        };
      }
      return {
        role: msg.role as "system" | "user" | "assistant",
        content: msg.content || "",
        name: msg.name,
      };
    });

    // Force stream to true
    requestParams.stream = true;

    // Set default model if not provided
    if (!requestParams.model) {
      requestParams.model = "gpt-3.5-turbo";
    }

    // Debug: Show final request structure
    if (process.env.DEBUG_TOOLS) {
      console.error(
        "[DEBUG] Final request params keys:",
        Object.keys(requestParams)
      );
      console.error("[DEBUG] Has tools property:", "tools" in requestParams);
      if (requestParams.tools) {
        console.error(
          "[DEBUG] Sending tools to OpenAI:",
          JSON.stringify(requestParams.tools, null, 2)
        );
        console.error("[DEBUG] Tool choice:", requestParams.tool_choice);
      }
    }

    // Extract custom headers and abort signal
    const customHeaders = requestParams._headers;
    const abortSignal = requestParams._abortSignal;
    delete requestParams._headers;
    delete requestParams._abortSignal;

    const stream = (await this.client.chat.completions.create(
      requestParams,
      {
        headers: customHeaders,
        signal: abortSignal
      }
    )) as any;

    let accumulatedContent = "";
    const timestamp = Date.now();

    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const choice = chunk.choices[0];

        // Handle content delta
        if (delta?.content) {
          accumulatedContent += delta.content;
          yield {
            type: "content",
            id: chunk.id,
            model: chunk.model,
            timestamp,
            delta: delta.content,
            content: accumulatedContent,
            role: "assistant",
          };
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            // First chunk of a tool call has ID and name
            // Subsequent chunks only have argument fragments
            if (toolCall.id) {
              // New tool call - assign it the next index
              toolCallMetadata.set(toolCall.id, {
                index: nextIndex++,
                name: toolCall.function?.name || "",
              });
            }

            // Find which tool call these deltas belong to
            // For the first chunk, we just added it above
            // For subsequent chunks, we need to find it by OpenAI's index field
            let toolCallId: string;
            let toolCallName: string;
            let actualIndex: number;

            if (toolCall.id) {
              // First chunk - use the ID we just tracked
              toolCallId = toolCall.id;
              const meta = toolCallMetadata.get(toolCallId)!;
              toolCallName = meta.name;
              actualIndex = meta.index;
            } else {
              // Delta chunk - find by OpenAI's index
              // OpenAI uses index to group deltas for the same tool call
              const openAIIndex = typeof toolCall.index === 'number' ? toolCall.index : 0;

              // Find the tool call ID that was assigned this OpenAI index
              const entry = Array.from(toolCallMetadata.entries())[openAIIndex];
              if (entry) {
                const [id, meta] = entry;
                toolCallId = id;
                toolCallName = meta.name;
                actualIndex = meta.index;
              } else {
                // Fallback if we can't find it
                toolCallId = `call_${Date.now()}`;
                toolCallName = "";
                actualIndex = openAIIndex;
              }
            }

            yield {
              type: "tool_call",
              id: chunk.id,
              model: chunk.model,
              timestamp,
              toolCall: {
                id: toolCallId,
                type: "function",
                function: {
                  name: toolCallName,
                  arguments: toolCall.function?.arguments || "",
                },
              },
              index: actualIndex,
            };
          }
        }

        // Handle completion
        if (choice?.finish_reason) {
          yield {
            type: "done",
            id: chunk.id,
            model: chunk.model,
            timestamp,
            finishReason: choice.finish_reason as any,
            usage: chunk.usage
              ? {
                promptTokens: chunk.usage.prompt_tokens || 0,
                completionTokens: chunk.usage.completion_tokens || 0,
                totalTokens: chunk.usage.total_tokens || 0,
              }
              : undefined,
          };
        }
      }
    } catch (error: any) {
      yield {
        type: "error",
        id: this.generateId(),
        model: options.model || "gpt-3.5-turbo",
        timestamp,
        error: {
          message: error.message || "Unknown error occurred",
          code: error.code,
        },
      };
    }
  }

  async generateText(
    options: TextGenerationOptions
  ): Promise<TextGenerationResult> {
    const response = await this.client.completions.create({
      model: options.model || "gpt-3.5-turbo-instruct",
      prompt: options.prompt,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences,
      stream: false,
    });

    const choice = response.choices[0];

    return {
      id: response.id,
      model: response.model,
      text: choice.text,
      finishReason: choice.finish_reason as any,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async *generateTextStream(
    options: TextGenerationOptions
  ): AsyncIterable<string> {
    const stream = await this.client.completions.create({
      model: options.model || "gpt-3.5-turbo-instruct",
      prompt: options.prompt,
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      top_p: options.topP,
      frequency_penalty: options.frequencyPenalty,
      presence_penalty: options.presencePenalty,
      stop: options.stopSequences,
      stream: true,
    });

    for await (const chunk of stream) {
      if (chunk.choices[0]?.text) {
        yield chunk.choices[0].text;
      }
    }
  }

  async summarize(options: SummarizationOptions): Promise<SummarizationResult> {
    const systemPrompt = this.buildSummarizationPrompt(options);

    const response = await this.client.chat.completions.create({
      model: options.model || "gpt-3.5-turbo",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: options.text },
      ],
      max_tokens: options.maxLength,
      temperature: 0.3,
      stream: false,
    });

    return {
      id: response.id,
      model: response.model,
      summary: response.choices[0].message.content || "",
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
    };
  }

  async createEmbeddings(options: EmbeddingOptions): Promise<EmbeddingResult> {
    const response = await this.client.embeddings.create({
      model: options.model || "text-embedding-ada-002",
      input: options.input,
      dimensions: options.dimensions,
    });

    return {
      id: this.generateId(),
      model: response.model,
      embeddings: response.data.map((d) => d.embedding),
      usage: {
        promptTokens: response.usage.prompt_tokens,
        totalTokens: response.usage.total_tokens,
      },
    };
  }

  async generateImage(options: ImageGenerationOptions): Promise<ImageGenerationResult> {
    const numImages = options.n || 1;
    const model = options.model as OpenAIImageModel;

    // Determine max images per call based on model
    const maxPerCall = options.maxImagesPerCall || (model === "dall-e-3" ? 1 : 10);

    // Calculate how many API calls we need
    const numCalls = Math.ceil(numImages / maxPerCall);
    const allImages: ImageData[] = [];

    // Make batched API calls
    for (let i = 0; i < numCalls; i++) {
      const imagesThisCall = Math.min(maxPerCall, numImages - allImages.length);

      const requestParams: OpenAI_SDK.Images.ImageGenerateParams = {
        model,
        prompt: options.prompt,
        n: imagesThisCall,
        ...(options.size && { size: options.size as any }),
        ...(options.seed && model === "dall-e-3" && { seed: options.seed }),
        response_format: "b64_json", // Always request base64
      };

      // Add provider-specific options
      if (options.providerOptions) {
        Object.assign(requestParams, options.providerOptions);
      }

      const response = await this.client.images.generate(requestParams, {
        signal: options.abortSignal,
        headers: options.headers,
      });

      // Convert response to ImageData format
      if (response.data) {
        for (const image of response.data) {
          if (image.b64_json) {
            const base64 = image.b64_json;
            const uint8Array = this.base64ToUint8Array(base64);

            allImages.push({
              base64: `data:image/png;base64,${base64}`,
              uint8Array,
              mediaType: "image/png",
            });
          }
        }
      }
    }

    // Extract provider metadata if available
    const providerMetadata: Record<string, any> = {};
    if (options.providerOptions) {
      providerMetadata.openai = {
        images: allImages.map(() => ({})),
      };
    }

    return {
      ...(numImages === 1 ? { image: allImages[0] } : { images: allImages }),
      providerMetadata,
      response: {
        id: this.generateId(),
        model,
        timestamp: Date.now(),
      },
    };
  }

  async transcribeAudio(
    options: import("@tanstack/ai").AudioTranscriptionOptions
  ): Promise<import("@tanstack/ai").AudioTranscriptionResult> {
    const providerOpts = options.providerOptions as OpenAIAudioTranscriptionProviderOptions | undefined;

    const formData = new FormData();
    formData.append("file", options.file);
    formData.append("model", options.model);

    if (options.prompt) {
      formData.append("prompt", options.prompt);
    }

    if (options.language) {
      formData.append("language", options.language);
    }

    if (options.temperature !== undefined) {
      formData.append("temperature", String(options.temperature));
    }

    const responseFormat = options.responseFormat || "json";
    formData.append("response_format", responseFormat);

    // Add timestamp granularities if specified (whisper-1 only)
    if (providerOpts?.timestampGranularities) {
      providerOpts.timestampGranularities.forEach(gran => {
        formData.append("timestamp_granularities[]", gran);
      });
    }

    // Add diarization options if specified
    if (providerOpts?.chunkingStrategy) {
      formData.append("chunking_strategy", typeof providerOpts.chunkingStrategy === 'string'
        ? providerOpts.chunkingStrategy
        : JSON.stringify(providerOpts.chunkingStrategy));
    }

    if (providerOpts?.knownSpeakerNames) {
      providerOpts.knownSpeakerNames.forEach(name => {
        formData.append("known_speaker_names[]", name);
      });
    }

    if (providerOpts?.knownSpeakerReferences) {
      providerOpts.knownSpeakerReferences.forEach(ref => {
        formData.append("known_speaker_references[]", ref);
      });
    }

    const response = await this.client.audio.transcriptions.create(formData as any);

    // Parse response based on format
    if (typeof response === 'string') {
      return {
        id: this.generateId(),
        model: options.model,
        text: response,
      };
    }

    return {
      id: this.generateId(),
      model: options.model,
      text: (response as any).text || "",
      language: (response as any).language,
      duration: (response as any).duration,
      segments: (response as any).segments,
      logprobs: (response as any).logprobs,
    };
  }

  async generateSpeech(
    options: import("@tanstack/ai").TextToSpeechOptions
  ): Promise<import("@tanstack/ai").TextToSpeechResult> {
    const voice = options.voice;
    if (!voice) {
      throw new Error("Voice parameter is required for text-to-speech");
    }

    const response = await this.client.audio.speech.create({
      model: options.model,
      input: options.input,
      voice: voice as any,
      response_format: (options.responseFormat || "mp3") as any,
      speed: options.speed,
    });

    const buffer = Buffer.from(await response.arrayBuffer());

    const format = (options.responseFormat || "mp3") as "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

    return {
      id: this.generateId(),
      model: options.model,
      audio: buffer,
      format,
    };
  }

  async generateVideo(
    options: import("@tanstack/ai").VideoGenerationOptions
  ): Promise<import("@tanstack/ai").VideoGenerationResult> {
    const providerOpts = options.providerOptions as OpenAIVideoProviderOptions | undefined;

    // Start video generation
    const createParams: any = {
      model: options.model,
      prompt: options.prompt,
    };

    // Add provider-specific options
    if (options.resolution) {
      createParams.size = options.resolution;
    }

    if (options.duration !== undefined) {
      createParams.seconds = String(options.duration);
    }

    if (providerOpts?.inputReference) {
      createParams.input_reference = providerOpts.inputReference;
    }

    let video: any;

    // Check if this is a remix
    if (providerOpts?.remixVideoId) {
      video = await (this.client as any).videos.remix(providerOpts.remixVideoId, {
        prompt: options.prompt,
      });
    } else {
      video = await (this.client as any).videos.create(createParams);
    }

    // Poll for completion
    while (video.status === 'queued' || video.status === 'in_progress') {
      await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
      video = await (this.client as any).videos.retrieve(video.id);
    }

    if (video.status === 'failed') {
      throw new Error(`Video generation failed: ${video.error?.message || 'Unknown error'}`);
    }

    // Download video content
    const videoContent = await (this.client as any).videos.downloadContent(video.id);
    const buffer = Buffer.from(await videoContent.arrayBuffer());

    // Optionally download thumbnail
    let thumbnail: string | undefined;
    try {
      const thumbnailContent = await (this.client as any).videos.downloadContent(video.id, { variant: 'thumbnail' });
      const thumbBuffer = Buffer.from(await thumbnailContent.arrayBuffer());
      thumbnail = `data:image/webp;base64,${thumbBuffer.toString('base64')}`;
    } catch (e) {
      // Thumbnail download failed, continue without it
    }

    return {
      id: video.id,
      model: options.model,
      video: buffer,
      format: 'mp4',
      duration: parseInt(video.seconds) || options.duration,
      resolution: video.size || options.resolution,
      thumbnail,
    };
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    // Remove data URL prefix if present
    const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');

    // Decode base64 to binary string
    const binaryString = atob(base64Data);

    // Convert binary string to Uint8Array
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    return bytes;
  }

  private buildSummarizationPrompt(options: SummarizationOptions): string {
    let prompt = "You are a professional summarizer. ";

    switch (options.style) {
      case "bullet-points":
        prompt += "Provide a summary in bullet point format. ";
        break;
      case "paragraph":
        prompt += "Provide a summary in paragraph format. ";
        break;
      case "concise":
        prompt += "Provide a very concise summary in 1-2 sentences. ";
        break;
      default:
        prompt += "Provide a clear and concise summary. ";
    }

    if (options.focus && options.focus.length > 0) {
      prompt += `Focus on the following aspects: ${options.focus.join(", ")}. `;
    }

    if (options.maxLength) {
      prompt += `Keep the summary under ${options.maxLength} tokens. `;
    }

    return prompt;
  }
}

/**
 * Creates an OpenAI adapter with simplified configuration
 * @param apiKey - Your OpenAI API key
 * @returns A fully configured OpenAI adapter instance
 * 
 * @example
 * ```typescript
 * const openai = createOpenAI("sk-...");
 * 
 * const ai = new AI({
 *   adapters: {
 *     openai,
 *   }
 * });
 * ```
 */
export function createOpenAI(
  apiKey: string,
  config?: Omit<OpenAIConfig, "apiKey">
): OpenAI {
  return new OpenAI({ apiKey, ...config });
}

/**
 * Create an OpenAI adapter with automatic API key detection from environment variables.
 * 
 * Looks for `OPENAI_API_KEY` in:
 * - `process.env` (Node.js)
 * - `window.env` (Browser with injected env)
 * 
 * @param config - Optional configuration (excluding apiKey which is auto-detected)
 * @returns Configured OpenAI adapter instance
 * @throws Error if OPENAI_API_KEY is not found in environment
 * 
 * @example
 * ```typescript
 * // Automatically uses OPENAI_API_KEY from environment
 * const aiInstance = ai(openai());
 * ```
 */
export function openai(config?: Omit<OpenAIConfig, "apiKey">): OpenAI {
  const env = typeof globalThis !== "undefined" && (globalThis as any).window?.env
    ? (globalThis as any).window.env
    : typeof process !== "undefined" ? process.env : undefined;
  const key = env?.OPENAI_API_KEY;

  if (!key) {
    throw new Error(
      "OPENAI_API_KEY is required. Please set it in your environment variables or use createOpenAI(apiKey, config) instead."
    );
  }

  return createOpenAI(key, config);
}
