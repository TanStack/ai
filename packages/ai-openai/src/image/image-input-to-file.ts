import { base64ToArrayBuffer } from '@tanstack/ai-utils'
import type { ImagePart, MediaInputMetadata } from '@tanstack/ai'

const DEFAULT_MIME = 'image/png'
const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function extForMime(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? mimeType.split('/')[1] ?? 'png'
}

function ensureFileSupport(): void {
  if (typeof File === 'undefined') {
    throw new Error(
      '`File` is not available in this environment. ' +
        'Image-conditioned generation requires Node 20+ or a browser context.',
    )
  }
}

/**
 * Convert a TanStack `ImagePart` into an OpenAI-compatible `File`.
 *
 * - `source.type === 'data'`: decode base64 → Buffer → File.
 * - `source.type === 'url'`: fetch the URL (or parse data: URI) → File.
 *
 * The mime type comes from the source when available, else inferred from the
 * URL extension, else `image/png`.
 */
export async function imagePartToFile(
  part: ImagePart<MediaInputMetadata>,
  fallbackName: string,
): Promise<File> {
  ensureFileSupport()

  if (part.source.type === 'data') {
    const mimeType = part.source.mimeType || DEFAULT_MIME
    const bytes = base64ToArrayBuffer(part.source.value)
    return new File([bytes], `${fallbackName}.${extForMime(mimeType)}`, {
      type: mimeType,
    })
  }

  // URL source — also handles data: URIs uniformly via fetch().
  const response = await fetch(part.source.value)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch image input (${response.status} ${response.statusText}): ${part.source.value}`,
    )
  }
  const blob = await response.blob()
  const mimeType =
    part.source.mimeType || blob.type || inferMimeFromUrl(part.source.value)
  return new File([blob], `${fallbackName}.${extForMime(mimeType)}`, {
    type: mimeType,
  })
}

function inferMimeFromUrl(url: string): string {
  const match = url.match(/\.(png|jpe?g|webp|gif)(?:\?|#|$)/i)
  if (!match || !match[1]) return DEFAULT_MIME
  const ext = match[1].toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  return `image/${ext}`
}
