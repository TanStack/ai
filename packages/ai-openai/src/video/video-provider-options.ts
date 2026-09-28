/**
 * OpenAI Video Generation Provider Options
 *
 * Based on https://platform.openai.com/docs/api-reference/videos/create
 *
 * @experimental Video generation is an experimental feature and may change.
 */

import { durationToSeconds } from '@tanstack/ai/adapters'
import type {
  DurationOptions,
  VideoDurationSpell,
} from '@tanstack/ai/adapters'

/**
 * Supported video sizes for OpenAI Sora video generation.
 * Based on the official API documentation.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoSize =
  | '1280x720' // 720p landscape (16:9)
  | '720x1280' // 720p portrait (9:16)
  | '1792x1024' // Landscape wide
  | '1024x1792' // Portrait tall

/**
 * Wire values for the Sora `seconds` parameter. The API stores these as
 * strings: `'4'`, `'8'`, or `'12'`.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoSeconds = '4' | '8' | '12'

/**
 * Spellings of a Sora clip length. Both `sora-2` and `sora-2-pro` accept
 * 4, 8, or 12 seconds (Videos API, checked 2026-09-28). There is no `"auto"`.
 * Callers may pass the number, the numeric string, or a `"4s"` template.
 * The adapter sends {@link OpenAIVideoSeconds}.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoDuration = VideoDurationSpell<4 | 8 | 12>

/**
 * Provider-specific options for OpenAI video generation.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export interface OpenAIVideoProviderOptions {
  /**
   * Video size in WIDTHxHEIGHT format.
   * Supported: '1280x720', '720x1280', '1792x1024', '1024x1792'
   */
  size?: OpenAIVideoSize

  /**
   * Video duration in seconds.
   * Supported values: 4, 8, or 12 seconds.
   */
  seconds?: OpenAIVideoSeconds
}

/**
 * Model-specific provider options mapping.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoModelProviderOptionsByName = {
  'sora-2': OpenAIVideoProviderOptions
  'sora-2-pro': OpenAIVideoProviderOptions
}

/**
 * Model-specific provider options mapping.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoModelSizeByName = {
  'sora-2': OpenAIVideoSize
  'sora-2-pro': OpenAIVideoSize
}

/**
 * Per-model duration union. Same vocabulary on both Sora models.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoModelDurationByName = {
  'sora-2': OpenAIVideoDuration
  'sora-2-pro': OpenAIVideoDuration
}

const SORA_SECONDS = [
  '4',
  '8',
  '12',
] as const satisfies ReadonlyArray<OpenAIVideoSeconds>

/**
 * Runtime duration table backing `availableDurations()` / `snapDuration()`.
 * `snapDuration` returns the API string (`'4' | '8' | '12'`).
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export const OPENAI_VIDEO_DURATIONS = {
  'sora-2': { kind: 'discrete', values: SORA_SECONDS },
  'sora-2-pro': { kind: 'discrete', values: SORA_SECONDS },
} as const satisfies {
  [Model in keyof OpenAIVideoModelDurationByName]: DurationOptions<OpenAIVideoSeconds>
}

/**
 * Look up the duration options for a Sora model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function getOpenAIVideoDurationOptions<
  TModel extends keyof OpenAIVideoModelDurationByName,
>(model: TModel): DurationOptions<OpenAIVideoSeconds> {
  return OPENAI_VIDEO_DURATIONS[model]
}

/**
 * Per-model prompt input modalities. Sora models accept a single image part
 * in the prompt, mapped to the API's `input_reference` field.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export type OpenAIVideoModelInputModalitiesByName = {
  'sora-2': readonly ['image']
  'sora-2-pro': readonly ['image']
}

/**
 * Validate video size for a given model.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function validateVideoSize(
  model: string,
  size?: string,
): asserts size is OpenAIVideoSize | undefined {
  const validSizes: Array<OpenAIVideoSize> = [
    '1280x720',
    '720x1280',
    '1792x1024',
    '1024x1792',
  ]

  if (size && !validSizes.includes(size as OpenAIVideoSize)) {
    throw new Error(
      `Size "${size}" is not supported by model "${model}". Supported sizes: ${validSizes.join(', ')}`,
    )
  }
}

/**
 * Validate a Sora duration. Accepts `4`, `"4"`, and `"4s"` (and 8, 12).
 * Rejects other lengths, including `"6s"` and `"auto"`.
 *
 * @experimental Video generation is an experimental feature and may change.
 */
export function validateVideoSeconds(
  model: string,
  seconds?: number | string,
): asserts seconds is OpenAIVideoDuration | undefined {
  if (seconds === undefined) return
  if (toApiSeconds(seconds) !== undefined) return

  throw new Error(
    `Duration "${seconds}" is not supported by model "${model}". Supported durations: 4, 8, or 12 seconds ("4", "4s", or 4).`,
  )
}

/**
 * Convert a duration spelling to the API string (`'4' | '8' | '12'`).
 */
export function toApiSeconds(
  seconds: number | string | undefined,
): OpenAIVideoSeconds | undefined {
  if (seconds === undefined) return undefined
  const value = durationToSeconds(seconds)
  if (value === 4) return '4'
  if (value === 8) return '8'
  if (value === 12) return '12'
  return undefined
}
