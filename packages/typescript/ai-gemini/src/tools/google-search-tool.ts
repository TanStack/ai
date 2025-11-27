import type { GoogleSearch } from '@google/genai'
import type { Tool } from '@tanstack/ai'

export type GoogleSearchTool = GoogleSearch

export function convertGoogleSearchToolToAdapterFormat(tool: Tool) {
  const metadata = tool.metadata as GoogleSearchTool
  return {
    googleSearch: metadata
  }
}

export function googleSearchTool(config?: GoogleSearchTool): Tool {
  return {
    type: 'function',
    function: {
      name: 'google_search',
      description: '',
      parameters: {},
    },
    metadata: config
  }
}
