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

/** Provider state required to replay an OpenRouter Responses tool call. */
export interface OpenRouterResponsesToolCallMetadata {
  /** Responses output item ID, distinct from the function call's `call_id`. */
  itemId: string
}
