export interface BedrockTextMetadata {}

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
