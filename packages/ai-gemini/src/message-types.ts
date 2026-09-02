/**
 * Gemini-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Gemini-specific options.
 *
 * Gemini uses a unified approach where all media types share similar metadata structure.
 *
 * @see https://ai.google.dev/gemini-api/docs/vision
 * @see https://ai.google.dev/gemini-api/docs/audio
 * @see https://ai.google.dev/gemini-api/docs/document-processing
 */

/**
 * Supported image MIME types for Gemini.
 */
export type GeminiImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'

/**
 * Supported audio MIME types for Gemini.
 */
export type GeminiAudioMimeType =
  | 'audio/wav'
  | 'audio/mp3'
  | 'audio/aiff'
  | 'audio/aac'
  | 'audio/ogg'
  | 'audio/flac'

/**
 * Supported video MIME types for Gemini.
 */
export type GeminiVideoMimeType =
  | 'video/mp4'
  | 'video/mpeg'
  | 'video/mov'
  | 'video/avi'
  | 'video/x-flv'
  | 'video/mpg'
  | 'video/webm'
  | 'video/wmv'
  | 'video/3gpp'

/**
 * Supported document MIME types for Gemini.
 */
export type GeminiDocumentMimeType =
  | 'application/pdf'
  | 'text/plain'
  | 'text/html'
  | 'text/css'
  | 'text/javascript'
  | 'application/x-javascript'
  | 'text/x-typescript'
  | 'application/x-typescript'
  | 'text/csv'
  | 'text/markdown'
  | 'application/json'
  | 'application/xml'

/**
 * Metadata for Gemini image content parts.
 */
export interface GeminiImageMetadata {
  /**
   * The MIME type of the image.
   * Required for proper content processing.
   *
   * @see https://ai.google.dev/gemini-api/docs/vision#supported-formats
   */
  mimeType?: GeminiImageMimeType
}

/**
 * Metadata for Gemini audio content parts.
 */
export interface GeminiAudioMetadata {
  /**
   * The MIME type of the audio.
   * Required for proper content processing.
   *
   * @see https://ai.google.dev/gemini-api/docs/audio#supported-formats
   */
  mimeType?: GeminiAudioMimeType
}

/**
 * How Gemini processes a video for understanding.
 *
 * - `static` (default): single-pass frame sampling via `generateContent`.
 * - `agentic`: multi-pass "agentic" video understanding, GA on the
 *   `agentic_video`-capable flash models (`gemini-3.7-flash`,
 *   `gemini-3.6-flash`, `gemini-3.5-flash-lite`). The text adapter routes the
 *   request through the Interactions API instead of `generateContent`. With
 *   `agentic`, the sampling rate is expressed in the text prompt (e.g. "watch
 *   it at 0.5 fps"), not via `fps`.
 */
export type GeminiVideoProcessing = 'agentic' | 'static'

/**
 * Metadata for Gemini video content parts.
 */
export interface GeminiVideoMetadata {
  /**
   * The MIME type of the video.
   * Required for proper content processing.
   *
   * @see https://ai.google.dev/gemini-api/docs/vision#video-requirements
   */
  mimeType?: GeminiVideoMimeType
  /**
   * How the model processes this video for understanding. When set, the
   * adapter routes the request through the Gemini Interactions API. Omit for
   * the default single-pass `generateContent` behavior.
   */
  processing?: GeminiVideoProcessing
  /**
   * Frame-rate sampling density (frames per second) for single-pass
   * (`generateContent`) understanding. Valid range (0, 24]; defaults to 1.0
   * on the server. Ignored when `processing` is `agentic`.
   *
   * @see https://ai.google.dev/gemini-api/docs/vision#customize-frame-rate
   */
  fps?: number
  /**
   * Clip start offset, as a decimal number of seconds with an `s` suffix
   * (e.g. `"10.5s"`). Restricts understanding to a segment of the video.
   */
  startOffset?: string
  /**
   * Clip end offset, as a decimal number of seconds with an `s` suffix
   * (e.g. `"45s"`). Restricts understanding to a segment of the video.
   */
  endOffset?: string
}

/**
 * Metadata for Gemini document content parts.
 */
export interface GeminiDocumentMetadata {
  /**
   * The MIME type of the document.
   * Required for proper content processing.
   *
   * @see https://ai.google.dev/gemini-api/docs/document-processing
   */
  mimeType?: GeminiDocumentMimeType
}

/**
 * Metadata for Gemini text content parts.
 * Currently no specific metadata options for text in Gemini.
 */
export interface GeminiTextMetadata {}

/**
 * Map of modality types to their Gemini-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface GeminiMessageMetadataByModality {
  text: GeminiTextMetadata
  image: GeminiImageMetadata
  audio: GeminiAudioMetadata
  video: GeminiVideoMetadata
  document: GeminiDocumentMetadata
}

/**
 * Provider-specific metadata that round-trips with each Gemini tool call.
 *
 * `thoughtSignature` is emitted by Gemini 3.x (and 2.5 thinking) models on
 * the Part containing the `functionCall`. The same signature must be echoed
 * back at the Part level on the next turn or the API rejects the request
 * with `400 INVALID_ARGUMENT: "Function call is missing a thought_signature"`.
 *
 * @see https://ai.google.dev/gemini-api/docs/thinking
 */
export interface GeminiToolCallMetadata {
  thoughtSignature?: string
}
