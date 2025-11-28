import type { GoogleMaps } from '@google/genai'
import { z } from 'zod'
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
    inputSchema: z.object({}),
    metadata: config,
  }
}
