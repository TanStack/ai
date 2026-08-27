import type { ElevenLabs } from '@elevenlabs/elevenlabs-js'

export const ELEVENLABS_TTS_MODELS = [
  'eleven_v3',
  'eleven_multilingual_v2',
  'eleven_flash_v2_5',
  'eleven_flash_v2',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_monolingual_v1',
] as const

export type ElevenLabsTTSModel = (typeof ELEVENLABS_TTS_MODELS)[number]

export const ELEVENLABS_AUDIO_MODELS = [
  'music_v1',
  'eleven_text_to_sound_v2',
  'eleven_text_to_sound_v1',
] as const

export type ElevenLabsAudioModel = (typeof ELEVENLABS_AUDIO_MODELS)[number]

/** Music models within the audio family. */
export type ElevenLabsMusicModel = 'music_v1'
/** SFX models within the audio family. */
export type ElevenLabsSoundEffectsModel =
  | 'eleven_text_to_sound_v2'
  | 'eleven_text_to_sound_v1'

export function isElevenLabsMusicModel(
  model: string,
): model is ElevenLabsMusicModel {
  return model === 'music_v1'
}

export function isElevenLabsSoundEffectsModel(
  model: string,
): model is ElevenLabsSoundEffectsModel {
  return model.startsWith('eleven_text_to_sound_')
}

export const ELEVENLABS_TRANSCRIPTION_MODELS = [
  'scribe_v2',
  'scribe_v1',
] as const

export type ElevenLabsTranscriptionModel =
  (typeof ELEVENLABS_TRANSCRIPTION_MODELS)[number]

export type ElevenLabsOutputFormat = ElevenLabs.AllowedOutputFormats
