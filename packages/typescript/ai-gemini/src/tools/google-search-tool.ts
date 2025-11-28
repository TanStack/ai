import type { GoogleSearch } from '@google/genai'
import { z } from 'zod'
import type { Tool } from '@tanstack/ai'

export type GoogleSearchTool = GoogleSearch

export function convertGoogleSearchToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleSearchTool
  return {
    googleSearch: metadata,
  }
}

export function googleSearchTool(config?: GoogleSearchTool): Tool {
  return {
    name: 'google_search',
    description: '',
    inputSchema: z.object({}),
    metadata: config,
  }
}
