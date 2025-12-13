export interface OpenRouterTextMetadata {}

export interface OpenRouterImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface OpenRouterAudioMetadata {}

export interface OpenRouterVideoMetadata {}

export interface OpenRouterDocumentMetadata {}

export interface OpenRouterMessageMetadataByModality {
  text: OpenRouterTextMetadata
  image: OpenRouterImageMetadata
  audio: OpenRouterAudioMetadata
  video: OpenRouterVideoMetadata
  document: OpenRouterDocumentMetadata
}
