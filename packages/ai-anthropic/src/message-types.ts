import type {
  CacheControlEphemeral,
  CitationsConfigParam,
  TextCitationParam,
} from '@anthropic-ai/sdk/resources'

export type AnthropicImageMediaType =
  | 'image/jpeg'
  | 'image/png'
  | 'image/gif'
  | 'image/webp'

export interface AnthropicImageMetadata {
  mediaType?: AnthropicImageMediaType
  cache_control?: CacheControlEphemeral
}

export interface AnthropicTextMetadata {
  cache_control?: CacheControlEphemeral
  citations?: Array<TextCitationParam>
}
export type AnthropicDocumentMediaType = 'application/pdf'

export interface AnthropicDocumentMetadata {
  mediaType?: AnthropicDocumentMediaType
  cache_control?: CacheControlEphemeral

  citations?: CitationsConfigParam

  context?: string

  filename?: string

  title?: string
}

export interface AnthropicAudioMetadata {
  mediaType?:
    | 'audio/mpeg'
    | 'audio/wav'
    | 'audio/ogg'
    | 'audio/webm'
    | 'audio/flac'
}

export interface AnthropicVideoMetadata {
  mediaType?: 'video/mp4' | 'video/webm' | 'video/mpeg'
}

export interface AnthropicMessageMetadataByModality {
  text: AnthropicTextMetadata
  image: AnthropicImageMetadata
  audio: AnthropicAudioMetadata
  video: AnthropicVideoMetadata
  document: AnthropicDocumentMetadata
}
