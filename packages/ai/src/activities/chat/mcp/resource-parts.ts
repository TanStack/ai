import type { ContentPart } from '../../../types'

const DEFAULT_MAX_BYTES = 4_000_000

export type McpResourceToContentPartOptions = {
  /** Max decoded bytes for a blob. Default 4_000_000. */
  maxBytes?: number
  /**
   * What to do when mime is unknown or the blob is over maxBytes.
   * Default: `'placeholder'` (text stub with the resource URI).
   */
  onReject?: 'placeholder' | 'omit' | 'throw'
}

export type McpResourceContent = {
  uri?: string
  mimeType?: string
  text?: string
  blob?: string
}

function placeholder(uri: string | undefined): ContentPart {
  return {
    type: 'text',
    content: `[binary resource ${uri ?? ''}]`,
  }
}

function reject(
  uri: string | undefined,
  reason: string,
  onReject: NonNullable<McpResourceToContentPartOptions['onReject']>,
): ContentPart | null {
  if (onReject === 'omit') return null
  if (onReject === 'throw') {
    throw new Error(`MCP resource rejected (${reason}): ${uri ?? '(no uri)'}`)
  }
  return placeholder(uri)
}

function decodedByteLength(base64: string): number {
  const trimmed = base64.replace(/\s/g, '')
  const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0
  return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding)
}

function mediaPart(
  type: 'image' | 'audio' | 'document',
  blob: string,
  mimeType: string,
): ContentPart {
  return {
    type,
    source: { type: 'data', value: blob, mimeType },
  } as ContentPart
}

/**
 * Internal converter for `chat({ mcp: { attachResources } })`.
 * Public API: `@tanstack/ai-mcp`'s `mcpResourceToContentPart` — keep in sync.
 *
 * Returns `null` only when `onReject: 'omit'`.
 */
export function mcpResourceToContentPart(
  content: McpResourceContent,
  options?: McpResourceToContentPartOptions,
): ContentPart | null {
  const onReject = options?.onReject ?? 'placeholder'
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_BYTES

  if (typeof content.text === 'string') {
    return { type: 'text', content: content.text }
  }

  if (typeof content.blob === 'string') {
    const mime = content.mimeType?.toLowerCase() ?? ''
    if (decodedByteLength(content.blob) > maxBytes) {
      return reject(content.uri, 'over maxBytes', onReject)
    }
    if (mime.startsWith('image/')) {
      return mediaPart('image', content.blob, mime)
    }
    if (mime.startsWith('audio/')) {
      return mediaPart('audio', content.blob, mime)
    }
    if (
      mime === 'application/pdf' ||
      mime === 'text/plain' ||
      mime.startsWith('text/')
    ) {
      return mediaPart('document', content.blob, mime || 'application/pdf')
    }
    return reject(content.uri, mime ? `unsupported mime ${mime}` : 'no mimeType', onReject)
  }

  return {
    type: 'text',
    content: JSON.stringify(content),
  }
}
