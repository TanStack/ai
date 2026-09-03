import type { ElevenLabs } from '@elevenlabs/elevenlabs-js'

/**
 * ElevenLabs model identifiers. The lists below are the source of truth —
 * callers are blocked from passing unknown model IDs.
 *
 * Maintained by hand: `scripts/sync-provider-models.ts` deliberately excludes
 * elevenlabs, because these are media endpoint ids rather than OpenRouter
 * models. Where the SDK publishes its own union, pin the list to it with
 * `satisfies` so a removed id fails the build instead of a request.
 *
 * Each list is ordered newest-first, with models ElevenLabs has deprecated
 * kept at the bottom so existing callers don't break on an upgrade. An id the
 * SDK has dropped outright is removed rather than kept, because the adapter
 * can no longer send it — see `eleven_text_to_sound_v1`.
 *
 * @see https://elevenlabs.io/docs/models
 */

/**
 * Text-to-speech models.
 * @see https://elevenlabs.io/docs/models
 */
export const ELEVENLABS_TTS_MODELS = [
  'eleven_v3_conversational',
  'eleven_v3',
  'eleven_v3_conversational',
  'eleven_multilingual_v2',
  'eleven_flash_v2_5',
  'eleven_flash_v2',
  // Deprecated by ElevenLabs — use `eleven_flash_v2_5`.
  'eleven_turbo_v2_5',
  // Deprecated by ElevenLabs — use `eleven_flash_v2`.
  'eleven_turbo_v2',
  // Deprecated by ElevenLabs — use `eleven_multilingual_v2`.
  'eleven_monolingual_v1',
] as const

export type ElevenLabsTTSModel = (typeof ELEVENLABS_TTS_MODELS)[number]

/**
 * Audio generation models — music (`music_v*`) + sound effects
 * (`eleven_text_to_sound_v*`) share one `generateAudio` adapter.
 * The adapter dispatches by model id so callers pick behavior via the model.
 *
 * @see https://elevenlabs.io/docs/overview/capabilities/music
 * @see https://elevenlabs.io/docs/overview/capabilities/sound-effects
 */
export const ELEVENLABS_AUDIO_MODELS = [
  'music_v2_5',
  'music_v2',
  'eleven_text_to_sound_v2',
  // Deprecated by ElevenLabs — use `music_v2_5`.
  'music_v1',
] as const satisfies ReadonlyArray<
  ElevenLabs.MusicModelId | ElevenLabs.SfxModelId
>

export type ElevenLabsAudioModel = (typeof ELEVENLABS_AUDIO_MODELS)[number]

/** Music models within the audio family, derived from the audio list. */
export type ElevenLabsMusicModel = Extract<
  ElevenLabsAudioModel,
  `music_${string}`
>
/** SFX models within the audio family, derived from the audio list. */
export type ElevenLabsSoundEffectsModel = Extract<
  ElevenLabsAudioModel,
  `eleven_text_to_sound_${string}`
>

/**
 * Matches the `music_` prefix so a new music release needs no branch here,
 * but still checks membership: the narrowed type is the closed set above, so
 * a `music_*` id this package does not ship must not pass.
 */
export function isElevenLabsMusicModel(
  model: string,
): model is ElevenLabsMusicModel {
  return (
    model.startsWith('music_') &&
    (ELEVENLABS_AUDIO_MODELS as ReadonlyArray<string>).includes(model)
  )
}

export function isElevenLabsSoundEffectsModel(
  model: string,
): model is ElevenLabsSoundEffectsModel {
  return model.startsWith('eleven_text_to_sound_')
}

/**
 * Speech-to-text (transcription) models — Scribe family.
 * @see https://elevenlabs.io/docs/overview/capabilities/speech-to-text
 */
export const ELEVENLABS_TRANSCRIPTION_MODELS = [
  'scribe_v2',
  // Domain-tuned for clinical audio.
  'scribe_v2_medical',
  // Deprecated by ElevenLabs — use `scribe_v2`.
  'scribe_v1',
] as const

export type ElevenLabsTranscriptionModel =
  (typeof ELEVENLABS_TRANSCRIPTION_MODELS)[number]

/**
 * Voice design (text-to-voice) models, used by the `generateVoice` adapter.
 * `eleven_ttv_v3` is the only one that accepts reference audio, so guiding a
 * design with a recording of a real speaker requires it.
 *
 * @see https://elevenlabs.io/docs/overview/capabilities/voice-design
 */
export const ELEVENLABS_VOICE_MODELS = [
  'eleven_ttv_v3',
  'eleven_multilingual_ttv_v2',
] as const satisfies ReadonlyArray<ElevenLabs.VoiceDesignRequestModelModelId>

export type ElevenLabsVoiceModel = (typeof ELEVENLABS_VOICE_MODELS)[number]

/**
 * Supported `output_format` strings, encoded as `codec_samplerate[_bitrate]`.
 * Aliased to the SDK's `AllowedOutputFormats` so the list stays in sync
 * automatically whenever the `@elevenlabs/elevenlabs-js` dependency is bumped.
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export type ElevenLabsOutputFormat = ElevenLabs.AllowedOutputFormats
