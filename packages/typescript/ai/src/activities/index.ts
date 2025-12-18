/**
 * Activities Index
 *
 * Central hub for all AI activities. This module exports:
 * - All activity implementations and their types
 * - All adapter interfaces and base classes
 * - The activity routing map and unified type definitions
 *
 * To add a new activity:
 * 1. Create a new directory under activities/ with index.ts and adapter.ts
 * 2. Export the activity and adapter from this file
 * 3. Add it to the activityMap
 */

// Import the activity functions and kinds for the map
import { chat, kind as textKindValue } from './chat/index'
import { text, kind as simpleTextKindValue } from './text/index'
import { embedding, kind as embeddingKindValue } from './embedding/index'
import { summarize, kind as summarizeKindValue } from './summarize/index'
import { generateImage, kind as imageKindValue } from './generateImage/index'
import { generateVideo, kind as videoKindValue } from './generateVideo/index'
import { generateSpeech, kind as ttsKindValue } from './generateSpeech/index'
import {
  generateTranscription,
  kind as transcriptionKindValue,
} from './generateTranscription/index'

// Import model types for use in local type definitions
import type {
  InputModalitiesForModel,
  MessageMetadataForAdapter,
  TextModels,
  TextProviderOptionsForModel,
  // eslint-disable-next-line import/no-duplicates
} from './chat/index'
import type {
  EmbeddingActivityOptions,
  EmbeddingActivityResult,
  EmbeddingModels,
  EmbeddingProviderOptions,
} from './embedding/index'
import type {
  SummarizeActivityOptions,
  SummarizeActivityResult,
  SummarizeModels,
  SummarizeProviderOptions,
} from './summarize/index'
import type {
  ImageActivityOptions,
  ImageActivityResult,
  ImageModels,
  ImageProviderOptionsForModel,
  ImageSizeForModel,
} from './generateImage/index'
import type {
  VideoActivityOptions,
  VideoActivityResult,
  VideoCreateOptions,
  VideoModels,
  VideoProviderOptions,
  VideoStatusOptions,
  VideoUrlOptions,
} from './generateVideo/index'
import type {
  TTSActivityOptions,
  TTSActivityResult,
  TTSModels,
  TTSProviderOptions,
} from './generateSpeech/index'
import type {
  TranscriptionActivityOptions,
  TranscriptionActivityResult,
  TranscriptionModels,
  TranscriptionProviderOptions,
} from './generateTranscription/index'

// Import adapter types for type definitions
import type { TextAdapter } from './chat/adapter'
import type { EmbeddingAdapter } from './embedding/adapter'
import type { SummarizeAdapter } from './summarize/adapter'
import type { ImageAdapter } from './generateImage/adapter'
import type { VideoAdapter } from './generateVideo/adapter'
import type { TTSAdapter } from './generateSpeech/adapter'
import type { TranscriptionAdapter } from './generateTranscription/adapter'
// eslint-disable-next-line import/no-duplicates
import type { TextActivityOptions, TextActivityResult } from './chat/index'

import type { z } from 'zod'

import type {
  ConstrainedModelMessage,
  EmbeddingResult,
  ImageGenerationResult,
  StreamChunk,
  SummarizationResult,
  TTSResult,
  TextOptions,
  TranscriptionResult,
  VideoJobResult,
  VideoStatusResult,
  VideoUrlResult,
} from '../types'

// ===========================
// Chat Activity
// ===========================

export {
  kind as textKind,
  chat,
  textOptions,
  type TextActivityOptions,
  type TextActivityResult,
  type CommonOptions,
  type TextModels,
  type TextProviderOptionsForModel,
  type InputModalitiesForModel,
  type MessageMetadataForAdapter,
} from './chat/index'

export {
  BaseTextAdapter,
  type TextAdapter,
  type TextAdapterConfig,
  type StructuredOutputOptions,
  type StructuredOutputResult,
} from './chat/adapter'

// ===========================
// Text Activity (Non-Agentic)
// ===========================

