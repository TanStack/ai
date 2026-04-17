import type { WebSearchTool20250305 } from '@anthropic-ai/sdk/resources/messages'
import type { CacheControl } from '../text/text-provider-options'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type WebSearchToolConfig = WebSearchTool20250305

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export type AnthropicWebSearchTool = ProviderTool<'anthropic', 'web_search'>

const validateDomains = (tool: WebSearchToolConfig) => {
  if (tool.allowed_domains && tool.blocked_domains) {
    throw new Error(
      'allowed_domains and blocked_domains cannot be used together.',
    )
  }
}

const validateUserLocation = (tool: WebSearchToolConfig) => {
  const userLocation = tool.user_location
  if (userLocation) {
    if (
      userLocation.city &&
      (userLocation.city.length < 1 || userLocation.city.length > 255)
    ) {
      throw new Error(
        'user_location.city must be between 1 and 255 characters.',
      )
    }
    if (userLocation.country && userLocation.country.length !== 2) {
      throw new Error('user_location.country must be exactly 2 characters.')
    }
    if (
      userLocation.region &&
      (userLocation.region.length < 1 || userLocation.region.length > 255)
    ) {
      throw new Error(
        'user_location.region must be between 1 and 255 characters.',
      )
    }
    if (
      userLocation.timezone &&
      (userLocation.timezone.length < 1 || userLocation.timezone.length > 255)
    ) {
      throw new Error(
        'user_location.timezone must be between 1 and 255 characters.',
      )
    }
  }
}

export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = tool.metadata as {
    allowedDomains?: Array<string> | null
    blockedDomains?: Array<string> | null
    maxUses?: number | null
    userLocation?: {
      type: 'approximate'
      city?: string | null
      country?: string | null
      region?: string | null
      timezone?: string | null
    } | null
    cacheControl?: CacheControl | null
  }
  return {
    name: 'web_search',
    type: 'web_search_20250305',
    allowed_domains: metadata.allowedDomains,
    blocked_domains: metadata.blockedDomains,
    max_uses: metadata.maxUses,
    user_location: metadata.userLocation,
    cache_control: metadata.cacheControl || null,
  }
}

export function webSearchTool(
  config: WebSearchToolConfig,
): AnthropicWebSearchTool {
  validateDomains(config)
  validateUserLocation(config)
  // Phantom-brand cast: '~provider'/'~toolKind' are type-only and never assigned at runtime.
  return {
    name: 'web_search',
    description: '',
    metadata: config,
  } as unknown as AnthropicWebSearchTool
}
