import type {
  BytePlusTTSAudioFormat,
  BytePlusTTSReference,
  BytePlusTTSSampleRate,
  BytePlusTTSSubtitle,
} from './wire-types'
import type { TTSResult } from '@tanstack/ai'

/**
 * Seed Speech voice identifier (`speaker` on the wire).
 *
 * Voice ids encode language, gender, character name and model generation:
 * `en_female_stokie_uranus_bigtts` is the English female "Stokie" voice on
 * TTS 2.0. The generation suffix matters when picking one:
 *
 * - `_uranus_bigtts` — TTS 2.0 voices (the current generation).
 * - `_mars_bigtts` / `_moon_bigtts` — TTS 1.0 voices.
 * - `*_emo_v2_*` — TTS 1.0 voices that additionally accept emotion tags.
 *
 * The full roster lives at
 * https://docs.byteplus.com/en/docs/byteplusvoice/voicelist and changes far
 * more often than this package ships, so the union stays open: any string is
 * accepted, and the one listed id is the adapter's default.
 */
export type BytePlusTTSVoice = 'en_female_stokie_uranus_bigtts' | (string & {})

/**
 * Provider-specific options for BytePlus Seed Speech TTS
 * (`POST /api/v3/tts/create`).
 *
 * These map 1:1 onto the wire fields so the BytePlus documentation stays
 * useful; where a cross-provider `TTSOptions` field covers the same ground
 * (`voice`, `format`, `speed`), the option here wins.
 */
export interface BytePlusTTSProviderOptions {
  /**
     * Voice id. Overrides `TTSOptions.voice` when both are set. It is sent as
     * the `speaker` of a single `references` entry.
     */
  speaker?: BytePlusTTSVoice
  /**
     * Full `references` array, for voice cloning or image-referenced delivery.
     * When set this replaces the entry the adapter would otherwise build from
     * `speaker` / `TTSOptions.voice`, so include a `speaker` entry yourself if
     * you still want a stock voice. Address audio references from the text with
     * `@Audio1`..`@Audio3`.
     */
  references?: Array<BytePlusTTSReference>
  /**
     * Output format. Overrides the mapping applied to `TTSOptions.format`,
     * which is useful for `ogg_opus` and for pinning `pcm` explicitly.
     */
  format?: BytePlusTTSAudioFormat
  /**
     * Output sample rate in Hz. Defaults to 24000 — the adapter always sends an
     * explicit rate because the documented server default (40000) is not one of
     * the values the endpoint accepts. For `pcm` output this is also what the
     * returned `contentType` (`audio/L16;rate=…`) reports.
     */
  sample_rate?: BytePlusTTSSampleRate
  /**
     * Pitch adjustment in the range `-12`..`12`, where `0` is the voice's
     * natural pitch.
     */
  pitch_rate?: number
  /**
     * Speaking rate in the range `-50`..`100` (`-50` = 0.5×, `0` = 1×,
     * `100` = 2×). Overrides the value derived from `TTSOptions.speed`.
     */
  speech_rate?: number
  /**
     * Loudness adjustment in the range `-50`..`100`, where `0` is the voice's
     * natural level.
     */
  loudness_rate?: number
  /**
     * Ask for sentence- and word-level timings alongside the audio. They are
     * surfaced on {@link BytePlusTTSResult.subtitle}.
     */
  enable_subtitle?: boolean
  /**
     * Watermark the generated audio. The field name is confirmed against the
     * endpoint schema; the boolean type is assumed and unprobed.
     */
  watermark?: boolean
}

/**
 * BytePlus-specific extension of `TTSResult`.
 *
 * The cross-provider `TTSResult` has nowhere to put the subtitle timings or
 * the temporary download URL, so callers who want them narrow the result:
 *
 * ```ts
 * const result: BytePlusTTSResult = await generateSpeech({ adapter, text })
 * for (const sentence of result.subtitle?.sentences ?? []) {
 *   console.log(sentence.text, sentence.start_time)
 * }
 * ```
 */
export interface BytePlusTTSResult extends TTSResult {
  /**
     * Sentence and word timings, present only when
     * `modelOptions.enable_subtitle` was set. Their `start_time` / `end_time`
     * are **milliseconds**, even though `duration` and
     * {@link BytePlusTTSResult.originalDuration} are seconds.
     */
  subtitle?: BytePlusTTSSubtitle
  /**
     * Length of the audio in seconds *before* `speech_rate` was applied. This
     * is what BytePlus bills on and what the 120 s cap applies to, so it is the
     * number to meter against — `duration` reflects the delivered clip and can
     * exceed 120 s when the speech is slowed down.
     */
  originalDuration?: number
  /**
     * Temporary download URL for the same audio that `audio` carries as base64.
     * **Expires roughly 2 hours after generation** — persist the bytes, not the
     * link.
     */
  url?: string
}
