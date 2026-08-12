export interface VercelGatewayRoutingOptions {
  order?: Array<string>
  only?: Array<string>
  sort?: 'cost' | 'ttft' | 'tps'
  models?: Array<string>
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

export interface VercelGatewayTextProviderOptions {
  temperature?: number | null
  top_p?: number | null
  max_tokens?: number | null
  max_completion_tokens?: number | null
  frequency_penalty?: number | null
  presence_penalty?: number | null
  stop?: string | null | Array<string>
  seed?: number | null
  user?: string | null
  gateway?: VercelGatewayRoutingOptions
}

export type ExternalTextProviderOptions = VercelGatewayTextProviderOptions
