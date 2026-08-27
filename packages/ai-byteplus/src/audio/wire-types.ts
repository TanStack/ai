/** Output container/codec accepted by `audio_config.format`. */
export type BytePlusTTSAudioFormat = 'wav' | 'mp3' | 'pcm' | 'ogg_opus'

export const BYTEPLUS_TTS_SAMPLE_RATES = [
  8000, 16000, 24000, 32000, 44100, 48000,
] as const

/** A sample rate `audio_config.sample_rate` accepts. */
export type BytePlusTTSSampleRate = (typeof BYTEPLUS_TTS_SAMPLE_RATES)[number]

export interface BytePlusTTSReference {
  /** Stock voice id, e.g. `en_female_stokie_uranus_bigtts`. */
  speaker?: string
  /** URL of a reference clip to clone (≤30 s, ≤10 MB). */
  audio_url?: string
  /** Base64 reference clip to clone (≤30 s, ≤10 MB). */
  audio_data?: string
  /** URL of a reference image (≤10 MB). Mutually exclusive with audio refs. */
  image_url?: string
  /** Base64 reference image (≤10 MB). Mutually exclusive with audio refs. */
  image_data?: string
}

export interface BytePlusTTSAudioConfig {
  /** Output format. Defaults to `wav` server-side. */
  format?: BytePlusTTSAudioFormat
  sample_rate?: number
  /** Speaking rate, `-50`..`100`. `-50` = 0.5×, `0` = 1×, `100` = 2×. */
  speech_rate?: number
  /** Loudness adjustment, `-50`..`100`. `0` is the voice's natural level. */
  loudness_rate?: number
  /** Pitch adjustment, `-12`..`12`. `0` is the voice's natural pitch. */
  pitch_rate?: number
  /** Emit sentence and word timings in the response. Defaults to `false`. */
  enable_subtitle?: boolean
}

/** Request body for `POST /api/v3/tts/create` — exactly five fields. */
export interface BytePlusTTSCreateRequest {
  /** Seed Speech synthesis model, e.g. `seed-audio-1.0`. */
  model: string
  text_prompt: string
  /** Voice selection and cloning references. See {@link BytePlusTTSReference}. */
  references?: Array<BytePlusTTSReference>
  audio_config?: BytePlusTTSAudioConfig
  watermark?: boolean
}

export interface BytePlusTTSSubtitleEntry {
  text?: string
  start_time?: number
  end_time?: number
}

/** Sentence- and word-level timings returned when `enable_subtitle` is set. */
export interface BytePlusTTSSubtitle {
  sentences?: Array<BytePlusTTSSubtitleEntry>
  words?: Array<BytePlusTTSSubtitleEntry>
}

/** Response body for `POST /api/v3/tts/create`. */
export interface BytePlusTTSCreateResponse {
  code?: number | string
  message?: string
  /** Base64-encoded audio in the requested `audio_config.format`. */
  audio?: string
  duration?: number | string
  original_duration?: number | string
  /** Temporary download URL for the same audio. Expires after ~2 hours. */
  url?: string
  /** Sentence and word timings, present when `enable_subtitle` was set. */
  subtitle?: BytePlusTTSSubtitle
}

export const BYTEPLUS_ASR_RESOURCE_ID = 'volc.seedasr.auc_turbo'

/** Header name carrying {@link BYTEPLUS_ASR_RESOURCE_ID}. */
export const BYTEPLUS_ASR_RESOURCE_HEADER = 'X-Api-Resource-Id'

export interface BytePlusASRAudio {
  /** Publicly reachable URL of the audio file. */
  url?: string
  /** Base64-encoded audio bytes. */
  data?: string
  /** Container hint, e.g. `mp3`, `wav`, `ogg`. */
  format?: string
}

/** `request` block of a recognition call. */
export interface BytePlusASRRequestOptions {
  /** Recognition model family. Defaults to `bigmodel`. */
  model_name?: string
  /** Inverse text normalisation (spoken numbers → digits). */
  enable_itn?: boolean
  /** Insert punctuation. */
  enable_punc?: boolean
  /** Disfluency removal ("um", repeated words). */
  enable_ddc?: boolean
  /** Attach per-utterance speaker labels. */
  enable_speaker_info?: boolean
  /** Return the `utterances` breakdown as well as the flat transcript. */
  show_utterances?: boolean
  /** Spoken language hint, e.g. `en-US`. */
  language?: string
}

/** Request body for `POST /api/v3/auc/bigmodel/recognize/flash`. */
export interface BytePlusASRRecognizeRequest {
  user?: { uid?: string }
  audio: BytePlusASRAudio
  request?: BytePlusASRRequestOptions
}

/** One recognised word. `start_time` / `end_time` are milliseconds. */
export interface BytePlusASRWord {
  text?: string
  start_time?: number
  end_time?: number
  confidence?: number
}

/** One recognised utterance. `start_time` / `end_time` are milliseconds. */
export interface BytePlusASRUtterance {
  text?: string
  start_time?: number
  end_time?: number
  words?: Array<BytePlusASRWord>
  additions?: Record<string, string>
}

export interface BytePlusASRResult {
  text?: string
  utterances?: Array<BytePlusASRUtterance>
}

export interface BytePlusASRRecognizeResponse {
  /** `duration` is the audio length in **milliseconds**. */
  audio_info?: { duration?: number }
  result?: BytePlusASRResult
  /** Flat alias for `result.text`. */
  transcript?: string
  /** Flat alias for `result.utterances`. */
  utterances?: Array<BytePlusASRUtterance>
}

export interface BytePlusVoiceErrorBody {
  code?: number
  message?: string
}
