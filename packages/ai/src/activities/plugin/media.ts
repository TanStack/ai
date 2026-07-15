// packages/ai/src/activities/plugin/media.ts
//
// Media plugin factories: thin, callback-style wrappers over the generic
// `generationPlugin`. Each fixes the input schema + result type for one media
// activity, so the client surface `plugin.<name>.run(input)` is typed input →
// output end to end. The input schemas mirror the client-facing fields of the
// corresponding `generate*` / `summarize` activity options (the adapter,
// stream, debug, and middleware knobs are server concerns and are omitted).
//
// The input schemas are hand-rolled Standard Schemas rather than zod: this
// package is schema-library-agnostic (it validates via `@standard-schema/spec`
// and never ships a concrete schema library), so importing zod here would drag
// zod into the bundle and make it a hard runtime dependency. Callers who want
// richer input validation can bypass these factories and pass their own
// zod/valibot/arktype schema straight to `generationPlugin({ input, execute })`.
import type { StandardSchemaV1 } from '@standard-schema/spec'
import { generationPlugin } from './index.js'
import type { GenerationPlugin, GenerationPluginRequest } from './types.js'
import type {
  AudioGenerationResult,
  ImageGenerationResult,
  StreamChunk,
  SummarizationResult,
  TTSResult,
  TranscriptionResult,
  VideoJobResult,
} from '../../types.js'

/**
 * A media plugin callback may resolve to the activity's result, or return a
 * raw `StreamChunk` iterable (e.g. a `stream: true` activity) forwarded as-is.
 */
export type MaybeStream<T> = Promise<T> | AsyncIterable<StreamChunk>

/**
 * Build a zero-dependency Standard Schema for a media input `T`. Validation is
 * intentionally lightweight — it confirms the value is an object and that the
 * `required` keys are present, then types it as `T`. The typed client
 * (`plugin.<name>.run(input)`) is the primary guardrail; deeper validation is
 * a caller's choice via a custom `generationPlugin` schema.
 *
 * `StandardSchemaV1<T, T>` (input === output) is what makes `InferSchemaType`
 * resolve `req.input` to `T`.
 */
function mediaSchema<T>(
  required: ReadonlyArray<keyof T & string>,
): StandardSchemaV1<T, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'tanstack-ai',
      validate: (value) => {
        if (typeof value !== 'object' || value === null) {
          return { issues: [{ message: 'Expected an object' }] }
        }
        const record = value as Record<string, unknown>
        for (const key of required) {
          if (record[key] === undefined) {
            return {
              issues: [
                { message: `Missing required field: ${key}`, path: [key] },
              ],
            }
          }
        }
        return { value: value as T }
      },
    },
  }
}

// ===========================
// Image
// ===========================

export interface ImagePluginInput {
  prompt: string
  numberOfImages?: number
  size?: string
  modelOptions?: Record<string, unknown>
}
const imageInput = mediaSchema<ImagePluginInput>(['prompt'])

/**
 * A one-shot plugin that generates images. Pre-binds `req.input` to the image
 * contract (`{ prompt, numberOfImages?, size?, modelOptions? }`) and the result
 * to {@link ImageGenerationResult}.
 */
export function imagePlugin(
  callback: (
    req: GenerationPluginRequest<ImagePluginInput>,
  ) => MaybeStream<ImageGenerationResult>,
): GenerationPlugin<ImagePluginInput, ImageGenerationResult> {
  return generationPlugin({ input: imageInput, execute: callback })
}

// ===========================
// Video
// ===========================

export interface VideoPluginInput {
  prompt: string
  size?: string
  duration?: number
  modelOptions?: Record<string, unknown>
}
const videoInput = mediaSchema<VideoPluginInput>(['prompt'])

/**
 * A one-shot plugin that generates video. Pre-binds `req.input` to the video
 * contract (`{ prompt, size?, duration?, modelOptions? }`) and the result to
 * {@link VideoJobResult}.
 */
export function videoPlugin(
  callback: (
    req: GenerationPluginRequest<VideoPluginInput>,
  ) => MaybeStream<VideoJobResult>,
): GenerationPlugin<VideoPluginInput, VideoJobResult> {
  return generationPlugin({ input: videoInput, execute: callback })
}

// ===========================
// Audio
// ===========================

export interface AudioPluginInput {
  prompt: string
  duration?: number
  modelOptions?: Record<string, unknown>
}
const audioInput = mediaSchema<AudioPluginInput>(['prompt'])

/**
 * A one-shot plugin that generates audio (music, sound effects, ...).
 * Pre-binds `req.input` to the audio contract (`{ prompt, duration?,
 * modelOptions? }`) and the result to {@link AudioGenerationResult}.
 */
export function audioPlugin(
  callback: (
    req: GenerationPluginRequest<AudioPluginInput>,
  ) => MaybeStream<AudioGenerationResult>,
): GenerationPlugin<AudioPluginInput, AudioGenerationResult> {
  return generationPlugin({ input: audioInput, execute: callback })
}

// ===========================
// Speech (TTS)
// ===========================

export interface SpeechPluginInput {
  text: string
  voice?: string
  format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm'
  speed?: number
  modelOptions?: Record<string, unknown>
}
const speechInput = mediaSchema<SpeechPluginInput>(['text'])

/**
 * A one-shot plugin that generates speech from text. Pre-binds `req.input` to
 * the speech contract (`{ text, voice?, format?, speed?, modelOptions? }`) and
 * the result to {@link TTSResult}.
 */
export function speechPlugin(
  callback: (
    req: GenerationPluginRequest<SpeechPluginInput>,
  ) => MaybeStream<TTSResult>,
): GenerationPlugin<SpeechPluginInput, TTSResult> {
  return generationPlugin({ input: speechInput, execute: callback })
}

// ===========================
// Transcription
// ===========================

export interface TranscriptionPluginInput {
  // Audio input travels over the wire as a base64 string (the activity's
  // File/Blob/ArrayBuffer forms aren't JSON-serializable through the plugin
  // request envelope).
  audio: string
  language?: string
  prompt?: string
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt'
  modelOptions?: Record<string, unknown>
}
const transcriptionInput = mediaSchema<TranscriptionPluginInput>(['audio'])

/**
 * A one-shot plugin that transcribes audio to text. Pre-binds `req.input` to
 * the transcription contract (`{ audio, language?, prompt?, responseFormat?,
 * modelOptions? }`) and the result to {@link TranscriptionResult}.
 */
export function transcriptionPlugin(
  callback: (
    req: GenerationPluginRequest<TranscriptionPluginInput>,
  ) => MaybeStream<TranscriptionResult>,
): GenerationPlugin<TranscriptionPluginInput, TranscriptionResult> {
  return generationPlugin({ input: transcriptionInput, execute: callback })
}

// ===========================
// Summarize
// ===========================

export interface SummarizePluginInput {
  text: string
  maxLength?: number
  style?: 'bullet-points' | 'paragraph' | 'concise'
  focus?: Array<string>
  modelOptions?: Record<string, unknown>
}
const summarizeInput = mediaSchema<SummarizePluginInput>(['text'])

/**
 * A one-shot plugin that summarizes text. Pre-binds `req.input` to the
 * summarize contract (`{ text, maxLength?, style?, focus?, modelOptions? }`)
 * and the result to {@link SummarizationResult}.
 */
export function summarizePlugin(
  callback: (
    req: GenerationPluginRequest<SummarizePluginInput>,
  ) => MaybeStream<SummarizationResult>,
): GenerationPlugin<SummarizePluginInput, SummarizationResult> {
  return generationPlugin({ input: summarizeInput, execute: callback })
}
