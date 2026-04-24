export interface OpenAICompatibleImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface OpenAICompatibleAudioMetadata {
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

export interface OpenAICompatibleVideoMetadata {}
export interface OpenAICompatibleDocumentMetadata {}
export interface OpenAICompatibleTextMetadata {}

export interface OpenAICompatibleMessageMetadataByModality {
  text: OpenAICompatibleTextMetadata
  image: OpenAICompatibleImageMetadata
  audio: OpenAICompatibleAudioMetadata
  video: OpenAICompatibleVideoMetadata
  document: OpenAICompatibleDocumentMetadata
}
