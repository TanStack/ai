import type { ElevenLabs } from '@elevenlabs/elevenlabs-js'

/**
 * ElevenLabs model identifiers. The lists below are the source of truth —
 * callers are blocked from passing unknown model IDs. Keep them in sync with
 * the ElevenLabs SDK via the automated update pipeline.
 *
 * Each list is ordered newest-first, with models ElevenLabs has deprecated
 * kept at the bottom so existing callers don't break on an upgrade.
 *
 * @see https://elevenlabs.io/docs/models
 */

/**
 * Text-to-speech models.
 * @see https://elevenlabs.io/docs/models
 */
export const ELEVENLABS_TTS_MODELS = [
  'eleven_v3',
  'eleven_v3_conversational',
  'eleven_multilingual_v2',
  'eleven_flash_v2_5',
  'eleven_flash_v2',
  /** @deprecated ElevenLabs has deprecated this model — use `eleven_flash_v2_5`. */
  'eleven_turbo_v2_5',
  /** @deprecated ElevenLabs has deprecated this model — use `eleven_flash_v2`. */
  'eleven_turbo_v2',
  /** @deprecated ElevenLabs has deprecated this model — use `eleven_multilingual_v2`. */
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
  /** @deprecated ElevenLabs has deprecated this model — use `music_v2_5`. */
  'music_v1',
] as const

export type ElevenLabsAudioModel = (typeof ELEVENLABS_AUDIO_MODELS)[number]

/** Music models within the audio family. */
export type ElevenLabsMusicModel = 'music_v2_5' | 'music_v2' | 'music_v1'
/** SFX models within the audio family. */
export type ElevenLabsSoundEffectsModel = 'eleven_text_to_sound_v2'

export function isElevenLabsMusicModel(
  model: string,
): model is ElevenLabsMusicModel {
  return model.startsWith('music_')
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
  /** Domain-tuned for clinical audio. */
  'scribe_v2_medical',
  /** Low-latency streaming variant. */
  'scribe_v2_realtime',
  /** @deprecated ElevenLabs has deprecated this model — use `scribe_v2`. */
  'scribe_v1',
] as const

export type ElevenLabsTranscriptionModel =
  (typeof ELEVENLABS_TRANSCRIPTION_MODELS)[number]

/**
 * Voice design (text-to-voice) models, used by the `generateVoice` adapter.
 * `eleven_ttv_v3` is the only one that accepts reference audio, so cloning a
 * real speaker requires it.
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
