// The checks on media that a client sends inside an input. Inline bytes go
// to the media store, so the transcript, the log, and every viewer get a
// small `harness-media:` reference. External URLs are refused unless the
// harness allows them.
import { MEDIA_URL_PREFIX, kindOf, mediaPart } from './media-ref'
import { MediaError } from './media'
import type { ContentPart } from '@tanstack/ai'
import type { MediaOptions } from './media'
import type { MediaRecord, MediaUpload } from './types'

/** The default of `media.maxBodyBytes`: 32 MiB. */
export const DEFAULT_MAX_BODY_BYTES = 32 * 1024 * 1024

/**
 * Why a client content part was refused. It is the `reason` of the receipt.
 *
 * - `media_too_large`: the bytes are over `media.maxBytes`.
 * - `media_not_allowed`: a MIME type with no media kind, or a kind not in
 *   `media.kinds`.
 * - `media_invalid`: the data is not base64.
 * - `media_url_not_allowed`: a URL that `media.externalUrls` refuses, a
 *   URL scheme other than `http:`, `https:`, `data:`, and `harness-media:`,
 *   or a provider file handle without `media.allowProviderFiles`.
 */
export type InlineMediaRefusal =
  | 'media_too_large'
  | 'media_not_allowed'
  | 'media_invalid'
  | 'media_url_not_allowed'

/** What `storeInlineMedia` needs: the media options and a store. */
export interface InlineMediaContext {
  options: MediaOptions | undefined
  /** Store the bytes, as `session.putMedia` does. */
  putMedia: (upload: MediaUpload<Uint8Array>) => Promise<MediaRecord>
}

type MediaContentPart = Exclude<ContentPart, { type: 'text' }>

/** A checked part, with the bytes that it must store, if any. */
type CheckedPart =
  | { part: ContentPart; upload?: undefined }
  | { part: MediaContentPart; upload: MediaUpload<Uint8Array> }

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/
// `data:<type>[;params];base64,<data>`. Only base64 data URLs carry bytes.
const DATA_URL = /^data:([^,]*?);base64,(.*)$/s

/** A refused part. `reason` goes to the receipt. */
function refuse(reason: InlineMediaRefusal) {
  return { refused: reason }
}

/** The bytes of base64 `value`, or `undefined` when it is not base64. */
function fromBase64(value: string) {
  const clean = value.replace(/\s/g, '')
  if (clean.length % 4 === 1 || !BASE64.test(clean)) return undefined
  const NodeBuffer = globalThis.Buffer
  if (typeof NodeBuffer === 'function') {
    return new Uint8Array(NodeBuffer.from(clean, 'base64'))
  }
  return Uint8Array.from(atob(clean), (char) => char.charCodeAt(0))
}

/** The number of bytes that base64 `value` holds, without decoding it. */
function base64Size(value: string) {
  const clean = value.replace(/\s/g, '')
  const padding = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0
  return Math.floor((clean.length * 3) / 4) - padding
}

/** True when `media.externalUrls` lets a part point to `url`. */
function isUrlAllowed(url: URL, options: MediaOptions | undefined) {
  const isWeb = url.protocol === 'http:' || url.protocol === 'https:'
  if (!isWeb) return false
  const allow = options?.externalUrls ?? false
  return typeof allow === 'function' ? allow(url) : allow
}

/** `part`, checked, with the bytes it must store, or why it was refused. */
function checkBytes(
  part: MediaContentPart,
  data: { value: string; mimeType: string },
  options: MediaOptions | undefined,
) {
  const kind = kindOf(data.mimeType)
  const isKindAllowed =
    kind !== undefined && (options?.kinds ?? [kind]).includes(kind)
  if (!isKindAllowed) return refuse('media_not_allowed')
  const isTooLarge =
    options?.maxBytes !== undefined && base64Size(data.value) > options.maxBytes
  if (isTooLarge) return refuse('media_too_large')
  const bytes = fromBase64(data.value)
  if (bytes === undefined) return refuse('media_invalid')
  const checked: CheckedPart = {
    part,
    upload: { body: bytes, mimeType: data.mimeType, name: kind },
  }
  return checked
}

