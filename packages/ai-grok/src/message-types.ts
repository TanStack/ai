export interface GrokImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface GrokAudioMetadata {
  format?: 'mp3' | 'wav' | 'flac' | 'ogg' | 'webm' | 'aac'
}

export interface GrokVideoMetadata {}

export interface GrokDocumentMetadata {}

export interface GrokTextMetadata {}

export interface GrokMessageMetadataByModality {
  text: GrokTextMetadata
  image: GrokImageMetadata
  audio: GrokAudioMetadata
  video: GrokVideoMetadata
  document: GrokDocumentMetadata
}
