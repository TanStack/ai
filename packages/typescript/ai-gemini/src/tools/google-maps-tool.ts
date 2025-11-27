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
    type: 'function',
    function: {
      name: 'google_maps',
      description: '',
      parameters: {},
    },
    metadata: config,
  }
}