/** One part, checked, or the reason it was refused. Stores nothing. */
function checkPart(
  part: ContentPart,
  options: MediaOptions | undefined,
): CheckedPart | { refused: InlineMediaRefusal } {
  if (part.type === 'text') return { part }
  const { source } = part
  if (source.type === 'data') return checkBytes(part, source, options)
  // A provider file handle is read with the server's provider key.
  if (source.type === 'file') {
    return options?.allowProviderFiles === true
      ? { part }
      : refuse('media_url_not_allowed')
  }
  if (source.value.startsWith(MEDIA_URL_PREFIX)) return { part }
  const dataUrl = DATA_URL.exec(source.value)
  if (dataUrl) {
    const [, mimeType = '', value = ''] = dataUrl
    return checkBytes(part, { value, mimeType }, options)
  }
  const url = URL.canParse(source.value) ? new URL(source.value) : undefined
  if (url === undefined || !isUrlAllowed(url, options)) {
    return refuse('media_url_not_allowed')
  }
  return { part }
}

/**
 * Check the content parts that a client sent, at the trust boundary. Inline
 * bytes (a `data` source, or a base64 `data:` URL) go to the media store
 * with `putMedia`, and the part becomes a `harness-media:` reference. So the
 * bytes are checked against `media.kinds` and `media.maxBytes`, and the model
 * check of `harness-media:` parts runs on them. An `http:` or `https:` URL
 * stays only when `media.externalUrls` allows it. A provider file handle
 * stays only when `media.allowProviderFiles` is `true`. Other URL schemes are
 * refused. Text and `harness-media:` parts stay as they are.
 *
 * Resolves to `{ parts }`, or to `{ refused }` with the reason of the first
 * part that was refused. Every part is checked before any part is stored, so
 * a refused input stores nothing.
 *
 * @example
 * ```ts
 * const checked = await storeInlineMedia(parts, {
 *   options: harness.media,
 *   putMedia: (upload) => session.putMedia(upload),
 * })
 * if ('refused' in checked) return reject(checked.refused)
 * session.send(checked.parts)
 * ```
 */
export async function storeInlineMedia(
  parts: ReadonlyArray<ContentPart>,
  context: InlineMediaContext,
) {
  const pending: Array<CheckedPart> = []
  for (const part of parts) {
    const result = checkPart(part, context.options)
    if ('refused' in result) return result
    pending.push(result)
  }
  const checked: Array<ContentPart> = []
  for (const entry of pending) {
    if (entry.upload === undefined) {
      checked.push(entry.part)
      continue
    }
    try {
      const record = await context.putMedia(entry.upload)
      // Other fields, like provider metadata, stay on the part.
      const stored: ContentPart = { ...entry.part, ...mediaPart(record) }
      checked.push(stored)
    } catch (error) {
      // ponytail: the store refuses only what the checks above let through
      // when its own limits differ (its 100 MB default `maxBytes`). Parts
      // stored before such a refusal stay in the store.
      if (!(error instanceof MediaError)) throw error
      return refuse(
        error.status === 413 ? 'media_too_large' : 'media_not_allowed',
      )
    }
  }
  return { parts: checked }
}

/**
 * The largest request body or socket frame, in bytes, that a transport
 * reads: `media.maxBodyBytes`, or 32 MiB. A socket checks a frame after the
 * WebSocket server read it, so this saves only the parse.
 *
 * @example
 * ```ts
 * if (frame.length > maxBodyBytesOf(harness.media)) socket.close(1009)
 * ```
 */
export function maxBodyBytesOf(options: MediaOptions | undefined) {
  return options?.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
}

/**
 * The body of `request` as text, read up to `media.maxBodyBytes`. Throws a
 * `MediaError` with 413 when the `Content-Length` or the bytes read are over
 * the limit. It stops reading at the limit, so a large body is not buffered.
 *
 * @example
 * ```ts
 * const body: unknown = JSON.parse(await readBodyText(request, harness.media))
 * ```
 */
export async function readBodyText(
  request: Request,
  options: MediaOptions | undefined,
) {
  const limit = maxBodyBytesOf(options)
  const tooLarge = () =>
    new MediaError(413, `The body is bigger than the limit of ${limit} bytes.`)
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > limit) throw tooLarge()
  if (request.body === null) return ''
  const reader = request.body.getReader()
  const chunks: Array<Uint8Array> = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > limit) {
      await reader.cancel()
      throw tooLarge()
    }
    chunks.push(value)
  }
  const decoder = new TextDecoder()
  return (
    chunks.map((chunk) => decoder.decode(chunk, { stream: true })).join('') +
    decoder.decode()
  )
}
