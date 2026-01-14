
/**
 * Bedrock-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Bedrock-specific options.
 */

/**
 * Supported image media types for Bedrock.
 */
export type BedrockImageMediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

/**
 * Metadata for Bedrock image content parts.
 */
export interface BedrockImageMetadata {
    /**
     * The MIME type of the image.
     */
    mediaType?: BedrockImageMediaType
}

/**
 * Metadata for Bedrock text content parts.
 */
export interface BedrockTextMetadata { }

/**
 * Metadata for Bedrock document content parts.
 */
export interface BedrockDocumentMetadata {
    /**
     * The MIME type of the document.
     */
    mediaType?: string
    /**
     * The name of the document.
     */
    name?: string
}

/**
 * Metadata for Bedrock audio content parts.
 */
export interface BedrockAudioMetadata {
    /**
     * The MIME type of the audio.
     */
    mediaType?: string
}

/**
 * Metadata for Bedrock video content parts.
 */
export interface BedrockVideoMetadata {
    /**
     * The MIME type of the video.
     */
    mediaType?: string
}

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
