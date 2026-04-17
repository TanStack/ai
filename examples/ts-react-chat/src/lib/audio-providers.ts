/**
 * Shared catalog of audio-related providers shown in the example pages.
 *
 * Each entry lists a display label plus the provider model we exercise so
 * the UI can render consistent tabs/selectors across speech, transcription,
 * and audio generation flows.
 */

export type SpeechProviderId = 'openai' | 'elevenlabs' | 'gemini' | 'fal'

export interface SpeechProviderConfig {
  id: SpeechProviderId
  label: string
  model: string
  /** Voices the UI will surface for this provider. */
  voices: ReadonlyArray<{ id: string; label: string }>
  /** Placeholder shown in the text area. */
  placeholder: string
}

export const SPEECH_PROVIDERS: ReadonlyArray<SpeechProviderConfig> = [
  {
    id: 'openai',
    label: 'OpenAI TTS',
    model: 'tts-1',
    voices: [
      { id: 'alloy', label: 'Alloy' },
      { id: 'echo', label: 'Echo' },
      { id: 'fable', label: 'Fable' },
      { id: 'onyx', label: 'Onyx' },
      { id: 'nova', label: 'Nova' },
      { id: 'shimmer', label: 'Shimmer' },
    ],
    placeholder: 'Enter text to read aloud with OpenAI TTS…',
  },
  {
    id: 'elevenlabs',
    label: 'ElevenLabs',
    model: 'eleven_v3',
    voices: [
      { id: 'JBFqnCBsd6RMkjVDRZzb', label: 'George (default)' },
      { id: '21m00Tcm4TlvDq8ikWAM', label: 'Rachel' },
      { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam' },
    ],
    placeholder: 'Enter text to synthesize with ElevenLabs…',
  },
  {
    id: 'gemini',
    label: 'Gemini TTS',
    model: 'gemini-2.5-flash-preview-tts',
    voices: [
      { id: 'Kore', label: 'Kore' },
      { id: 'Puck', label: 'Puck' },
      { id: 'Zephyr', label: 'Zephyr' },
    ],
    placeholder: 'Enter text for Gemini speech…',
  },
  {
    id: 'fal',
    label: 'Fal (Kokoro)',
    model: 'fal-ai/kokoro/american-english',
    voices: [
      { id: 'af_heart', label: 'Heart' },
      { id: 'af_sky', label: 'Sky' },
      { id: 'am_adam', label: 'Adam' },
    ],
    placeholder: 'Enter text to synthesize with Fal Kokoro…',
  },
]

export type TranscriptionProviderId = 'openai' | 'elevenlabs' | 'fal'

export interface TranscriptionProviderConfig {
  id: TranscriptionProviderId
  label: string
  model: string
  description: string
}

export const TRANSCRIPTION_PROVIDERS: ReadonlyArray<TranscriptionProviderConfig> =
  [
    {
      id: 'openai',
      label: 'OpenAI Whisper',
      model: 'whisper-1',
      description: 'OpenAI Whisper transcription with optional streaming.',
    },
    {
      id: 'elevenlabs',
      label: 'ElevenLabs Scribe',
      model: 'scribe_v2',
      description: 'ElevenLabs Scribe supports diarization and entity detection.',
    },
    {
      id: 'fal',
      label: 'Fal Whisper',
      model: 'fal-ai/whisper',
      description: 'Fal-hosted Whisper with word-level timestamps.',
    },
  ]

export type AudioProviderId =
  | 'elevenlabs-music'
  | 'elevenlabs-sfx'
  | 'gemini-lyria'
  | 'fal-audio'

export interface AudioProviderConfig {
  id: AudioProviderId
  label: string
  model: string
  description: string
  placeholder: string
  /** Default generation length in seconds, when the provider accepts one. */
  defaultDuration?: number
}

export const AUDIO_PROVIDERS: ReadonlyArray<AudioProviderConfig> = [
  {
    id: 'elevenlabs-music',
    label: 'ElevenLabs Music',
    model: 'music_v1',
    description: 'Generate full songs with vocals and arrangement.',
    placeholder: 'An upbeat indie rock track with driving drums…',
    defaultDuration: 30,
  },
  {
    id: 'elevenlabs-sfx',
    label: 'ElevenLabs SFX',
    model: 'eleven_text_to_sound_v2',
    description: 'Generate short sound effects from natural language.',
    placeholder: 'Glass shattering on a tile floor',
    defaultDuration: 3,
  },
  {
    id: 'gemini-lyria',
    label: 'Gemini Lyria',
    model: 'lyria-3-clip-preview',
    description: 'Google Lyria 3 music generation (30s clips).',
    placeholder: 'Ambient piano with warm pads and soft strings',
  },
  {
    id: 'fal-audio',
    label: 'Fal Audio',
    model: 'fal-ai/diffrhythm',
    description: 'Fal-hosted open music generation models.',
    placeholder: 'A lo-fi hip-hop beat with vinyl crackle',
    defaultDuration: 10,
  },
]