export {
  kind as simpleTextKind,
  text as experimental_text,
  toText,
  type TextActivityOptions as SimpleTextActivityOptions,
  type TextActivityResult as SimpleTextActivityResult,
  type TextModels as SimpleTextModels,
  type TextProviderOptionsForModel as SimpleTextProviderOptionsForModel,
} from './text/index'

// ===========================
// Embedding Activity
// ===========================

export {
  kind as embeddingKind,
  embedding,
  type EmbeddingActivityOptions,
  type EmbeddingActivityResult,
  type EmbeddingModels,
  type EmbeddingProviderOptions,
} from './embedding/index'

export {
  BaseEmbeddingAdapter,
  type EmbeddingAdapter,
  type EmbeddingAdapterConfig,
} from './embedding/adapter'

// ===========================
// Summarize Activity
// ===========================

export {
  kind as summarizeKind,
  summarize,
  type SummarizeActivityOptions,
  type SummarizeActivityResult,
  type SummarizeModels,
  type SummarizeProviderOptions,
} from './summarize/index'

export {
  BaseSummarizeAdapter,
  type SummarizeAdapter,
  type SummarizeAdapterConfig,
} from './summarize/adapter'

// ===========================
// Image Activity
// ===========================

export {
  kind as imageKind,
  generateImage,
  type ImageActivityOptions,
  type ImageActivityResult,
  type ImageModels,
  type ImageProviderOptionsForModel,
  type ImageSizeForModel,
} from './generateImage/index'

export {
  BaseImageAdapter,
  type ImageAdapter,
  type ImageAdapterConfig,
} from './generateImage/adapter'

// ===========================
// Video Activity (Experimental)
// ===========================

export {
  kind as videoKind,
  generateVideo,
  getVideoJobStatus,
  type VideoActivityOptions,
  type VideoActivityResult,
  type VideoModels,
  type VideoProviderOptions,
  type VideoCreateOptions,
  type VideoStatusOptions,
  type VideoUrlOptions,
} from './generateVideo/index'

export {
  BaseVideoAdapter,
  type VideoAdapter,
  type VideoAdapterConfig,
} from './generateVideo/adapter'

// ===========================
// TTS Activity
// ===========================

export {
  kind as ttsKind,
  generateSpeech,
  type TTSActivityOptions,
  type TTSActivityResult,
  type TTSModels,
  type TTSProviderOptions,
} from './generateSpeech/index'

export {
  BaseTTSAdapter,
  type TTSAdapter,
  type TTSAdapterConfig,
} from './generateSpeech/adapter'

// ===========================
// Transcription Activity
// ===========================

export {
  kind as transcriptionKind,
  generateTranscription,
  type TranscriptionActivityOptions,
  type TranscriptionActivityResult,
  type TranscriptionModels,
  type TranscriptionProviderOptions,
} from './generateTranscription/index'

export {
  BaseTranscriptionAdapter,
  type TranscriptionAdapter,
  type TranscriptionAdapterConfig,
} from './generateTranscription/adapter'

// ===========================
// Activity Handler Type
// ===========================

/** Type for activity handler functions */
type ActivityHandler = (options: any) => any

// ===========================
// Activity Map
// ===========================

/**
 * Map of adapter kind to activity handler function.
 * This allows for pluggable activities without modifying the chat function.
 * @deprecated This map is no longer used as we've moved to individual activity functions.
 */
export const activityMap = new Map<string, ActivityHandler>([
  [textKindValue, chat],
  [simpleTextKindValue, text],
  [embeddingKindValue, embedding],
  [summarizeKindValue, summarize],
  [imageKindValue, generateImage],
  [videoKindValue, generateVideo],
  [ttsKindValue, generateSpeech],
  [transcriptionKindValue, generateTranscription],
])

// ===========================
// Adapter Union Types
// ===========================

/** Union of all adapter types that can be passed to chat() */
export type AIAdapter =
  | TextAdapter<ReadonlyArray<string>, object, any, any, any>
  | EmbeddingAdapter<ReadonlyArray<string>, object>
  | SummarizeAdapter<ReadonlyArray<string>, object>
  | ImageAdapter<ReadonlyArray<string>, object, any, any>
  | VideoAdapter<ReadonlyArray<string>, object>
  | TTSAdapter<ReadonlyArray<string>, object>
  | TranscriptionAdapter<ReadonlyArray<string>, object>

