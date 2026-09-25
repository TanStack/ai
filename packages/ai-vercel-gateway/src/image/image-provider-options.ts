import type { VercelGatewayRoutingOptions } from '../text/text-provider-options'

export interface VercelGatewayImageProviderOptions {
  quality?: 'standard' | 'hd'
  style?: 'vivid' | 'natural'
  gateway?: VercelGatewayRoutingOptions
}

export type VercelGatewayImageSize =
  | '1024x1024'
  | '1536x1024'
  | '1024x1536'
  | 'auto'
