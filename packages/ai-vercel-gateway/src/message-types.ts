export interface VercelGatewayDocumentMetadata {}

export interface VercelGatewayTextMetadata {}

export interface VercelGatewayImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface VercelGatewayAudioMetadata {}

export interface VercelGatewayVideoMetadata {}

export interface VercelGatewayMessageMetadataByModality {
  text: VercelGatewayTextMetadata
  image: VercelGatewayImageMetadata
  audio: VercelGatewayAudioMetadata
  video: VercelGatewayVideoMetadata
  document: VercelGatewayDocumentMetadata
}
