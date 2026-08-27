import type {
  BetaContextManagementConfig,
  BetaToolChoiceAny,
  BetaToolChoiceAuto,
  BetaToolChoiceTool,
} from '@anthropic-ai/sdk/resources/beta/messages/messages'
import type { CacheControlEphemeral } from '@anthropic-ai/sdk/resources'
import type { AnthropicContainerSkill, AnthropicTool } from '../tools/index'
import type {
  MessageParam,
  TextBlockParam,
} from '@anthropic-ai/sdk/resources/messages'

export interface AnthropicSystemPromptMetadata {
  cache_control?: CacheControlEphemeral
}

export interface AnthropicCacheControlOptions {
  cache_control?: CacheControlEphemeral
}

export interface AnthropicContainerOptions {
  container?: {
    id: string | null
    skills: Array<AnthropicContainerSkill> | null
  } | null
}

export interface AnthropicContextManagementOptions {
  context_management?: BetaContextManagementConfig | null
}

export interface AnthropicMCPOptions {
  mcp_servers?: Array<MCPServer>
}

export interface AnthropicServiceTierOptions {
  service_tier?: 'auto' | 'standard_only'
}

export interface AnthropicStopSequencesOptions {
  stop_sequences?: Array<string>
}

export interface AnthropicThinkingOptions {
  thinking?:
    | {
        budget_tokens: number

        type: 'enabled'
      }
    | {
        type: 'disabled'
      }
}

export interface AnthropicAdaptiveThinkingOptions {
  thinking?:
    | {
        type: 'adaptive'
        display?: 'summarized' | 'omitted'
      }
    | {
        budget_tokens: number
        type: 'enabled'
      }
    | {
        type: 'disabled'
      }
}

export interface AnthropicAdaptiveOnlyThinkingOptions {
  thinking?: {
    type: 'adaptive'
    display?: 'summarized' | 'omitted'
  }
}

export interface AnthropicAdaptiveOrDisabledThinkingOptions {
  thinking?:
    | {
        type: 'adaptive'
        display?: 'summarized' | 'omitted'
      }
    | {
        type: 'disabled'
      }
}

export interface AnthropicMaxTokensOptions {
  max_tokens?: number
}

export interface AnthropicEffortOptions {
  effort?: 'max' | 'high' | 'medium' | 'low'
}

export interface AnthropicOutputConfigOptions {
  output_config?: {
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
  }
}

export interface AnthropicToolChoiceOptions {
  tool_choice?: BetaToolChoiceAny | BetaToolChoiceTool | BetaToolChoiceAuto
}

export interface AnthropicSamplingOptions {
  top_k?: number
  temperature?: number
  top_p?: number
  max_tokens?: number
}

export type ExternalTextProviderOptions = AnthropicCacheControlOptions &
  AnthropicContainerOptions &
  AnthropicContextManagementOptions &
  AnthropicMCPOptions &
  AnthropicServiceTierOptions &
  AnthropicStopSequencesOptions &
  AnthropicThinkingOptions &
  AnthropicToolChoiceOptions &
  AnthropicSamplingOptions &
  Partial<AnthropicAdaptiveThinkingOptions> &
  Partial<AnthropicEffortOptions> &
  Partial<AnthropicOutputConfigOptions>

export interface InternalTextProviderOptions extends ExternalTextProviderOptions {
  model: string

  messages: Array<MessageParam>

  max_tokens: number
  stream?: boolean
  system?: string | Array<TextBlockParam>

  tools?: Array<AnthropicTool>

  output_config?: {
    effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | null
    format?: {
      type: 'json_schema'
      schema: Record<string, unknown>
    }
  }
}

const validateTopPandTemperature = (options: InternalTextProviderOptions) => {
  const hasBothTopPAndTemperature =
    options.top_p !== undefined && options.temperature !== undefined
  if (hasBothTopPAndTemperature) {
    throw new Error('You should either set top_p or temperature, but not both.')
  }
}

export interface CacheControl {
  type: 'ephemeral'
  ttl: '5m' | '1h'
}

const validateThinking = (options: InternalTextProviderOptions) => {
  const thinking = options.thinking
  if (thinking && thinking.type === 'enabled') {
    if (thinking.budget_tokens < 1024) {
      throw new Error('thinking.budget_tokens must be at least 1024.')
    }
    if (thinking.budget_tokens >= options.max_tokens) {
      throw new Error('thinking.budget_tokens must be less than max_tokens.')
    }
  }
}

interface MCPServer {
  name: string
  url: string
  type: 'url'
  authorization_token?: string | null
  tool_configuration: {
    allowed_tools?: Array<string> | null
    enabled?: boolean | null
  } | null
}

const validateMaxTokens = (options: InternalTextProviderOptions) => {
  if (options.max_tokens < 1) {
    throw new Error('max_tokens must be at least 1.')
  }
}

export const validateTextProviderOptions = (
  options: InternalTextProviderOptions,
) => {
  validateTopPandTemperature(options)
  validateThinking(options)
  validateMaxTokens(options)
}
