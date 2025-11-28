import type { GoogleMaps } from '@google/genai'
import type { Tool } from '@tanstack/ai'

export type GoogleMapsTool = GoogleMaps

export function convertGoogleMapsToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleMapsTool
  return {
    googleMaps: metadata,
  }
}

export function googleMapsTool(config?: GoogleMapsTool): Tool {
  return {
    name: 'google_maps',
    description: '',
    metadata: config,
  }
}
