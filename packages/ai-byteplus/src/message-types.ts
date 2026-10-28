/**
 * BytePlus ModelArk chat message types.
 *
 * Ark's `/chat/completions` wire format is OpenAI Chat Completions plus a few
 * Ark-only extensions, so the OpenAI SDK types (via `@tanstack/openai-base`)
 * cover everything except the fields below. This file is the source of truth
 * for the Ark-only parts of a chat message:
 *
 * - `encrypted_content` on the assistant message (thinking-summary models)
 * - `video_url` content parts (no OpenAI equivalent)
 * - `input_audio` accepting a `url` as well as inline base64
 *
 * Field shapes verified live against
 * `https://ark.ap-southeast.bytepluses.com/api/v3` on 2026-07-31 — see the
 * probe findings referenced from `model-meta.ts`.
 */

/**
 * Opaque signature blob emitted alongside `reasoning_content` by the
 * thinking-summary models (see `BYTEPLUS_THINKING_SUMMARY_MODELS`).
 *
 * Non-streaming responses carry it on `choices[].message.encrypted_content`;
 * streaming delivers the whole blob as one dedicated chunk
 * (`delta.encrypted_content`, with empty `content` / `reasoning_content`)
 * between the reasoning deltas and the content deltas.
 *
 * When present it should be echoed back verbatim on the assistant message in
 * the next turn. Probing showed omitting it does *not* fail a request, so it
 * is preserved-and-replayed rather than required.
 */
export interface BytePlusEncryptedContentFields {
  encrypted_content?: string
}

/**
 * Streaming delta fields Ark adds on top of the OpenAI chunk shape.
 */
export interface BytePlusStreamDeltaExtras extends BytePlusEncryptedContentFields {
  reasoning_content?: string
}

/**
 * Bounds on how large an image is scaled to before tokenization.
 *
 * Probe-verified to live *inside* `image_url` (a number at the content-part
 * level is silently ignored; Ark validates the object form — asking for
 * `min_pixels` below the model's floor is rejected with a specific error).
 */
export interface BytePlusImagePixelLimit {
  max_pixels?: number
  min_pixels?: number
}

/**
 * Image content part. Ark's `image_url` extends OpenAI's with an `xhigh`
 * detail level and {@link BytePlusImagePixelLimit}.
 */
export interface BytePlusImageUrlContentPart {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high' | 'xhigh'
    image_pixel_limit?: BytePlusImagePixelLimit
  }
}

/**
 * Video content part. Ark accepts a public URL or a `data:` URI; there is no
 * OpenAI Chat Completions equivalent, so this shape is defined here.
 */
export interface BytePlusVideoUrlContentPart {
  type: 'video_url'
  video_url: {
    url: string
    /**
     * Frame sampling rate in frames per second. Omitted by the adapter unless
     * the caller sets it through content-part metadata.
     */
    fps?: number
  }
}

/**
 * Audio content part. Ark extends OpenAI's `input_audio` (inline base64 +
 * `format`) with a `url` alternative.
 */
export interface BytePlusInputAudioContentPart {
  type: 'input_audio'
  input_audio: {
    /** Base64 audio payload. Mutually exclusive with `url`. */
    data?: string
    /** Container format of `data`. Required whenever `data` is set. */
    format?: 'wav' | 'mp3' | 'ogg' | 'flac' | 'm4a' | 'aac' | 'pcm'
    /** Public audio URL. Mutually exclusive with `data`. */
    url?: string
  }
}

/**
 * The Ark-only content parts, as a single union. The adapter funnels these
 * through one documented cast when handing them to the OpenAI SDK, whose
 * content-part union has no arm for `video_url`, for URL-addressed audio, or
 * for the extra `image_url` fields.
 */
export type BytePlusChatContentPart =
  | BytePlusImageUrlContentPart
  | BytePlusVideoUrlContentPart
  | BytePlusInputAudioContentPart

/**
 * Metadata for BytePlus text content parts. Ark has no text-part options.
 */
export interface BytePlusTextMetadata {}

/**
 * Metadata for BytePlus image content parts.
 */
export interface BytePlusImageMetadata {
  /**
   * Processing detail for the image. Ark adds `xhigh` to OpenAI's set.
   *
   * @default 'auto'
   */
  detail?: 'auto' | 'low' | 'high' | 'xhigh'

  /**
   * Bounds the pixel count the image is scaled to before tokenization —
   * see {@link BytePlusImagePixelLimit}. Lower `max_pixels` trades detail for
   * input tokens.
   */
  image_pixel_limit?: BytePlusImagePixelLimit
}

/**
 * Metadata for BytePlus audio content parts.
 */
export interface BytePlusAudioMetadata {
  /**
   * Container format for inline base64 audio. Inferred from the part's
   * `mimeType` when omitted.
   */
  format?: BytePlusInputAudioContentPart['input_audio']['format']
}

/**
 * Metadata for BytePlus video content parts.
 */
export interface BytePlusVideoMetadata {
  /** Frame sampling rate in frames per second. */
  fps?: number
}

/**
 * Metadata for BytePlus document content parts. Ark's chat API takes no
 * document parts — the field exists so the modality map stays total.
 */
export interface BytePlusDocumentMetadata {}

/**
 * Map of modality to BytePlus-specific content-part metadata. Used for type
 * inference when constructing multimodal messages.
 */
export interface BytePlusMessageMetadataByModality {
  text: BytePlusTextMetadata
  image: BytePlusImageMetadata
  audio: BytePlusAudioMetadata
  video: BytePlusVideoMetadata
  document: BytePlusDocumentMetadata
}
