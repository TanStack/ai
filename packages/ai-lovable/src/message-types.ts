/**
 * Metadata for Lovable AI Gateway document content parts.
 */
export interface LovableDocumentMetadata {}

/**
 * Metadata for Lovable AI Gateway text content parts.
 */
export interface LovableTextMetadata {}

/**
 * Metadata for Lovable AI Gateway image content parts.
 */
export interface LovableImageMetadata {
  /**
   * Specifies the detail level of the image.
   * - 'auto': Let the model decide based on image size and content
   * - 'low': Use low resolution processing (faster, cheaper, less detail)
   * - 'high': Use high resolution processing (slower, more expensive, more detail)
   *
   * @default 'auto'
   */
  detail?: 'auto' | 'low' | 'high'
}

/**
 * Metadata for Lovable AI Gateway audio content parts.
 */
export interface LovableAudioMetadata {}

/**
 * Metadata for Lovable AI Gateway video content parts.
 */
export interface LovableVideoMetadata {}

/**
 * Map of modality types to their Lovable AI Gateway metadata types.
 */
export interface LovableMessageMetadataByModality {
  text: LovableTextMetadata
  image: LovableImageMetadata
  audio: LovableAudioMetadata
  video: LovableVideoMetadata
  document: LovableDocumentMetadata
}
