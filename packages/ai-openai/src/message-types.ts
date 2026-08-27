export interface OpenAIImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface OpenAIAudioMetadata {
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

export interface OpenAIVideoMetadata {}

export interface OpenAIDocumentMetadata {
  filename?: string
  detail?: 'auto' | 'low' | 'high'
}

export interface OpenAITextMetadata {}

export interface OpenAIMessageMetadataByModality {
  text: OpenAITextMetadata
  image: OpenAIImageMetadata
  audio: OpenAIAudioMetadata
  video: OpenAIVideoMetadata
  document: OpenAIDocumentMetadata
}
