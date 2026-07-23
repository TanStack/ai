import {
  brandGeminiProviderTool,
  getGeminiProviderToolMetadata,
} from './gemini-provider-tool'
import type { GoogleMaps } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type GoogleMapsToolConfig = GoogleMaps

/** @deprecated Renamed to `GoogleMapsToolConfig`. Will be removed in a future release. */
export type GoogleMapsTool = GoogleMapsToolConfig

export type GeminiGoogleMapsTool = ProviderTool<'gemini', 'google_maps'>

export function convertGoogleMapsToolToAdapterFormat(tool: Tool) {
  const metadata = getGeminiProviderToolMetadata(tool) as GoogleMapsToolConfig
  return {
    googleMaps: metadata,
  }
}

export function googleMapsTool(
  config?: GoogleMapsToolConfig,
): GeminiGoogleMapsTool {
  return brandGeminiProviderTool<GeminiGoogleMapsTool>(
    {
      name: 'google_maps',
      description: '',
      metadata: config,
    },
    'google_maps',
  )
}
