import type { ContentPart } from '../types'

const CONTENT_PART_TYPES = new Set([
  'text',
  'image',
  'audio',
  'video',
  'document',
])

export function isContentPart(value: unknown): value is ContentPart {
  const isInvalid = typeof value !== 'object' || value === null
  if (isInvalid) return false
  const part = value as Record<string, unknown>
  const isInvalidPart =
    typeof part.type !== 'string' || !CONTENT_PART_TYPES.has(part.type)
  if (isInvalidPart) {
    return false
  }
  if (part.type === 'text') {
    return typeof part.content === 'string'
  }
  const source = part.source
  const isInvalidSource = typeof source !== 'object' || source === null
  if (isInvalidSource) return false
  const src = source as Record<string, unknown>
  if (typeof src.value !== 'string') return false
  if (src.type === 'data') return typeof src.mimeType === 'string'
  return src.type === 'url'
}

export function isContentPartArray(
  value: unknown,
): value is Array<ContentPart> {
  return Array.isArray(value) && value.length > 0 && value.every(isContentPart)
}

export function normalizeToolResult(
  result: unknown,
): string | Array<ContentPart> {
  if (typeof result === 'string') return result
  if (isContentPartArray(result)) return result
  return JSON.stringify(result)
}
