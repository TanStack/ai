/**
 * OrcaRouter-specific message types for the Chat Completions API.
 *
 * OrcaRouter's wire format is OpenAI Chat Completions — the gateway
 * translates it to each routed provider's native format server-side, and
 * applies adaptive routing, failover, and guardrails in the same pass.
 * These type definitions describe that wire shape directly; the adapter
 * drives the endpoint with the OpenAI SDK pointed at OrcaRouter's base URL.
 *
 * @see https://www.orcarouter.ai
 */

export interface ChatCompletionNamedToolChoice {
  /** Always `function` for a named tool choice. */
  type: 'function'
  function: {
    /** The name of the function to call. */
    name: string
  }
}

/**
 * Controls which (if any) tool is called by the model.
 *
 * - `none` — the model will not call any tool and instead generates a message
 * - `auto` — the model can pick between generating a message or calling tools
 * - `required` — the model must call one or more tools
 * - Named tool choice — forces the model to call a specific tool
 */
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
  /**
   * The name of the response format. Must be a-z, A-Z, 0-9, or contain
   * underscores and dashes, with a maximum length of 64.
   */
  name: string

  /**
   * A description of what the response format is for, used by the model to
   * determine how to respond in the format.
   */
  description?: string

  /**
   * The schema for the response format, described as a JSON Schema object.
   * @see https://json-schema.org/
   */
  schema?: { [key: string]: unknown }

  /**
   * Whether to enable strict schema adherence when generating the output. If
   * set to true, the model will always follow the exact schema defined in the
   * `schema` field. Only a subset of JSON Schema is supported when `strict`
   * is `true`.
   */
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

/**
 * Metadata for OrcaRouter document content parts.
 */
export interface OrcaRouterDocumentMetadata {}

/**
 * Metadata for OrcaRouter text content parts.
 * Currently no specific metadata options for text.
 */
export interface OrcaRouterTextMetadata {}

/**
 * Metadata for OrcaRouter image content parts.
 * Controls how the model processes and analyzes images.
 */
export interface OrcaRouterImageMetadata {
  /**
   * Specifies the detail level of the image.
   * - 'auto': Let the model decide based on image size and content
   * - 'low': Use low resolution processing (faster, cheaper, less detail)
   * - 'high': Use high resolution processing (slower, more expensive, more detail)
   *
   * @default 'auto'
   */
  detail?: 'auto' | 'low' | 'high'
}

/**
 * Metadata for OrcaRouter audio content parts.
 * Note: audio input support depends on the routed model.
 */
export interface OrcaRouterAudioMetadata {}

/**
 * Metadata for OrcaRouter video content parts.
 * Note: video input support depends on the routed model.
 */
export interface OrcaRouterVideoMetadata {}

/**
 * Map of modality types to their OrcaRouter-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface OrcaRouterMessageMetadataByModality {
  text: OrcaRouterTextMetadata
  image: OrcaRouterImageMetadata
  audio: OrcaRouterAudioMetadata
  video: OrcaRouterVideoMetadata
  document: OrcaRouterDocumentMetadata
}
