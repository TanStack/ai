/**
 * ElevenLabs model identifiers.
 *
 * Model IDs are kept as union-of-string-literals so callers get autocomplete
 * but can still pass any custom / newly-released model.
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
 * Music generation models.
 * @see https://elevenlabs.io/docs/overview/capabilities/music
 */
export const ELEVENLABS_MUSIC_MODELS = ['music_v1'] as const

export type ElevenLabsMusicModel =
  | (typeof ELEVENLABS_MUSIC_MODELS)[number]
  | (string & {})

/**
 * Sound-effect generation models.
 * @see https://elevenlabs.io/docs/overview/capabilities/sound-effects
 */
export const ELEVENLABS_SOUND_EFFECTS_MODELS = [
  'eleven_text_to_sound_v2',
  'eleven_text_to_sound_v1',
] as const

export type ElevenLabsSoundEffectsModel =
  | (typeof ELEVENLABS_SOUND_EFFECTS_MODELS)[number]
  | (string & {})

/**
 * Speech-to-text (transcription) models.
 * @see https://elevenlabs.io/docs/overview/capabilities/speech-to-text
 */
export const ELEVENLABS_TRANSCRIPTION_MODELS = [
  'scribe_v2',
  'scribe_v1',
] as const

export type ElevenLabsTranscriptionModel =
  | (typeof ELEVENLABS_TRANSCRIPTION_MODELS)[number]
  | (string & {})

/**
 * Supported `output_format` strings for TTS, music, and sound effect endpoints.
 * Encoded as `codec_samplerate[_bitrate]`.
 *
 * This list is non-exhaustive — ElevenLabs accepts any valid combination.
 * Keeping the `(string & {})` union lets callers pass custom formats while
 * still getting autocomplete for common ones.
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
