/**
 * Shared catalog of audio-related providers shown in the example pages.
 *
 * Each entry lists a display label plus the provider model we exercise so
 * the UI can render consistent tabs/selectors across speech, transcription,
 * and audio generation flows.
 */

export type SpeechProviderId = 'openai' | 'gemini' | 'fal'

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

export type TranscriptionProviderId = 'openai' | 'fal'

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
      id: 'fal',
      label: 'Fal Whisper',
      model: 'fal-ai/whisper',
      description: 'Fal-hosted Whisper with word-level timestamps.',
    },
  ]

export type AudioProviderId = 'gemini-lyria' | 'fal-audio' | 'fal-sfx'

export interface AudioProviderConfig {
  id: AudioProviderId
  label: string
  /** Default model when the provider does not expose a chooser. */
  model: string
  description: string
  placeholder: string
  /** Default generation length in seconds, when the provider accepts one. */
  defaultDuration?: number
  /** Ready-made prompts the UI can offer as one-click suggestions. */
  samplePrompts: ReadonlyArray<{ label: string; prompt: string }>
  /**
   * Optional list of alternate models the UI can expose via a dropdown.
   * By convention the entry matching {@link model} is listed first so it
   * appears at the top of the selector, but nothing enforces that — the UI
   * seeds the selection from {@link model} directly.
   */
  models?: ReadonlyArray<{ id: string; label: string }>
}

export const AUDIO_PROVIDERS: ReadonlyArray<AudioProviderConfig> = [
  {
    id: 'gemini-lyria',
    label: 'Gemini Lyria',
    model: 'lyria-3-clip-preview',
    models: [
      {
        id: 'lyria-3-clip-preview',
        label: 'Lyria 3 Clip (30s MP3)',
      },
      {
        id: 'lyria-3-pro-preview',
        label: 'Lyria 3 Pro (full-length MP3/WAV)',
      },
    ],
    description: 'Google Lyria 3 music generation.',
    placeholder: 'Ambient piano with warm pads and soft strings',
    samplePrompts: [
      {
        label: 'Late-night jazz trio',
        prompt:
          'A contemplative jazz trio with brushed drums, walking upright bass, and smoky piano chords.',
      },
      {
        label: 'Hero at dawn',
        prompt:
          'An epic film score for a hero cresting a mountain at dawn: horns, choir, and taiko drums.',
      },
      {
        label: 'Haunted elevator',
        prompt:
          'Cheerful 1950s elevator music, but subtly out of tune, like the elevator is haunted.',
      },
      {
        label: 'Polka funeral',
        prompt:
          'A funeral dirge unexpectedly remixed as an upbeat accordion polka.',
      },
    ],
  },
  {
    id: 'fal-audio',
    label: 'Fal Audio',
    model: 'fal-ai/elevenlabs/music',
    models: [
      { id: 'fal-ai/elevenlabs/music', label: 'ElevenLabs Music' },
      {
        id: 'fal-ai/stable-audio-25/text-to-audio',
        label: 'Stable Audio 2.5',
      },
      {
        id: 'fal-ai/ace-step/prompt-to-audio',
        label: 'ACE-Step (prompt-to-audio)',
      },
    ],
    description: 'Fal-hosted open music generation models.',
    placeholder: 'A lo-fi hip-hop beat with vinyl crackle',
    defaultDuration: 10,
    samplePrompts: [
      {
        label: 'Lo-fi study beat',
        prompt:
          'A mellow lo-fi hip-hop beat with warm vinyl crackle, dusty Rhodes chords, and soft swing.',
      },
      {
        label: 'Ambient drone',
        prompt:
          'A slow ambient drone with shimmering reverb, distant field recordings, and evolving pads.',
      },
      {
        label: 'Seagull Eurovision',
        prompt:
          'A Eurovision-style power ballad performed entirely by a choir of disgruntled seagulls.',
      },
      {
        label: 'Hydrophobic pirate',
        prompt:
          'The rousing theme song for a swashbuckling pirate who is terrified of water.',
      },
      {
        label: 'Death metal laundry',
        prompt:
          'A death metal ballad about losing your favorite socks in the dryer, complete with guttural vocals.',
      },
    ],
  },
  {
    id: 'fal-sfx',
    label: 'Fal SFX',
    model: 'fal-ai/mmaudio-v2/text-to-audio',
    models: [
      {
        id: 'fal-ai/mmaudio-v2/text-to-audio',
        label: 'MMAudio v2 Text-to-Audio',
      },
    ],
    description: 'Fal-hosted text-to-SFX models for short sound effects.',
    placeholder: 'Glass shattering on a tile floor',
    defaultDuration: 5,
    samplePrompts: [
      {
        label: 'Rain on tin roof',
        prompt: 'Steady rain pattering on a corrugated metal roof at night.',
      },
      {
        label: 'Marble hallway steps',
        prompt:
          'Slow leather-soled footsteps echoing through an empty marble hallway.',
      },
      {
        label: 'Interrogated duck',
        prompt:
          'A rubber duck being dramatically interrogated under a swinging lamp, squeaks only.',
      },
      {
        label: 'Cartoon banana slip',
        prompt:
          'Classic cartoon banana slip: quick slide, comedic boing, and a distant crash.',
      },
    ],
  },
]
