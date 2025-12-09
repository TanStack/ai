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
