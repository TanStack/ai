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
import { chatActivity, kind as chatKindValue } from './chat/index'
import {
  embeddingActivity,
  kind as embeddingKindValue,
} from './embedding/index'
import {
  summarizeActivity,
  kind as summarizeKindValue,
} from './summarize/index'
import { imageActivity, kind as imageKindValue } from './image/index'

// Import adapter types for type definitions
import type { ChatAdapter } from './chat/adapter'
import type { EmbeddingAdapter } from './embedding/adapter'
import type { SummarizeAdapter } from './summarize/adapter'
import type { ImageAdapter } from './image/adapter'
import type { ChatActivityOptions, ChatActivityResult } from './chat/index'
import type {
  EmbeddingActivityOptions,
  EmbeddingActivityResult,
} from './embedding/index'
import type {
  SummarizeActivityOptions,
  SummarizeActivityResult,
} from './summarize/index'
import type { ImageActivityOptions, ImageActivityResult } from './image/index'

import type { z } from 'zod'
import type {
  EmbeddingResult,
  ImageGenerationResult,
  StreamChunk,
  SummarizationResult,
} from '../types'

// ===========================
// Chat Activity
// ===========================

export {
  kind as chatKind,
  chatActivity,
  chatOptions,
  type ChatActivityOptions,
  type ChatActivityResult,
  type CommonOptions,
} from './chat/index'

export {
  BaseChatAdapter,
  type ChatAdapter,
  type ChatAdapterConfig,
  type StructuredOutputOptions,
  type StructuredOutputResult,
} from './chat/adapter'

// ===========================
// Embedding Activity
// ===========================

export {
  kind as embeddingKind,
  embeddingActivity,
  type EmbeddingActivityOptions,
  type EmbeddingActivityResult,
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
  summarizeActivity,
  type SummarizeActivityOptions,
  type SummarizeActivityResult,
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
  imageActivity,
  type ImageActivityOptions,
  type ImageActivityResult,
} from './image/index'

export {
  BaseImageAdapter,
  type ImageAdapter,
  type ImageAdapterConfig,
} from './image/adapter'

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
 * This allows for pluggable activities without modifying the ai function.
 */
export const activityMap = new Map<string, ActivityHandler>([
  [chatKindValue, chatActivity],
  [embeddingKindValue, embeddingActivity],
  [summarizeKindValue, summarizeActivity],
  [imageKindValue, imageActivity],
])

// ===========================
// Adapter Union Types
// ===========================

/** Union of all adapter types that can be passed to ai() */
export type AIAdapter =
  | ChatAdapter<ReadonlyArray<string>, object, any, any, any>
  | EmbeddingAdapter<ReadonlyArray<string>, object>
  | SummarizeAdapter<ReadonlyArray<string>, object>
  | ImageAdapter<ReadonlyArray<string>, object, any, any>

/** Alias for backwards compatibility */
export type GenerateAdapter = AIAdapter

/** Union of all adapters (legacy name) */
export type AnyAdapter =
  | ChatAdapter<any, any, any, any, any>
  | EmbeddingAdapter<any, any>
  | SummarizeAdapter<any, any>
  | ImageAdapter<any, any, any>

/** Union type of all adapter kinds */
export type AdapterKind = 'chat' | 'embedding' | 'summarize' | 'image'

// ===========================
// Model Extraction Helpers
// ===========================

/** Extract model types from a ChatAdapter */
export type ChatModels<TAdapter> =
  TAdapter extends ChatAdapter<infer M, any, any, any, any> ? M[number] : string

/** Extract model types from an EmbeddingAdapter */
export type EmbeddingModels<TAdapter> =
  TAdapter extends EmbeddingAdapter<infer M, any> ? M[number] : string

/** Extract model types from a SummarizeAdapter */
export type SummarizeModels<TAdapter> =
  TAdapter extends SummarizeAdapter<infer M, any> ? M[number] : string

/** Extract model types from an ImageAdapter */
export type ImageModels<TAdapter> =
  TAdapter extends ImageAdapter<infer M, any, any, any> ? M[number] : string

// ===========================
// Unified Options Type
// ===========================

/** Union of all adapter types with their kind discriminator */
export type AnyAIAdapter =
  | (ChatAdapter<ReadonlyArray<string>, object, any, any, any> & {
      kind: 'chat'
    })
  | (EmbeddingAdapter<ReadonlyArray<string>, object> & { kind: 'embedding' })
  | (SummarizeAdapter<ReadonlyArray<string>, object> & { kind: 'summarize' })
  | (ImageAdapter<ReadonlyArray<string>, object, any, any> & { kind: 'image' })

/** Infer the correct options type based on adapter kind */
export type AIOptionsFor<
  TAdapter extends AnyAIAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = false,
> = TAdapter extends { kind: 'chat' }
  ? TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>
    ? ChatActivityOptions<TAdapter, TModel & ChatModels<TAdapter>, TSchema>
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
            TStream
          >
        : never
      : TAdapter extends { kind: 'image' }
        ? TAdapter extends ImageAdapter<ReadonlyArray<string>, object, any, any>
          ? ImageActivityOptions<TAdapter, TModel & ImageModels<TAdapter>>
          : never
        : never

// ===========================
// Unified Result Type
// ===========================

/** Infer the return type based on adapter kind, schema, and stream */
export type AIResultFor<
  TAdapter extends AnyAIAdapter,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = false,
> = TAdapter extends { kind: 'chat' }
  ? ChatActivityResult<TSchema>
  : TAdapter extends { kind: 'embedding' }
    ? EmbeddingActivityResult
    : TAdapter extends { kind: 'summarize' }
      ? SummarizeActivityResult<TStream>
      : TAdapter extends { kind: 'image' }
        ? ImageActivityResult
        : never

// ===========================
// Unified Options Type (Legacy)
// ===========================

/** Unified options type for those who need it */
export type GenerateOptions<
  TAdapter extends AIAdapter,
  TModel extends string,
  TSchema extends z.ZodType | undefined = undefined,
  TStream extends boolean = false,
> =
  TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>
    ? ChatActivityOptions<TAdapter, TModel & ChatModels<TAdapter>, TSchema>
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

/** @deprecated Use ChatActivityOptions */
export type GenerateChatOptions<
  TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends ChatModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
> = ChatActivityOptions<TAdapter, TModel, TSchema>

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
// Implementation Types for ai()
// ===========================

/**
 * Union type for all possible ai() options (used in implementation signature)
 */
export type AIOptionsUnion =
  | ChatActivityOptions<
      ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
      string,
      z.ZodType | undefined
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

/**
 * Union type for all possible ai() return types (used in implementation signature)
 */
export type AIResultUnion =
  | AsyncIterable<StreamChunk>
  | Promise<EmbeddingResult>
  | Promise<SummarizationResult>
  | Promise<ImageGenerationResult>
  | Promise<unknown>

// ===========================
// Re-exported Type Aliases for ai.ts compatibility
// ===========================

/** @deprecated Use ChatActivityOptions */
export type ChatGenerateOptions<
  TAdapter extends ChatAdapter<ReadonlyArray<string>, object, any, any, any>,
  TModel extends ChatModels<TAdapter>,
  TSchema extends z.ZodType | undefined = undefined,
> = ChatActivityOptions<TAdapter, TModel, TSchema>

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
