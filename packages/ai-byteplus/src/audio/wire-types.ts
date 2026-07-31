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
 * Sample rates `audio_config.sample_rate` accepts.
 *
 * The docs also state a *default* of 40000, which is not one of the valid
 * values — a documentation bug. The adapter therefore always sends an
 * explicit rate rather than relying on the server default.
 */
export const BYTEPLUS_TTS_SAMPLE_RATES = [
  8000, 16000, 24000, 32000, 44100, 48000,
] as const

/** A sample rate `audio_config.sample_rate` accepts. */
export type BytePlusTTSSampleRate = (typeof BYTEPLUS_TTS_SAMPLE_RATES)[number]

/**
 * One entry of the request's `references` array.
 *
 * This is where the voice lives: `speaker` names a stock voice, while
 * `audio_url` / `audio_data` supply reference clips to clone (the `@Audio1`..
 * `@Audio3` markers in `text_prompt` address them positionally). Exactly one
 * of `speaker`, `audio_url` or `audio_data` may be set per entry; at most 3
 * audio references (30 s / 10 MB each) and 1 image reference (10 MB), and
 * image references are mutually exclusive with audio ones.
 *
 * **Member object shape is unresolved — must live-probe when the Seed Speech
 * key lands.** The docs list the member fields flat (`speaker | audio_data |
 * audio_url | image_data | image_url`) without a worked example, so whether
 * the server wants a flat `{ speaker }` or a discriminated `{ type, ... }`
 * could not be settled. The adapter sends the flat reading — see
 * `buildTTSRequestBody` in `../adapters/tts`.
 */
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

/**
 * `audio_config` block of a TTS request — exactly six fields.
 *
 * The three `*_rate` fields are integer percentages relative to the voice's
 * neutral delivery, not multipliers.
 */
export interface BytePlusTTSAudioConfig {
  /** Output format. Defaults to `wav` server-side. */
  format?: BytePlusTTSAudioFormat
  /**
   * Output sample rate in Hz. See {@link BYTEPLUS_TTS_SAMPLE_RATES} for the
   * valid values and for why the adapter always sends one.
   */
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
  /**
   * The text to speak (≤3000 chars). Dual-purpose: either literal text or a
   * natural-language description of the delivery, and the place the
   * `@Audio1`..`@Audio3` reference markers go.
   *
   * **`text_prompt` is correct — do not "fix" this to `text`.** This endpoint
   * has no request-side `text` field. The `text` spelling belongs to the
   * *other* endpoint, `/tts/unidirectional` (TTS 2.0), where it sits under
   * `req_params.text`. Confirmed against
   * docs.byteplus.com/en/docs/byteplusvoice/seedaudio-01, which lists this
   * body as exactly `model`, `text_prompt`, `references`, `audio_config`,
   * `watermark`.
   */
  text_prompt: string
  /** Voice selection and cloning references. See {@link BytePlusTTSReference}. */
  references?: Array<BytePlusTTSReference>
  audio_config?: BytePlusTTSAudioConfig
  /**
   * Watermark the generated audio. The field name is confirmed; the boolean
   * type is assumed by analogy with Seedream's `watermark` and unprobed.
   */
  watermark?: boolean
}

/**
 * One timed entry of a TTS subtitle track.
 *
 * **Times are milliseconds** — unlike the response's `duration` fields, which
 * are seconds. The endpoint genuinely mixes units.
 */
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
  /** Numeric status code. Present on success as well as on failure. */
  code?: number
  message?: string
  /** Base64-encoded audio in the requested `audio_config.format`. */
  audio?: string
  /**
   * Length of the delivered audio in **seconds** (float), after `speech_rate`
   * is applied. This can legitimately exceed 120 when the clip is slowed
   * down — the 120 s cap applies to {@link BytePlusTTSCreateResponse.original_duration}.
   */
  duration?: number | string
  /**
   * Length in **seconds** (float) before rate adjustment. This is the billing
   * basis and is capped at 120.
   */
  original_duration?: number | string
  /** Temporary download URL for the same audio. Expires after ~2 hours. */
  url?: string
  /** Sentence and word timings, present when `enable_subtitle` was set. */
  subtitle?: BytePlusTTSSubtitle
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
