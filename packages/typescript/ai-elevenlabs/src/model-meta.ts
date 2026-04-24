/**
 * ElevenLabs model identifiers exposed as `union | (string & {})` so callers
 * get autocomplete but can still pass any custom or newly-released model.
 *
 * The lists are non-exhaustive on purpose — ElevenLabs ships new model IDs
 * more often than we cut a release.
 */

/**
 * Text-to-speech models.
 * @see https://elevenlabs.io/docs/models
 */
export const ELEVENLABS_TTS_MODELS = [
  'eleven_v3',
  'eleven_multilingual_v2',
  'eleven_flash_v2_5',
  'eleven_flash_v2',
  'eleven_turbo_v2_5',
  'eleven_turbo_v2',
  'eleven_monolingual_v1',
] as const

export type ElevenLabsTTSModel =
  | (typeof ELEVENLABS_TTS_MODELS)[number]
  | (string & {})

/**
 * Audio generation models — music (`music_v1`) + sound effects
 * (`eleven_text_to_sound_v*`) share one `generateAudio` adapter.
 * The adapter dispatches by model id so callers pick behavior via the model.
 *
 * @see https://elevenlabs.io/docs/overview/capabilities/music
 * @see https://elevenlabs.io/docs/overview/capabilities/sound-effects
 */
export const ELEVENLABS_AUDIO_MODELS = [
  'music_v1',
  'eleven_text_to_sound_v2',
  'eleven_text_to_sound_v1',
] as const

export type ElevenLabsAudioModel =
  | (typeof ELEVENLABS_AUDIO_MODELS)[number]
  | (string & {})

/** Music models within the audio family. */
export type ElevenLabsMusicModel = 'music_v1' | (string & {})
/** SFX models within the audio family. */
export type ElevenLabsSoundEffectsModel =
  | 'eleven_text_to_sound_v2'
  | 'eleven_text_to_sound_v1'
  | (string & {})

export function isElevenLabsMusicModel(model: string): boolean {
  return model === 'music_v1'
}

export function isElevenLabsSoundEffectsModel(model: string): boolean {
  return model.startsWith('eleven_text_to_sound_')
}

/**
 * Speech-to-text (transcription) models — Scribe family.
 * @see https://elevenlabs.io/docs/overview/capabilities/speech-to-text
 */
export const ELEVENLABS_TRANSCRIPTION_MODELS = ['scribe_v2', 'scribe_v1'] as const

export type ElevenLabsTranscriptionModel =
  | (typeof ELEVENLABS_TRANSCRIPTION_MODELS)[number]
  | (string & {})

/**
 * Supported `output_format` strings, encoded as `codec_samplerate[_bitrate]`.
 *
 * ElevenLabs accepts any valid combination — the listed literals are the
 * common ones and the `(string & {})` union lets callers pass arbitrary
 * formats while still autocompleting the defaults.
 *
 * @see https://elevenlabs.io/docs/api-reference/text-to-speech/convert
 */
export type ElevenLabsOutputFormat =
  | 'mp3_22050_32'
  | 'mp3_44100_32'
  | 'mp3_44100_64'
  | 'mp3_44100_96'
  | 'mp3_44100_128'
  | 'mp3_44100_192'
  | 'pcm_8000'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_44100'
  | 'pcm_48000'
  | 'ulaw_8000'
  | 'alaw_8000'
  | 'opus_48000_32'
  | 'opus_48000_64'
  | 'opus_48000_96'
  | 'opus_48000_128'
  | 'opus_48000_192'
  | (string & {})