/** Alias for backwards compatibility */
export type GenerateAdapter = AIAdapter

/** Union of all adapters (legacy name) */
export type AnyAdapter =
  | TextAdapter<any, any, any, any, any>
  | EmbeddingAdapter<any, any>
  | SummarizeAdapter<any, any>
  | ImageAdapter<any, any, any>
  | VideoAdapter<any, any>
  | TTSAdapter<any, any>
  | TranscriptionAdapter<any, any>

/** Union type of all adapter kinds */
export type AdapterKind =
  | 'text'
  | 'embedding'
  | 'summarize'
  | 'image'
  | 'video'
  | 'tts'
  | 'transcription'

// ===========================
// Unified Options Type
// ===========================

/** Union of all adapter types with their kind discriminator */
export type AnyAIAdapter =
  | (TextAdapter<ReadonlyArray<string>, object, any, any, any> & {
      kind: 'text'
    })
  | (EmbeddingAdapter<ReadonlyArray<string>, object> & { kind: 'embedding' })
  | (SummarizeAdapter<ReadonlyArray<string>, object> & { kind: 'summarize' })
  | (ImageAdapter<ReadonlyArray<string>, object, any, any> & { kind: 'image' })
  | (VideoAdapter<ReadonlyArray<string>, object> & { kind: 'video' })
  | (TTSAdapter<ReadonlyArray<string>, object> & { kind: 'tts' })
  | (TranscriptionAdapter<ReadonlyArray<string>, object> & {
      kind: 'transcription'
    })

/** Infer the correct options type based on adapter kind */
export type AIOptionsFor<
  TAdapter extends AnyAIAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean | undefined = undefined,
  TRequest extends 'create' | 'status' | 'url' = 'create',
> = TAdapter extends { kind: 'text' }
  ? TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>
    ? TextActivityOptions<
        TAdapter,
        TModel & TextModels<TAdapter>,
        TSchema,
        TStream extends boolean ? TStream : true
      >
    : never
  : TAdapter extends { kind: 'embedding' }
    ? TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>
      ? EmbeddingActivityOptions<TAdapter, TModel & EmbeddingModels<TAdapter>>
      : never
    : TAdapter extends { kind: 'summarize' }
      ? TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>
        ? SummarizeActivityOptions<
            TAdapter,
            TModel & SummarizeModels<TAdapter>,
            TStream extends boolean ? TStream : false
          >
        : never
      : TAdapter extends { kind: 'image' }
        ? TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>
          ? ImageActivityOptions<TAdapter, TModel & ImageModels<TAdapter>>
          : never
        : TAdapter extends { kind: 'video' }
          ? TAdapter extends VideoAdapter<ReadonlyArray<string>, object>
            ? VideoActivityOptions<
                TAdapter,
                TModel & VideoModels<TAdapter>,
                TRequest
              >
            : never
          : TAdapter extends { kind: 'tts' }
            ? TAdapter extends TTSAdapter<ReadonlyArray<string>, object>
              ? TTSActivityOptions<TAdapter, TModel & TTSModels<TAdapter>>
              : never
            : TAdapter extends { kind: 'transcription' }
              ? TAdapter extends TranscriptionAdapter<
                  ReadonlyArray<string>,
                  object
                >
                ? TranscriptionActivityOptions<
                    TAdapter,
                    TModel & TranscriptionModels<TAdapter>
                  >
                : never
              : never

// ===========================
// Unified Result Type
// ===========================

/** Infer the return type based on adapter kind, schema, and stream */
export type AIResultFor<
  TAdapter extends AnyAIAdapter,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean | undefined = undefined,
  TRequest extends 'create' | 'status' | 'url' = 'create',
> = TAdapter extends { kind: 'text' }
  ? TextActivityResult<TSchema, TStream extends boolean ? TStream : true>
  : TAdapter extends { kind: 'embedding' }
    ? EmbeddingActivityResult
    : TAdapter extends { kind: 'summarize' }
      ? SummarizeActivityResult<TStream extends boolean ? TStream : false>
      : TAdapter extends { kind: 'image' }
        ? ImageActivityResult
        : TAdapter extends { kind: 'video' }
          ? VideoActivityResult<TRequest>
          : TAdapter extends { kind: 'tts' }
            ? TTSActivityResult
            : TAdapter extends { kind: 'transcription' }
              ? TranscriptionActivityResult
              : never

