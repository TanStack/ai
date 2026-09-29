// Browser-safe media references. Type-only imports, no server code, so the
// client and view entries can use these too.
import type { ContentPart, ModelMessage } from '@tanstack/ai'
import type { MediaKind, MediaRecord } from './types'

/** The URL scheme of a content part that points to a harness media file. */
export const MEDIA_URL_PREFIX = 'harness-media:'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isMediaKind(value: unknown): value is MediaKind {
  return (
    value === 'image' ||
    value === 'audio' ||
    value === 'video' ||
    value === 'document'
  )
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === 'string'
}

/**
 * True for a value with the shape of a `MediaRecord`, for example the answer
 * of an upload or the value of a `harness.media` event.
 *
 * @example
 * const value: unknown = await response.json()
 * if (isMediaRecord(value)) console.log(value.name)
 */
export function isMediaRecord(value: unknown): value is MediaRecord {
  if (!isRecord(value)) return false
  const hasOptionalIds =
    isOptionalString(value.runId) && isOptionalString(value.subagentRunId)
  return (
    hasOptionalIds &&
    typeof value.id === 'string' &&
    typeof value.threadId === 'string' &&
    isMediaKind(value.kind) &&
    typeof value.mimeType === 'string' &&
    typeof value.name === 'string' &&
    typeof value.size === 'number' &&
    (value.source === 'user' || value.source === 'generated') &&
    typeof value.createdAt === 'number'
  )
}

/**
 * The media kind of a MIME type, or `undefined` when the harness does not
 * store that type. `image/*`, `audio/*`, and `video/*` map to their kind.
 * `application/pdf` and `text/*` are documents.
 *
 * @example
 * kindOf('image/png') // 'image'
 * kindOf('application/zip') // undefined
 */
export function kindOf(mimeType: string) {
  // A Content-Type header can carry parameters: `text/plain; charset=utf-8`.
  const [type = ''] = mimeType.toLowerCase().split(';')
  const [top = '', sub] = type.trim().split('/')
  if (!sub) return undefined
  switch (top) {
    case 'image':
    case 'audio':
    case 'video':
      return top
    case 'text':
      return 'document'
    case 'application':
      return sub === 'pdf' ? 'document' : undefined
    default:
      return undefined
  }
}

/**
 * The content part that sends a stored media file to a turn. Its source is
 * the URL `harness-media:<id>`. The harness swaps it for the bytes only when
 * it calls the model, so the transcript stays small.
 *
 * @example
 * session.prompt([{ type: 'text', content: 'What is this?' }, mediaPart(record)])
 */
export function mediaPart(record: MediaRecord) {
  const part: ContentPart = {
    type: record.kind,
    source: {
      type: 'url',
      value: `${MEDIA_URL_PREFIX}${record.id}`,
      mimeType: record.mimeType,
    },
  }
  return part
}

/**
 * The media id of a part made by `mediaPart`, or `undefined` for any other
 * value (text, a data source, a normal URL).
 *
 * @example
 * const ids = parts.map(mediaIdOf).filter((id) => id !== undefined)
 */
export function mediaIdOf(part: unknown) {
  if (!isRecord(part) || !isMediaKind(part.type) || !isRecord(part.source)) {
    return undefined
  }
  const { type, value } = part.source
  if (type !== 'url' || typeof value !== 'string') return undefined
  if (!value.startsWith(MEDIA_URL_PREFIX)) return undefined
  return value.slice(MEDIA_URL_PREFIX.length) || undefined
}

/**
 * The media records saved on a message in `metadata.harness.media`: the
 * media a turn made, kept on its last assistant message. Entries with a bad
 * shape are skipped. Returns `[]` when there are none.
 *
 * @example
 * for (const media of mediaOfMessage(message)) console.log(media.name)
 */
export function mediaOfMessage(message: ModelMessage) {
  const harness: unknown = message.metadata?.harness
  const media = isRecord(harness) ? harness.media : undefined
  return Array.isArray(media) ? media.filter(isMediaRecord) : []
}
