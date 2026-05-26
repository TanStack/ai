import { brandProviderTool } from '@tanstack/ai'
import type { GoogleMaps } from '@google/genai'
import type { ProviderTool, Tool } from '@tanstack/ai'

export type GoogleMapsToolConfig = GoogleMaps

/** @deprecated Renamed to `GoogleMapsToolConfig`. Will be removed in a future release. */
export type GoogleMapsTool = GoogleMapsToolConfig

export type GeminiGoogleMapsTool = ProviderTool<'gemini', 'google_maps'>

export function convertGoogleMapsToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleMapsToolConfig
  return {
    googleMaps: metadata,
  }
}

export function googleMapsTool(
  config?: GoogleMapsToolConfig,
): GeminiGoogleMapsTool {
  return brandProviderTool<GeminiGoogleMapsTool>({
    name: 'google_maps',
    description: '',
    metadata: config,
  })
}
