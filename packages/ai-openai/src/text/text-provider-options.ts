import type OpenAI from 'openai'
import type { ResponseInput } from 'openai/resources/responses/responses'
import type { ApplyPatchTool } from '../tools/apply-patch-tool'
import type { CodeInterpreterTool } from '../tools/code-interpreter-tool'
import type { ComputerUseTool } from '../tools/computer-use-tool'
import type { CustomTool } from '../tools/custom-tool'
import type { FileSearchTool } from '../tools/file-search-tool'
import type { FunctionTool } from '../tools/function-tool'
import type { ImageGenerationTool } from '../tools/image-generation-tool'
import type { LocalShellTool } from '../tools/local-shell-tool'
import type { MCPTool } from '../tools/mcp-tool'
import type { ShellTool } from '../tools/shell-tool'
import type { ToolChoice } from '../tools/tool-choice'
import type { WebSearchPreviewTool } from '../tools/web-search-preview-tool'
import type { WebSearchTool } from '../tools/web-search-tool'

/** Sampling controls shared by all Responses-API models. */
export interface OpenAISamplingOptions {
  temperature?: number
  top_p?: number
  max_output_tokens?: number
}

// Core, always-available options for Responses API
export interface OpenAIBaseOptions extends OpenAISamplingOptions {
  background?: boolean
  conversation?: string | { id: string }
  include?: Array<OpenAI.Responses.ResponseIncludable>

  previous_response_id?: string
  prompt?: {
    id: string
    version?: string
    variables?: Record<string, any>
  }
  prompt_cache_key?: string

  prompt_cache_retention?: 'in-memory' | '24h'

  safety_identifier?: string

  service_tier?: 'auto' | 'default' | 'flex' | 'priority'

  store?: boolean

  verbosity?: 'low' | 'medium' | 'high'
  top_logprobs?: number

  truncation?: 'auto' | 'disabled'
}

// Feature fragments that can be stitched per-model

// Shared base types for reasoning options
type ReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high'
type ReasoningSummary = 'auto' | 'detailed'

export interface OpenAIReasoningOptions {
  reasoning?: {
    effort?: ReasoningEffort
    summary?: ReasoningSummary
  }
}

export interface OpenAIReasoningOptionsWithConcise {
  reasoning?: {
    effort?: ReasoningEffort
    summary?: ReasoningSummary | 'concise'
  }
}

export interface OpenAIStructuredOutputOptions {
  text?: OpenAI.Responses.ResponseTextConfig
}

export interface OpenAIToolsOptions {
  max_tool_calls?: number
  parallel_tool_calls?: boolean
  tool_choice?: 'auto' | 'none' | 'required' | ToolChoice
}

export interface OpenAIStreamingOptions {
  stream_options?: {
    include_obfuscation?: boolean
  }
}

export interface OpenAIMetadataOptions {
  metadata?: Record<string, string>
}

export type ExternalTextProviderOptions = OpenAIBaseOptions &
  OpenAIReasoningOptions &
  OpenAIStructuredOutputOptions &
  OpenAIToolsOptions &
  OpenAIStreamingOptions &
  OpenAIMetadataOptions

export interface InternalTextProviderOptions extends ExternalTextProviderOptions {
  input: string | ResponseInput
  instructions?: string

  model: string

  stream?: boolean

  tools?: Array<
    | FunctionTool
    | FileSearchTool
    | ComputerUseTool
    | WebSearchTool
    | MCPTool
    | CodeInterpreterTool
    | ImageGenerationTool
    | ShellTool
    | LocalShellTool
    | CustomTool
    | WebSearchPreviewTool
    | ApplyPatchTool
  >
}

const validateConversationAndPreviousResponseId = (
  options: InternalTextProviderOptions,
) => {
  const hasConflictingIds =
    Boolean(options.conversation) && Boolean(options.previous_response_id)
  if (hasConflictingIds) {
    throw new Error(
      "Cannot use both 'conversation' and 'previous_response_id' in the same request.",
    )
  }
}

export const validateTextProviderOptions = (
  options: InternalTextProviderOptions,
) => {
  validateMetadata(options)
  validateConversationAndPreviousResponseId(options)
}

const validateMetadata = (options: InternalTextProviderOptions) => {
  const metadata = options.metadata
  const tooManyKeys = metadata && Object.keys(metadata).length > 16
  if (tooManyKeys) {
    throw new Error('Metadata cannot have more than 16 key-value pairs.')
  }
  const keyTooLong =
    metadata && Object.keys(metadata).some((key) => key.length > 64)
  if (keyTooLong) {
    throw new Error('Metadata keys cannot be longer than 64 characters.')
  }
  const valueTooLong =
    metadata && Object.values(metadata).some((value) => value.length > 512)
  if (valueTooLong) {
    throw new Error('Metadata values cannot be longer than 512 characters.')
  }
}
