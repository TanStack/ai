export interface ChatCompletionNamedToolChoice {
  /** Always `function` for a named tool choice. */
  type: 'function'
  function: {
    /** The name of the function to call. */
    name: string
  }
}

export type ChatCompletionToolChoiceOption =
  | 'none'
  | 'auto'
  | 'required'
  | ChatCompletionNamedToolChoice

export interface ResponseFormatText {
  /** The type of response format being defined. Always `text`. */
  type: 'text'
}

export interface ResponseFormatJsonSchemaJsonSchema {
  name: string

  description?: string

  schema?: { [key: string]: unknown }

  strict?: boolean | null
}

export interface ResponseFormatJsonSchema {
  /** Structured Outputs configuration options, including a JSON Schema. */
  json_schema: ResponseFormatJsonSchemaJsonSchema

  /** The type of response format being defined. Always `json_schema`. */
  type: 'json_schema'
}

export interface ResponseFormatJsonObject {
  /** The type of response format being defined. Always `json_object`. */
  type: 'json_object'
}

export interface LLMGatewayDocumentMetadata {}

export interface LLMGatewayTextMetadata {}

export interface LLMGatewayImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface LLMGatewayAudioMetadata {}

export interface LLMGatewayVideoMetadata {}

export interface LLMGatewayMessageMetadataByModality {
  text: LLMGatewayTextMetadata
  image: LLMGatewayImageMetadata
  audio: LLMGatewayAudioMetadata
  video: LLMGatewayVideoMetadata
  document: LLMGatewayDocumentMetadata
}
