
import type { Tool } from '@tanstack/ai'

export interface UrlContextTool { }

export function convertUrlContextToolToAdapterFormat(_tool: Tool) {
  return {
    urlContext: {},
  }
}

export function urlContextTool(): Tool {
  return {
    name: 'url_context',
    description: '',
    metadata: {},
  }
}
