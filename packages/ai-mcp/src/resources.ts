import type { ContentPart } from '@tanstack/ai'

/**
 * Converts a single MCP resource content block to a TanStack `ContentPart`.
 *
 * - `text` field present → `{ type: 'text', content: text }`
 * - `blob` field present → `{ type: 'text', content: '[binary resource <uri>]' }`
 * - otherwise          → `{ type: 'text', content: JSON.stringify(content) }`
 */
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
