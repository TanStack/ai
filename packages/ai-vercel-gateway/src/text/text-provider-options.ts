import type {
  VercelGatewayChatModel,
  VercelGatewayProvider,
} from '../model-meta'

export interface VercelGatewayRoutingOptions {
  order?: Array<VercelGatewayProvider>
  only?: Array<VercelGatewayProvider>
  sort?: 'cost' | 'ttft' | 'tps'
  models?: Array<VercelGatewayChatModel>
  caching?: 'auto'
  byok?: Record<string, Array<{ apiKey: string }>>
  zeroDataRetention?: boolean
  disallowPromptTraining?: boolean
  user?: string
  tags?: Array<string>
  serviceTier?: string
  providerTimeouts?: Record<string, number>
  quotaEntityId?: string
  has?: Array<string>
}

export interface VercelGatewayCommonOptions {
  gateway?: VercelGatewayRoutingOptions
  user?: string | null
}

export interface VercelGatewayBaseOptions {
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  max_completion_tokens?: number | null
  max_output_tokens?: number | null
  frequency_penalty?: number | null
  presence_penalty?: number | null
  stop?: string | null | Array<string>
  seed?: number | null
  reasoning?: boolean | Record<string, unknown> | null
  include_reasoning?: boolean | null
  response_format?: unknown
  structured_outputs?: boolean | null
}

export type VercelGatewayTextProviderOptions = VercelGatewayCommonOptions &
  VercelGatewayBaseOptions

export type ExternalTextProviderOptions = VercelGatewayTextProviderOptions
