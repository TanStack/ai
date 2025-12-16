/**
 * Claude Agent SDK-specific metadata types for multimodal content parts.
 * These types extend the base ContentPart metadata with Claude-specific options.
 */

/**
 * Cache control settings for ephemeral content.
 */
export interface CacheControlEphemeral {
  type: 'ephemeral'
}

/**
 * Supported image media types for Claude.
 */
export type ClaudeAgentSdkImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'

/**
 * Metadata for Claude Agent SDK text content parts.
 */
export interface ClaudeAgentSdkTextMetadata {
  /**
   * Cache control settings for the text content.
   */
  cache_control?: CacheControlEphemeral
}

/**
 * Metadata for Claude Agent SDK image content parts.
 */
export interface ClaudeAgentSdkImageMetadata {
  /**
   * The MIME type of the image.
   * Required when using base64 source type.
   */
  mediaType?: ClaudeAgentSdkImageMediaType
  /**
   * Cache control settings for the image content.
   */
  cache_control?: CacheControlEphemeral
}

/**
 * Supported document media types for Claude.
 */
export type ClaudeAgentSdkDocumentMediaType = 'application/pdf'

/**
 * Metadata for Claude Agent SDK document content parts (e.g., PDFs).
 */
export interface ClaudeAgentSdkDocumentMetadata {
  /**
   * The MIME type of the document.
   * Required for document content, typically 'application/pdf'.
   */
  mediaType?: ClaudeAgentSdkDocumentMediaType
  /**
   * Cache control settings for the document.
   */
  cache_control?: CacheControlEphemeral
  /**
   * Optional title for the document.
   */
  title?: string
}

/**
 * Metadata for Claude Agent SDK audio content parts.
 * Note: Audio is NOT supported by Claude - placeholder for type compatibility.
 */
export type ClaudeAgentSdkAudioMetadata = Record<string, never>

/**
 * Metadata for Claude Agent SDK video content parts.
 * Note: Video is NOT supported by Claude - placeholder for type compatibility.
 */
export type ClaudeAgentSdkVideoMetadata = Record<string, never>

/**
 * Map of modality types to their Claude Agent SDK-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface ClaudeAgentSdkMessageMetadataByModality {
  text: ClaudeAgentSdkTextMetadata
  image: ClaudeAgentSdkImageMetadata
  audio: ClaudeAgentSdkAudioMetadata
  video: ClaudeAgentSdkVideoMetadata
  document: ClaudeAgentSdkDocumentMetadata
}
