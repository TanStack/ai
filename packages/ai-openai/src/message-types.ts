/**
 * OpenAI-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with OpenAI-specific options.
 *
 * @see https://platform.openai.com/docs/guides/vision
 * @see https://platform.openai.com/docs/guides/audio
 */

/**
 * Metadata for OpenAI image content parts.
 * Controls how the model processes and analyzes images.
 */
export interface OpenAIImageMetadata {
  /**
   * Controls how the model processes the image.
   * - 'auto': Let the model decide based on image size and content
   * - 'low': Use low resolution processing (faster, cheaper, less detail)
   * - 'high': Use high resolution processing (slower, more expensive, more detail)
   *
   * @default 'auto'
   * @see https://platform.openai.com/docs/guides/vision#low-or-high-fidelity-image-understanding
   */
  detail?: 'auto' | 'low' | 'high'
}

/**
 * Metadata for OpenAI audio content parts.
 * Specifies the audio format for proper processing.
 */
export interface OpenAIAudioMetadata {
  /**
   * The format of the audio.
   * Supported formats: mp3, wav, flac, etc.
   * @default 'mp3'
   */
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

/**
 * Metadata for OpenAI video content parts.
 * Note: Video support in OpenAI is limited; check current API capabilities.
 */
export interface OpenAIVideoMetadata {}

/**
 * Metadata for OpenAI document content parts.
 *
 * Documents are supported by the Responses adapter only, which sends them
 * as `input_file`; the Chat Completions adapter rejects document parts.
 * This adapter currently supports only `application/pdf` documents. That is
 * enforced locally for inline (base64) data; URL-sourced documents are sent
 * to OpenAI unvalidated, so a non-PDF URL fails server-side instead.
 *
 * @see https://developers.openai.com/api/docs/guides/pdf-files
 */
export interface OpenAIDocumentMetadata {
  /**
   * Filename sent alongside inline (base64) PDF data.
   * @default 'document.pdf'
   */
  filename?: string
  /**
   * Rendering quality for the file's page images. Omitted by default so the
   * API applies its own default ('low').
   */
  detail?: 'low' | 'high'
}

/**
 * Metadata for OpenAI text content parts.
 * Currently no specific metadata options for text in OpenAI.
 */
export interface OpenAITextMetadata {}

/**
 * Map of modality types to their OpenAI-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface OpenAIMessageMetadataByModality {
  text: OpenAITextMetadata
  image: OpenAIImageMetadata
  audio: OpenAIAudioMetadata
  video: OpenAIVideoMetadata
  document: OpenAIDocumentMetadata
}
