import type { VercelGatewayRoutingOptions } from '../text/text-provider-options'

export function mapGatewayModelOptions(
  modelOptions:
    | (Record<string, unknown> & { gateway?: VercelGatewayRoutingOptions })
    | undefined,
): Record<string, unknown> {
  if (!modelOptions) return {}
  const { gateway, ...rest } = modelOptions
  if (gateway === undefined) return rest
  return {
    ...rest,
    providerOptions: { gateway },
  }
}
