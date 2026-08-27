export type GeminiImageMimeType =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/heic'
  | 'image/heif'

export type GeminiAudioMimeType =
  | 'audio/wav'
  | 'audio/mp3'
  | 'audio/aiff'
  | 'audio/aac'
  | 'audio/ogg'
  | 'audio/flac'

export type GeminiVideoMimeType =
  | 'video/mp4'
  | 'video/mpeg'
  | 'video/mov'
  | 'video/avi'
  | 'video/x-flv'
  | 'video/mpg'
  | 'video/webm'
  | 'video/wmv'
  | 'video/3gpp'

export type GeminiDocumentMimeType =
  | 'application/pdf'
  | 'text/plain'
  | 'text/html'
  | 'text/css'
  | 'text/javascript'
  | 'application/x-javascript'
  | 'text/x-typescript'
  | 'application/x-typescript'
  | 'text/csv'
  | 'text/markdown'
  | 'application/json'
  | 'application/xml'

export interface GeminiImageMetadata {
  mimeType?: GeminiImageMimeType
}

export interface GeminiAudioMetadata {
  mimeType?: GeminiAudioMimeType
}

export interface GeminiVideoMetadata {
  mimeType?: GeminiVideoMimeType
}

export interface GeminiDocumentMetadata {
  mimeType?: GeminiDocumentMimeType
}

export interface GeminiTextMetadata {}

export interface GeminiMessageMetadataByModality {
  text: GeminiTextMetadata
  image: GeminiImageMetadata
  audio: GeminiAudioMetadata
  video: GeminiVideoMetadata
  document: GeminiDocumentMetadata
}

export interface GeminiToolCallMetadata {
  thoughtSignature?: string
}
