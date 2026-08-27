export interface BytePlusEncryptedContentFields {
  encrypted_content?: string
}

export interface BytePlusStreamDeltaExtras extends BytePlusEncryptedContentFields {
  reasoning_content?: string
}

export interface BytePlusImagePixelLimit {
  max_pixels?: number
  min_pixels?: number
}

export interface BytePlusImageUrlContentPart {
  type: 'image_url'
  image_url: {
    url: string
    detail?: 'auto' | 'low' | 'high' | 'xhigh'
    image_pixel_limit?: BytePlusImagePixelLimit
  }
}

export interface BytePlusVideoUrlContentPart {
  type: 'video_url'
  video_url: {
    url: string
    fps?: number
  }
}

export interface BytePlusInputAudioContentPart {
  type: 'input_audio'
  input_audio: {
    /** Base64 audio payload. Mutually exclusive with `url`. */
    data?: string
    /** Container format of `data`. Required whenever `data` is set. */
    format?: 'wav' | 'mp3' | 'ogg' | 'flac' | 'm4a' | 'aac' | 'pcm'
    /** Public audio URL. Mutually exclusive with `data`. */
    url?: string
  }
}

export type BytePlusChatContentPart =
  | BytePlusImageUrlContentPart
  | BytePlusVideoUrlContentPart
  | BytePlusInputAudioContentPart

export interface BytePlusTextMetadata {}

export interface BytePlusImageMetadata {
  detail?: 'auto' | 'low' | 'high' | 'xhigh'

  image_pixel_limit?: BytePlusImagePixelLimit
}

export interface BytePlusAudioMetadata {
  format?: BytePlusInputAudioContentPart['input_audio']['format']
}

export interface BytePlusVideoMetadata {
  /** Frame sampling rate in frames per second. */
  fps?: number
}

export interface BytePlusDocumentMetadata {}

export interface BytePlusMessageMetadataByModality {
  text: BytePlusTextMetadata
  image: BytePlusImageMetadata
  audio: BytePlusAudioMetadata
  video: BytePlusVideoMetadata
  document: BytePlusDocumentMetadata
}
