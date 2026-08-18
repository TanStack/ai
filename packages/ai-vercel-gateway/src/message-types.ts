/**
 * Metadata for Vercel AI Gateway document content parts.
 */
export interface VercelGatewayDocumentMetadata {}

/**
 * Metadata for Vercel AI Gateway text content parts.
 */
export interface VercelGatewayTextMetadata {}

/**
 * Metadata for Vercel AI Gateway image content parts.
 */
export interface VercelGatewayImageMetadata {
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
 * Metadata for Vercel AI Gateway audio content parts.
 */
export interface VercelGatewayAudioMetadata {}

/**
 * Metadata for Vercel AI Gateway video content parts.
 */
export interface VercelGatewayVideoMetadata {}

/**
 * Map of modality types to their Vercel AI Gateway metadata types.
 */
export interface VercelGatewayMessageMetadataByModality {
  text: VercelGatewayTextMetadata
  image: VercelGatewayImageMetadata
  audio: VercelGatewayAudioMetadata
  video: VercelGatewayVideoMetadata
  document: VercelGatewayDocumentMetadata
}
