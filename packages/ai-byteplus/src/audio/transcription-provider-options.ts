/**
 * Provider-specific options for BytePlus Seed Speech ASR
 * (`POST /api/v3/auc/bigmodel/recognize/flash`).
 *
 * Field names mirror the wire format: everything except `uid` and
 * `audio_format` is forwarded inside the request's `request` block.
 */
export interface BytePlusTranscriptionProviderOptions {
  /**
   * Recognition model family. Defaults to `bigmodel`; the specific model is
   * selected by the `X-Api-Resource-Id` header rather than by this value.
   */
  model_name?: string
  /**
   * Container hint for the submitted audio (`mp3`, `wav`, `ogg`, …). Only
   * needed when the format can't be inferred from the input — a `File`'s name
   * or MIME type, or a data URL's MIME type, is used automatically.
   */
  audio_format?: string
  /** Inverse text normalisation: render spoken numbers, dates etc. as digits. */
  enable_itn?: boolean
  /** Insert punctuation into the transcript. */
  enable_punc?: boolean
  /** Disfluency removal — drop fillers and stutters. */
  enable_ddc?: boolean
  /**
   * Attach speaker labels to each utterance. When present they are surfaced
   * as `segment.speaker` on the result.
   */
  enable_speaker_info?: boolean
  /**
   * Return the per-utterance breakdown as well as the flat transcript.
   * Defaults to `true` so `segments` and `words` are populated.
   */
  show_utterances?: boolean
  /**
   * Spoken-language hint (e.g. `en-US`). Overrides the cross-provider
   * `TranscriptionOptions.language`.
   */
  language?: string
  /**
   * Caller identifier echoed back in BytePlus' request logs. Useful for
   * correlating usage; defaults to `tanstack-ai`.
   */
  uid?: string
}
