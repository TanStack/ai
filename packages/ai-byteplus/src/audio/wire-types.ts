/**
 * Minimal wire types for the BytePlus **Seed Speech** HTTP API (TTS + ASR).
 *
 * Seed Speech is a separate product from Ark: it lives on
 * `voice.ap-southeast-1.bytepluses.com`, authenticates with `X-Api-Key`
 * (a different key from `ARK_API_KEY`), and returns a flat numeric error
 * envelope instead of Ark's OpenAI-shaped one.
 *
 * Only the fields the adapters read or write are modelled here — this is a
 * hand-written subset, not a generated schema.
 *
 * Provenance:
 * - Endpoints, auth header, format/rate ranges and the 120 s TTS output cap:
 *   BytePlus Seed Speech docs (`docs.byteplus.com/en/docs/byteplusvoice`),
 *   captured in the Phase 0 research notes.
 * - Error envelope `{code, message}`: verified live — an Ark key sent as
 *   `X-Api-Key` returns HTTP 401 `{"code":45000010,"message":"Invalid X-Api-Key"}`.
 * - ASR request/response shape (`user`/`audio`/`request` in, `audio_info` +
 *   `result.utterances` out, all timings in **milliseconds**): the Volcengine
 *   flash-recognition reference the BytePlus endpoint is derived from
 *   (`docs.volcengine.com/docs/6561/1631584`).
 *
 * No Seed Speech API key was available when these were written, so the TTS
 * response fields are documented-but-unverified; the adapters parse them
 * defensively rather than assuming they are always present.
 */

// ============================================================================
// TTS — POST /api/v3/tts/create
// ============================================================================

/** Output container/codec accepted by `audio_config.format`. */
export type BytePlusTTSAudioFormat = 'wav' | 'mp3' | 'pcm' | 'ogg_opus'

/**
 * `audio_config` block of a TTS request.
 *
 * The three `*_rate` fields are integer percentages relative to the voice's
 * neutral delivery, not multipliers.
 */
export interface BytePlusTTSAudioConfig {
  /** Output format. Defaults to the service's own default when omitted. */
  format?: BytePlusTTSAudioFormat
  /** Output sample rate in Hz (commonly 8000 / 16000 / 24000 / 48000). */
  sample_rate?: number
  /** Pitch adjustment, `-12`..`12`. `0` is the voice's natural pitch. */
  pitch_rate?: number
  /**
   * Speaking rate. The documented range is `-50`..`100`; the multiplier
   * anchors (`-50` ≈ 0.5×, `0` = 1×, `100` ≈ 2×) are inferred rather than
   * documented — see `toSpeechRate` in `../adapters/tts`.
   */
  speech_rate?: number
  /** Loudness adjustment, `-50`..`100`. `0` is the voice's natural level. */
  loudness_rate?: number
}

/** Request body for `POST /api/v3/tts/create`. */
export interface BytePlusTTSCreateRequest {
  /** Seed Speech synthesis model, e.g. `seed-audio-1.0`. */
  model: string
  /**
   * The text to speak.
   *
   * **Open question.** The Phase 0 research notes record this field as
   * `text_prompt`, but BytePlus' published samples are inconsistent about
   * whether it is `text_prompt` or a plain `text`, and no key was available
   * to settle it. The adapter writes it through the single `TTS_TEXT_FIELD`
   * constant in `../adapters/tts` so both sides change together.
   */
  text_prompt: string
  /** Voice identifier, e.g. `en_female_stokie_uranus_bigtts`. */
  speaker: string
  audio_config?: BytePlusTTSAudioConfig
  /** Return per-word timing information alongside the audio. */
  enable_subtitle?: boolean
}

/** One timed entry of a TTS `subtitle` array. Times are in milliseconds. */
export interface BytePlusTTSSubtitleEntry {
  text?: string
  start_time?: number
  end_time?: number
}

/** Response body for `POST /api/v3/tts/create`. */
export interface BytePlusTTSCreateResponse {
  /** Base64-encoded audio in the requested `audio_config.format`. */
  audio?: string
  /**
   * Length of the generated audio. The unit is not pinned in the published
   * docs; see `toDurationSeconds` in `../adapters/tts` for how it is resolved.
   */
  duration?: number | string
  /** Temporary download URL for the same audio. Expires after ~2 hours. */
  url?: string
  /** Word timings, present when `enable_subtitle` was set. */
  subtitle?: Array<BytePlusTTSSubtitleEntry>
}

// ============================================================================
// ASR — POST /api/v3/auc/bigmodel/recognize/flash
// ============================================================================

/**
 * Value of the `X-Api-Resource-Id` header that selects the Seed ASR turbo
 * model. The flash endpoint takes no `model` field in its body — the model is
 * chosen entirely by this header.
 */
export const BYTEPLUS_ASR_RESOURCE_ID = 'volc.seedasr.auc_turbo'

/** Header name carrying {@link BYTEPLUS_ASR_RESOURCE_ID}. */
export const BYTEPLUS_ASR_RESOURCE_HEADER = 'X-Api-Resource-Id'

/**
 * Audio input. Exactly one of `url` or `data` is sent — the endpoint accepts
 * files up to 2 hours long / 100 MB.
 */
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
  /**
   * Extra per-utterance annotations. Speaker labels arrive here when
   * `enable_speaker_info` is set; the exact key is read defensively because it
   * could not be confirmed against a live response.
   */
  additions?: Record<string, string>
}

export interface BytePlusASRResult {
  text?: string
  utterances?: Array<BytePlusASRUtterance>
}

/**
 * Response body for `POST /api/v3/auc/bigmodel/recognize/flash`.
 *
 * The Volcengine-lineage wire shape nests everything under `result`; BytePlus'
 * prose docs describe the same payload as "transcript + utterances", so the
 * flat spelling is tolerated as a fallback.
 */
export interface BytePlusASRRecognizeResponse {
  /** `duration` is the audio length in **milliseconds**. */
  audio_info?: { duration?: number }
  result?: BytePlusASRResult
  /** Flat alias for `result.text`. */
  transcript?: string
  /** Flat alias for `result.utterances`. */
  utterances?: Array<BytePlusASRUtterance>
}

// ============================================================================
// Errors
// ============================================================================

/**
 * Seed Speech error envelope: a flat numeric `code` plus a `message`, e.g.
 * `{"code": 45000010, "message": "Invalid X-Api-Key"}` (verified live on a
 * 401). Format it with `bytePlusVoiceError` from `../utils/client`.
 */
export interface BytePlusVoiceErrorBody {
  code?: number
  message?: string
}
