// packages/ai/src/activities/plugin/media.ts
//
// Media plugin factories: thin, callback-style wrappers over the generic
// `generationPlugin`. Each fixes the input schema + result type for one media
// activity, so the client surface `plugin.<name>.run(input)` is typed input →
// output end to end. The input schemas mirror the client-facing fields of the
// corresponding `generate*` / `summarize` activity options (the adapter,
// stream, debug, and middleware knobs are server concerns and are omitted).
import { z } from 'zod'
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

// ===========================
// Image
// ===========================

const imageInput = z.object({
  prompt: z.string(),
  numberOfImages: z.number().optional(),
  size: z.string().optional(),
  modelOptions: z.record(z.string(), z.unknown()).optional(),
})
export type ImagePluginInput = z.infer<typeof imageInput>

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

const videoInput = z.object({
  prompt: z.string(),
  size: z.string().optional(),
  duration: z.number().optional(),
  modelOptions: z.record(z.string(), z.unknown()).optional(),
})
export type VideoPluginInput = z.infer<typeof videoInput>

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

const audioInput = z.object({
  prompt: z.string(),
  duration: z.number().optional(),
  modelOptions: z.record(z.string(), z.unknown()).optional(),
})
export type AudioPluginInput = z.infer<typeof audioInput>

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

const speechInput = z.object({
  text: z.string(),
  voice: z.string().optional(),
  format: z.enum(['mp3', 'opus', 'aac', 'flac', 'wav', 'pcm']).optional(),
  speed: z.number().optional(),
  modelOptions: z.record(z.string(), z.unknown()).optional(),
})
export type SpeechPluginInput = z.infer<typeof speechInput>

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

const transcriptionInput = z.object({
  // Audio input travels over the wire as a base64 string (the activity's
  // File/Blob/ArrayBuffer forms aren't JSON-serializable through the plugin
  // request envelope).
  audio: z.string(),
  language: z.string().optional(),
  prompt: z.string().optional(),
  responseFormat: z
    .enum(['json', 'text', 'srt', 'verbose_json', 'vtt'])
    .optional(),
  modelOptions: z.record(z.string(), z.unknown()).optional(),
})
export type TranscriptionPluginInput = z.infer<typeof transcriptionInput>

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

const summarizeInput = z.object({
  text: z.string(),
  maxLength: z.number().optional(),
  style: z.enum(['bullet-points', 'paragraph', 'concise']).optional(),
  focus: z.array(z.string()).optional(),
  modelOptions: z.record(z.string(), z.unknown()).optional(),
})
export type SummarizePluginInput = z.infer<typeof summarizeInput>

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
