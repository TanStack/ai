/**
 * Bedrock-specific metadata types for multimodal content parts.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/conversation-inference.html
 */

import type {
  DocumentFormat,
  ImageFormat,
  S3Location,
  VideoFormat,
} from '@aws-sdk/client-bedrock-runtime'

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ImageBlock.html
 */
export type BedrockImageFormat = ImageFormat

/**
 * The Bedrock Converse API does not currently support audio input.
 */
export type BedrockAudioFormat = never

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_VideoBlock.html
 */
export type BedrockVideoFormat = VideoFormat

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_DocumentBlock.html
 */
export type BedrockDocumentFormat = DocumentFormat

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_S3Location.html
 */
export type BedrockS3Location = S3Location

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_ImageBlock.html
 */
export interface BedrockImageMetadata {
  format?: BedrockImageFormat
  /**
   * S3 location for the image. When provided, the image will be loaded from S3
   * instead of using inline base64 data.
   */
  s3Location?: BedrockS3Location
}

/**
 * The Bedrock Converse API does not currently support audio input.
 */
export interface BedrockAudioMetadata {}

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_VideoBlock.html
 */
export interface BedrockVideoMetadata {
  format?: BedrockVideoFormat
  /**
   * S3 location for the video. When provided, the video will be loaded from S3
   * instead of using inline base64 data.
   */
  s3Location?: BedrockS3Location
}

/**
 * @see https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_DocumentBlock.html
 */
export interface BedrockDocumentMetadata {
  format?: BedrockDocumentFormat
  /**
   * S3 location for the document. When provided, the document will be loaded from S3
   * instead of using inline base64 data.
   */
  s3Location?: BedrockS3Location
  /**
   * Name for the document. If not provided, a default name will be generated.
   */
  name?: string
}

/**
 * Metadata for Bedrock text content parts.
 */
export interface BedrockTextMetadata {}

/**
 * Map of modality types to their Bedrock-specific metadata types.
 */
export interface BedrockMessageMetadataByModality {
  text: BedrockTextMetadata
  image: BedrockImageMetadata
  audio: BedrockAudioMetadata
  video: BedrockVideoMetadata
  document: BedrockDocumentMetadata
}
