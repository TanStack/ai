/**
 * Muse message metadata types.
 *
 * Muse uses the OpenAI Chat Completions wire format, so these hold the
 * provider-specific metadata a caller can attach to each content part. Muse
 * has no extra per-part options today, so text is empty and image mirrors the
 * standard `detail` control.
 */

/** Metadata for Muse text content parts. */
export interface MuseTextMetadata {}

/** Metadata for Muse image content parts. */
export interface MuseImageMetadata {
  /**
   * The detail level of the image.
   * - 'auto': let the model decide based on image size and content
   * - 'low': low resolution processing (faster, cheaper, less detail)
   * - 'high': high resolution processing (slower, more expensive, more detail)
   *
   * @default 'auto'
   */
  detail?: 'auto' | 'low' | 'high'
}

/** Metadata for Muse audio content parts. */
export interface MuseAudioMetadata {}

/** Metadata for Muse video content parts. */
export interface MuseVideoMetadata {}

/** Metadata for Muse document content parts. */
export interface MuseDocumentMetadata {}

/**
 * Map of modality types to their Muse-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface MuseMessageMetadataByModality {
  text: MuseTextMetadata
  image: MuseImageMetadata
  audio: MuseAudioMetadata
  video: MuseVideoMetadata
  document: MuseDocumentMetadata
}