// ===========================
// Unified Options Type (Legacy)
// ===========================

/** Unified options type for those who need it */
export type GenerateOptions<
  TAdapter extends AIAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
> =
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>
    ? TextActivityOptions<
        TAdapter,
        TModel & TextModels<TAdapter>,
        TSchema,
        TStream
      >
    : TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>
      ? EmbeddingActivityOptions<TAdapter, TModel & EmbeddingModels<TAdapter>>
      : TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>
        ? SummarizeActivityOptions<
            TAdapter,
            TModel & SummarizeModels<TAdapter>,
            TStream
          >
        : TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>
          ? ImageActivityOptions<TAdapter, TModel & ImageModels<TAdapter>>
          : never

// ===========================
// Legacy Type Aliases
// ===========================

/** @deprecated Use TextActivityOptions */
export type GenerateTextOptions<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
> = TextActivityOptions<TAdapter, TModel, TSchema, TStream>

/** @deprecated Use EmbeddingActivityOptions */
export type GenerateEmbeddingOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>,
  TModel extends EmbeddingModels<TAdapter>,
> = EmbeddingActivityOptions<TAdapter, TModel>

/** @deprecated Use SummarizeActivityOptions */
export type GenerateSummarizeOptions<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  TModel extends SummarizeModels<TAdapter>,
  TStream extends boolean = false,
> = SummarizeActivityOptions<TAdapter, TModel, TStream>

/** @deprecated Use ImageActivityOptions */
export type GenerateImageOptions<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ImageModels<TAdapter>,
> = ImageActivityOptions<TAdapter, TModel>

// ===========================
// Implementation Types for chat()
// ===========================

/**
 * Union type for all possible chat() options (used in implementation signature)
 */
export type AIOptionsUnion =
  | TextActivityOptions<
      TextAdapter<ReadonlyArray<string>, object, any, any, any>,
      string,
      z.ZodType | undefined,
      boolean
    >
  | EmbeddingActivityOptions<
      EmbeddingAdapter<ReadonlyArray<string>, object>,
      string
    >
  | SummarizeActivityOptions<
      SummarizeAdapter<ReadonlyArray<string>, object>,
      string,
      boolean
    >
  | ImageActivityOptions<
      ImageAdapter<ReadonlyArray<string>, object, any, any>,
      string
    >
  | VideoCreateOptions<VideoAdapter<ReadonlyArray<string>, object>, string>
  | VideoStatusOptions<VideoAdapter<ReadonlyArray<string>, object>, string>
  | VideoUrlOptions<VideoAdapter<ReadonlyArray<string>, object>, string>
  | TTSActivityOptions<TTSAdapter<ReadonlyArray<string>, object>, string>
  | TranscriptionActivityOptions<
      TranscriptionAdapter<ReadonlyArray<string>, object>,
      string
    >

/**
 * Union type for all possible chat() return types (used in implementation signature)
 */
export type AIResultUnion =
  | AsyncIterable<StreamChunk>
  | Promise<string>
  | Promise<EmbeddingResult>
  | Promise<SummarizationResult>
  | Promise<ImageGenerationResult>
  | Promise<VideoJobResult>
  | Promise<VideoStatusResult>
  | Promise<VideoUrlResult>
  | Promise<TTSResult>
  | Promise<TranscriptionResult>
  | Promise<unknown>

// ===========================
// Explicit AI Option Types
// ===========================
// These types provide clear autocomplete and required field enforcement
// for the chat() function. They are slightly different from ActivityOptions
// as they include constraints like ConstrainedModelMessage for text.

/**
 * Explicit embedding options - provides clear autocomplete and required field enforcement
 */
export type AIEmbeddingOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>,
  TModel extends EmbeddingModels<TAdapter>,
