/**
 * Groq-specific message types for the Chat Completions API.
 *
 * These type definitions mirror the Groq SDK types and are used internally
 * by the adapter to avoid tight coupling to the SDK's exported types.
 *
 * @see https://console.groq.com/docs/api-reference#chat
 */

export type FunctionParameters = { [key: string]: unknown }

export interface ChatCompletionNamedToolChoice {
  Function: {
    /** The name of the function to call. */
    name: string
  }
}

export interface FunctionDefinition {
  /**
   * The name of the function to be called. Must be a-z, A-Z, 0-9, or contain
   * underscores and dashes, with a maximum length of 64.
   */
  name: string

  /**
   * A description of what the function does, used by the model to choose when and
   * how to call the function.
   */
  description?: string

  /**
   * Function parameters defined as a JSON Schema object.
   * @see https://json-schema.org/understanding-json-schema/
   */
  parameters?: FunctionParameters

  /**
   * Whether to enable strict schema adherence when generating the output. If set to
   * true, the model will always follow the exact schema defined in the `schema`
   * field. Only a subset of JSON Schema is supported when `strict` is `true`.
   */
  strict?: boolean
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

export interface ChatCompletionTool {
  /**
   * The type of the tool. `function`, `browser_search`, and `code_interpreter` are
   * supported.
   */
  type: 'function' | 'browser_search' | 'code_interpreter' | (string & {})

  function?: FunctionDefinition
}

export interface CompoundCustomModels {
  /** Custom model to use for answering. */
  answering_model?: string | null

  /** Custom model to use for reasoning. */
  reasoning_model?: string | null
}

export interface CompoundCustomTools {
  /** A list of tool names that are enabled for the request. */
  enabled_tools?: Array<string> | null

  /** Configuration for the Wolfram tool integration. */
  wolfram_settings?: CompoundCustomToolsWolframSettings | null
}

export interface CompoundCustomToolsWolframSettings {
  /** API key used to authorize requests to Wolfram services. */
  authorization?: string | null
}

export interface CompoundCustom {
  models?: CompoundCustomModels | null

  /** Configuration options for tools available to Compound. */
  tools?: CompoundCustomTools | null
}

export interface DocumentSourceText {
  /** The document contents. */
  text: string

  /** Identifies this document source as inline text. */
  type: 'text'
}

export interface DocumentSourceJson {
  /** The JSON payload associated with the document. */
  data: { [key: string]: unknown }

  /** Identifies this document source as JSON data. */
  type: 'json'
}

export interface Document {
  /** The source of the document. Only text and JSON sources are currently supported. */
  source: DocumentSourceText | DocumentSourceJson

  /** Optional unique identifier that can be used for citations in responses. */
  id?: string | null
}

export interface ResponseFormatText {
  /** The type of response format being defined. Always `text`. */
  type: 'text'
}

export interface ResponseFormatJsonSchemaJsonSchema {
  /**
   * The name of the response format. Must be a-z, A-Z, 0-9, or contain underscores
   * and dashes, with a maximum length of 64.
   */
  name: string

  /**
   * A description of what the response format is for, used by the model to determine
   * how to respond in the format.
   */
  description?: string

  /**
   * The schema for the response format, described as a JSON Schema object.
   * @see https://json-schema.org/
   */
  schema?: { [key: string]: unknown }

  /**
   * Whether to enable strict schema adherence when generating the output. If set to
   * true, the model will always follow the exact schema defined in the `schema`
   * field. Only a subset of JSON Schema is supported when `strict` is `true`.
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

export interface SearchSettings {
  /**
   * Name of country to prioritize search results from
   * (e.g., "united states", "germany", "france").
   */
  country?: string | null

  /** A list of domains to exclude from the search results. */
  exclude_domains?: Array<string> | null

  /** A list of domains to include in the search results. */
  include_domains?: Array<string> | null

  /** Whether to include images in the search results. */
  include_images?: boolean | null
}

/**
 * Metadata for Groq document content parts.
 */
export interface GroqDocumentMetadata {}

/**
 * Metadata for Groq text content parts.
 * Currently no specific metadata options for text in Groq.
 */
export interface GroqTextMetadata {}

/**
 * Metadata for Groq image content parts.
 * Controls how the model processes and analyzes images.
 */
export interface GroqImageMetadata {
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
 * Metadata for Groq audio content parts.
 * Note: Audio support in Groq is limited; check current API capabilities.
 */
export interface GroqAudioMetadata {}

/**
 * Metadata for Groq video content parts.
 * Note: Groq does not currently support video input.
 */
export interface GroqVideoMetadata {}

/**
 * Map of modality types to their Groq-specific metadata types.
 * Used for type inference when constructing multimodal messages.
 */
export interface GroqMessageMetadataByModality {
  text: GroqTextMetadata
  image: GroqImageMetadata
  audio: GroqAudioMetadata
  video: GroqVideoMetadata
  document: GroqDocumentMetadata
}
