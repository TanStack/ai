import type { VercelGatewayRoutingOptions } from './text-provider-options'

export interface VercelGatewayResponsesProviderOptions {
  temperature?: number | null
  top_p?: number | null
  max_output_tokens?: number | null
  gateway?: VercelGatewayRoutingOptions
}

export type ExternalResponsesProviderOptions =
  VercelGatewayResponsesProviderOptions