> = {
  /** The embedding adapter to use */
  adapter: TAdapter & { kind: 'embedding' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Text input to embed (single string or array of strings) - REQUIRED */
  input: string | Array<string>
  /** Optional: Number of dimensions for the embedding vector */
  dimensions?: number
  /** Provider-specific options */
  modelOptions?: EmbeddingProviderOptions<TAdapter>
}

/**
 * Explicit summarize options - provides clear autocomplete and required field enforcement
 */
export type AISummarizeOptions<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  TModel extends SummarizeModels<TAdapter>,
  TStream extends boolean = false,
> = {
  /** The summarize adapter to use */
  adapter: TAdapter & { kind: 'summarize' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The text to summarize - REQUIRED */
  text: string
  /** Maximum length of the summary (in words or characters, provider-dependent) */
  maxLength?: number
  /** Style of summary to generate */
  style?: 'bullet-points' | 'paragraph' | 'concise'
  /** Topics or aspects to focus on in the summary */
  focus?: Array<string>
  /** Whether to stream the response */
  stream?: TStream
  /** Provider-specific options */
  modelOptions?: SummarizeProviderOptions<TAdapter>
}

/**
 * Explicit image options - provides clear autocomplete and required field enforcement
 */
export type AIImageOptions<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ImageModels<TAdapter>,
> = {
  /** The image adapter to use */
  adapter: TAdapter & { kind: 'image' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The prompt describing the image to generate - REQUIRED */
  prompt: string
  /** Number of images to generate (default: 1) */
  numberOfImages?: number
  /** Image size in WIDTHxHEIGHT format (e.g., "1024x1024") - autocompletes based on model */
  size?: ImageSizeForModel<TAdapter, TModel>
  /** Provider-specific options */
  modelOptions?: ImageProviderOptionsForModel<TAdapter, TModel>
}

/**
 * Explicit video options for creating a job - provides clear autocomplete and required field enforcement.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type AIVideoCreateOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> = {
  /** The video adapter to use */
  adapter: TAdapter & { kind: 'video' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Request type - create a new job */
  request?: 'create'
  /** Text description of the desired video - REQUIRED */
  prompt: string
  /** Video size in WIDTHxHEIGHT format (e.g., "1280x720") */
  size?: string
  /** Video duration in seconds */
  duration?: number
  /** Provider-specific options */
  modelOptions?: VideoProviderOptions<TAdapter>
}

/**
 * Explicit video options for checking status.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type AIVideoStatusOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> = {
  /** The video adapter to use */
  adapter: TAdapter & { kind: 'video' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Request type - get status */
  request: 'status'
  /** Job ID to check status for - REQUIRED */
  jobId: string
}

/**
 * Explicit video options for getting the video URL.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type AIVideoUrlOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> = {
  /** The video adapter to use */
  adapter: TAdapter & { kind: 'video' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Request type - get URL */
  request: 'url'
  /** Job ID to get URL for - REQUIRED */
  jobId: string
}

/**
 * Union of all video options types.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type AIVideoOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
> =
  | AIVideoCreateOptions<TAdapter, TModel>
  | AIVideoStatusOptions<TAdapter, TModel>
  | AIVideoUrlOptions<TAdapter, TModel>

/**
 * Explicit TTS options - provides clear autocomplete and required field enforcement.
 */
export type AITTSOptions<
  TAdapter extends TTSAdapter<ReadonlyArray<string>, object>,
  TModel extends TTSModels<TAdapter>,
> = {
  /** The TTS adapter to use */
  adapter: TAdapter & { kind: 'tts' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The text to convert to speech - REQUIRED */
  text: string
  /** The voice to use for generation */
  voice?: string
  /** The output audio format */
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  /** The speed of the generated audio (0.25 to 4.0) */
  speed?: number
  /** Provider-specific options */
  modelOptions?: TTSProviderOptions<TAdapter>
}

/**
 * Explicit transcription options - provides clear autocomplete and required field enforcement.
 */
export type AITranscriptionOptions<
  TAdapter extends TranscriptionAdapter<ReadonlyArray<string>, object>,
  TModel extends TranscriptionModels<TAdapter>,
> = {
  /** The transcription adapter to use */
  adapter: TAdapter & { kind: 'transcription' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** The audio data to transcribe - REQUIRED */
  audio: string | File | Blob | ArrayBuffer
  /** The language of the audio in ISO-639-1 format (e.g., 'en') */
  language?: string
  /** An optional prompt to guide the transcription */
  prompt?: string
  /** The format of the transcription output */
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  /** Provider-specific options */
  modelOptions?: TranscriptionProviderOptions<TAdapter>
}

/**
 * Explicit text options - provides clear autocomplete and required field enforcement.
 * Uses NoInfer on modelOptions to prevent inference widening.
 * Uses ConstrainedModelMessage to constrain content types by model's supported input modalities.
 */
export type AITextOptions<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined,
  TStream extends boolean,
> = {
  /** The text adapter to use */
  adapter: TAdapter & { kind: 'text' }
  /** The model name (autocompletes based on adapter) */
  model: TModel
  /** Conversation messages - content types are constrained by the model's supported input modalities */
  messages: Array<
    ConstrainedModelMessage<
      InputModalitiesForModel<TAdapter, TModel>,
      MessageMetadataForAdapter<TAdapter>['image'],
      MessageMetadataForAdapter<TAdapter>['audio'],
      MessageMetadataForAdapter<TAdapter>['video'],
      MessageMetadataForAdapter<TAdapter>['document'],
      MessageMetadataForAdapter<TAdapter>['text']
    >
  >
  /** System prompts to prepend to the conversation */
  systemPrompts?: TextOptions['systemPrompts']
  /** Tools for function calling (auto-executed when called) */
  tools?: TextOptions['tools']
  /** Additional options like temperature, maxTokens, etc. */
  options?: TextOptions['options']
  /** Provider-specific options (narrowed by model) */
  modelOptions?: NoInfer<TextProviderOptionsForModel<TAdapter, TModel>>
  /** AbortController for cancellation */
  abortController?: TextOptions['abortController']
  /** Strategy for controlling the agent loop */
  agentLoopStrategy?: TextOptions['agentLoopStrategy']
  /** Unique conversation identifier for tracking */
  conversationId?: TextOptions['conversationId']
  /** Optional Zod schema for structured output */
  outputSchema?: TSchema
  /** Whether to stream the text result (default: true) */
  stream?: TStream
}

// ===========================
// Re-exported Type Aliases for ai.ts compatibility
// ===========================

/** @deprecated Use TextActivityOptions */
export type TextGenerateOptions<
  TAdapter extends TextAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends TextModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = true,
> = TextActivityOptions<TAdapter, TModel, TSchema, TStream>

/** @deprecated Use EmbeddingActivityOptions */
export type EmbeddingGenerateOptions<
  TAdapter extends EmbeddingAdapter<ReadonlyArray<string>, object>,
  TModel extends EmbeddingModels<TAdapter>,
> = EmbeddingActivityOptions<TAdapter, TModel>

/** @deprecated Use SummarizeActivityOptions */
export type SummarizeGenerateOptions<
  TAdapter extends SummarizeAdapter<ReadonlyArray<string>, object>,
  TModel extends SummarizeModels<TAdapter>,
  TStream extends boolean = false,
> = SummarizeActivityOptions<TAdapter, TModel, TStream>

/** @deprecated Use ImageActivityOptions */
export type ImageGenerateOptions<
  TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>,
  TModel extends ImageModels<TAdapter>,
> = ImageActivityOptions<TAdapter, TModel>

/**
 * @deprecated Use VideoActivityOptions
 * @experimental Video generation is an experimental feature and may change.
 */
export type VideoGenerateOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
  TRequest extends 'create' | 'status' | 'url' = 'create',
> = VideoActivityOptions<TAdapter, TModel, TRequest>

/**
 * @deprecated Use VideoActivityOptions
 * @experimental Video generation is an experimental feature and may change.
 */
export type GenerateVideoOptions<
  TAdapter extends VideoAdapter<ReadonlyArray<string>, object>,
  TModel extends VideoModels<TAdapter>,
  TRequest extends 'create' | 'status' | 'url' = 'create',
> = VideoActivityOptions<TAdapter, TModel, TRequest>
