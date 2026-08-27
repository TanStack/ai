export interface OllamaImageMetadata {
  format?: 'jpeg' | 'png' | 'gif' | 'webp'
}

export interface OllamaAudioMetadata {
  format?: 'wav' | 'mp3' | 'ogg'
}

export interface OllamaVideoMetadata {
  format?: 'mp4' | 'webm'
}

export interface OllamaDocumentMetadata {
  mediaType?: 'application/pdf'
}

export interface OllamaMessageMetadataByModality {
  image: OllamaImageMetadata
  audio: OllamaAudioMetadata
  video: OllamaVideoMetadata
  document: OllamaDocumentMetadata
}
