export type FunctionParameters = { [key: string]: unknown }

export interface ChatCompletionNamedToolChoice {
  /** Always `function` for a named tool choice. */
  type: 'function'
  function: {
    /** The name of the function to call. */
    name: string
  }
}

export interface FunctionDefinition {
  name: string

  description?: string

  parameters?: FunctionParameters

  strict?: boolean
}

export type ChatCompletionToolChoiceOption =
  | 'none'
  | 'auto'
  | 'required'
  | ChatCompletionNamedToolChoice

export interface ChatCompletionTool {
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

export interface SearchSettings {
  country?: string | null

  /** A list of domains to exclude from the search results. */
  exclude_domains?: Array<string> | null

  /** A list of domains to include in the search results. */
  include_domains?: Array<string> | null

  /** Whether to include images in the search results. */
  include_images?: boolean | null
}

export interface GroqDocumentMetadata {}

export interface GroqTextMetadata {}

export interface GroqImageMetadata {
  detail?: 'auto' | 'low' | 'high'
}

export interface GroqAudioMetadata {}

export interface GroqVideoMetadata {}

export interface GroqMessageMetadataByModality {
  text: GroqTextMetadata
  image: GroqImageMetadata
  audio: GroqAudioMetadata
  video: GroqVideoMetadata
  document: GroqDocumentMetadata
}
