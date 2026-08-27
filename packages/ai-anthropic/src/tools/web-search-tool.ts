import {
  brandAnthropicProviderTool,
  getAnthropicProviderToolMetadata,
} from './anthropic-provider-tool'
import type { WebSearchTool20250305 } from '@anthropic-ai/sdk/resources/messages'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type WebSearchToolConfig = WebSearchTool20250305

/** @deprecated Renamed to `WebSearchToolConfig`. Will be removed in a future release. */
export type WebSearchTool = WebSearchToolConfig

export type AnthropicWebSearchTool = ProviderTool<'anthropic', 'web_search'>

const validateDomains = (tool: WebSearchToolConfig) => {
  const hasConflictingDomains = Boolean(
    tool.allowed_domains && tool.blocked_domains,
  )
  if (hasConflictingDomains) {
    throw new Error(
      'allowed_domains and blocked_domains cannot be used together.',
    )
  }
}

const validateUserLocation = (tool: WebSearchToolConfig) => {
  const userLocation = tool.user_location
  if (userLocation) {
    const cityOutOfRange =
      Boolean(userLocation.city) &&
      (userLocation.city.length < 1 || userLocation.city.length > 255)
    if (cityOutOfRange) {
      throw new Error(
        'user_location.city must be between 1 and 255 characters.',
      )
    }
    const countryOutOfRange =
      Boolean(userLocation.country) && userLocation.country.length !== 2
    if (countryOutOfRange) {
      throw new Error('user_location.country must be exactly 2 characters.')
    }
    const regionOutOfRange =
      Boolean(userLocation.region) &&
      (userLocation.region.length < 1 || userLocation.region.length > 255)
    if (regionOutOfRange) {
      throw new Error(
        'user_location.region must be between 1 and 255 characters.',
      )
    }
    const timezoneOutOfRange =
      Boolean(userLocation.timezone) &&
      (userLocation.timezone.length < 1 || userLocation.timezone.length > 255)
    if (timezoneOutOfRange) {
      throw new Error(
        'user_location.timezone must be between 1 and 255 characters.',
      )
    }
  }
}

export function convertWebSearchToolToAdapterFormat(
  tool: Tool,
): WebSearchToolConfig {
  const metadata = getAnthropicProviderToolMetadata(tool)
  return {
    name: 'web_search',
    type: 'web_search_20250305',
    ...(metadata?.allowed_domains !== undefined && {
      allowed_domains: metadata.allowed_domains,
    }),
    ...(metadata?.blocked_domains !== undefined && {
      blocked_domains: metadata.blocked_domains,
    }),
    ...(metadata?.max_uses !== undefined && { max_uses: metadata.max_uses }),
    ...(metadata?.user_location !== undefined && {
      user_location: metadata.user_location,
    }),
    ...(metadata?.cache_control !== undefined && {
      cache_control: metadata.cache_control,
    }),
  }
}

export function webSearchTool(
  config: WebSearchToolConfig,
): AnthropicWebSearchTool {
  validateDomains(config)
  validateUserLocation(config)
  return brandAnthropicProviderTool<AnthropicWebSearchTool>(
    {
      name: 'web_search',
      description: '',
      metadata: config,
    },
    'web_search',
  )
}
