import type { ContentPart } from '../types'

const CONTENT_PART_TYPES = new Set([
  'text',
  'image',
  'audio',
  'video',
  'document',
])

/**
 * Structural check for a single `ContentPart`. A text part must carry a string
 * `content`; every other modality must carry a `source` with `type` of
 * `'url' | 'data' | 'file'` and a string `value`.
 */
export function isContentPart(value: unknown): value is ContentPart {
  if (typeof value !== 'object' || value === null) return false
  const part = value as Record<string, unknown>
  if (typeof part.type !== 'string' || !CONTENT_PART_TYPES.has(part.type)) {
    return false
  }
  if (part.type === 'text') {
    return typeof part.content === 'string'
  }
  const source = part.source
  if (typeof source !== 'object' || source === null) return false
  const src = source as Record<string, unknown>
  if (typeof src.value !== 'string') return false
  // `data` sources require a mimeType (matches ContentPartDataSource); `url`
  // sources don't. Requiring it here keeps the runtime guard consistent with
  // the type and avoids emitting `data:undefined;base64,...` downstream.
  if (src.type === 'data') return typeof src.mimeType === 'string'
  // `file` sources reference a provider-issued handle and must name their issuer.
  if (src.type === 'file') return typeof src.provider === 'string'
  return src.type === 'url'
}

/**
 * True iff `value` is a NON-EMPTY array whose every element is a valid
 * `ContentPart`. Empty arrays and mixed arrays return false so they continue
 * to be treated as ordinary (stringified) data — this keeps the auto-detection
 * footgun narrow.
 */
export function isContentPartArray(
  value: unknown,
): value is Array<ContentPart> {
  return Array.isArray(value) && value.length > 0 && value.every(isContentPart)
}

/**
 * Normalize a tool's return value for transport:
 * - string            → unchanged
 * - ContentPart array → unchanged (multimodal, passed through to the adapter)
 * - anything else     → `JSON.stringify`
 */
export function normalizeToolResult(
  result: unknown,
): string | Array<ContentPart> {
  if (typeof result === 'string') return result
  if (isContentPartArray(result)) return result
  return JSON.stringify(result)
}
