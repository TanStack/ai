/**
 * Bedrock-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Bedrock-specific options.
 *
 * Bedrock supports various foundation models with different multimodal capabilities
 * through the Converse API.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html
 */

/**
 * Supported image formats for Bedrock.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ImageBlock.html
 */
export type BedrockImageFormat = 'jpeg' | 'png' | 'gif' | 'webp'

/**
 * Supported audio formats for Bedrock.
 * Note: The Bedrock Converse API does not currently support audio input in ContentBlock.
 */
export type BedrockAudioFormat = never

/**
 * Supported video formats for Bedrock.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_VideoBlock.html
 */
export type BedrockVideoFormat =
  | 'mkv'
  | 'mov'
  | 'mp4'
  | 'webm'
  | 'flv'
  | 'mpeg'
  | 'mpg'
  | 'wmv'
  | 'three_gp'

/**
 * Supported document formats for Bedrock.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_DocumentBlock.html
 */
export type BedrockDocumentFormat =
  | 'pdf'
  | 'csv'
  | 'doc'
  | 'docx'
  | 'xls'
  | 'xlsx'
  | 'html'
  | 'txt'
  | 'md'

/**
 * S3 location for media content.
 * Use this to reference files stored in Amazon S3 instead of inline base64 data.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_S3Location.html
 */
export interface BedrockS3Location {
  /**
   * S3 URI of the file (e.g., "s3://bucket-name/path/to/file.jpg")
   */
  uri: string
  /**
   * AWS account ID of the bucket owner (required for cross-account access)
   */
  bucketOwner?: string
}

/**
 * Metadata for Bedrock image content parts.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ImageBlock.html
 */
export interface BedrockImageMetadata {
  /**
   * The format of the image.
   * Required for proper content processing.
   */
  format?: BedrockImageFormat
  /**
   * S3 location for the image. When provided, the image will be loaded from S3
   * instead of using inline base64 data. This is more efficient for large files.
   */
  s3Location?: BedrockS3Location
}

/**
 * Metadata for Bedrock audio content parts.
 * Note: The Bedrock Converse API does not currently support audio input in ContentBlock.
 */
export interface BedrockAudioMetadata {}

/**
 * Metadata for Bedrock video content parts.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_VideoBlock.html
 */
export interface BedrockVideoMetadata {
  /**
   * The format of the video.
   * Required for proper content processing.
   */
  format?: BedrockVideoFormat
  /**
   * S3 location for the video. When provided, the video will be loaded from S3
   * instead of using inline base64 data. Recommended for video files.
   */
  s3Location?: BedrockS3Location
}

/**
 * Metadata for Bedrock document content parts.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_DocumentBlock.html
 */
export interface BedrockDocumentMetadata {
  /**
   * The format of the document.
   * Required for proper content processing.
   */
  format?: BedrockDocumentFormat
  /**
   * S3 location for the document. When provided, the document will be loaded from S3
   * instead of using inline base64 data.
   */
  s3Location?: BedrockS3Location
  /**
   * Optional name for the document (used for identification in responses).
   * If not provided, a default name will be generated.
   */
  name?: string
}

/**
 * Metadata for Bedrock text content parts.
 * Currently no specific metadata options for text in Bedrock.
 */
export interface BedrockTextMetadata {}

/**
 * Map of modality types to their Bedrock-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface BedrockMessageMetadataByModality {
  text: BedrockTextMetadata
  image: BedrockImageMetadata
  audio: BedrockAudioMetadata
  video: BedrockVideoMetadata
  document: BedrockDocumentMetadata
}
