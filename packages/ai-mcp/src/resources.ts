import type { ContentPart } from '@tanstack/ai'

export function mcpResourceToContentPart(content: {
  uri?: string
  text?: string
  blob?: string
  [key: string]: unknown
}): ContentPart {
  if (typeof content.text === 'string') {
    return { type: 'text', content: content.text }
  }
  if (typeof content.blob === 'string') {
    return { type: 'text', content: `[binary resource ${content.uri ?? ''}]` }
  }
  return { type: 'text', content: JSON.stringify(content) }
}
