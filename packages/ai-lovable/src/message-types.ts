export interface LovableDocumentMetadata {}

export interface LovableTextMetadata {}

export interface LovableImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface LovableAudioMetadata {}

export interface LovableVideoMetadata {}

export interface LovableMessageMetadataByModality {
  text: LovableTextMetadata
  image: LovableImageMetadata
  audio: LovableAudioMetadata
  video: LovableVideoMetadata
  document: LovableDocumentMetadata
}
