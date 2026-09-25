/**
 * A Bedrock prompt-cache checkpoint. Bedrock caches everything in the request
 * before this block and reads it back at the cache rate while the entry lives.
 * A request may carry up to four. Omit `ttl` for the 5-minute default.
 *
 * @see https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html
 */
export interface BedrockCachePoint {
  type: 'default'
  ttl?: '5m' | '1h'
}

/** Metadata on a `systemPrompts` entry, read by the Converse adapter. */
export interface BedrockSystemPromptMetadata {
  /** Place a cache checkpoint right after this system prompt. */
  cachePoint?: BedrockCachePoint
}

/** Metadata on a tool definition, read by the Converse adapter. */
export interface BedrockToolMetadata {
  /** Place a cache checkpoint right after this tool's definition. */
  cachePoint?: BedrockCachePoint
}

/**
 * Bedrock content-part metadata by modality, used for type inference when
 * constructing multimodal messages. Bedrock's OpenAI-compatible Chat
 * Completions accepts the standard OpenAI image-detail hint; the Converse
 * adapter reads `cachePoint` on text parts.
 */
export interface BedrockTextMetadata {
  /** Place a cache checkpoint right after this text block (Converse only). */
  cachePoint?: BedrockCachePoint
}

export interface BedrockImageMetadata {
  /** Image processing detail: 'auto' (default), 'low', or 'high'. */
  detail?: 'auto' | 'low' | 'high'
}

export interface BedrockAudioMetadata {}
export interface BedrockVideoMetadata {}
export interface BedrockDocumentMetadata {}

export interface BedrockMessageMetadataByModality {
  text: BedrockTextMetadata
  image: BedrockImageMetadata
  audio: BedrockAudioMetadata
  video: BedrockVideoMetadata
  document: BedrockDocumentMetadata
}
