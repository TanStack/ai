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
 * - `source.type === 'url'` with a `data:` URI: parse in-memory → File.
 * - `source.type === 'url'` with an HTTP(S) URL: fetch → File, but only when
 *   `allowUrlFetch` is set. OpenAI's `/images/edits` and Sora
 *   `input_reference` require real file bytes (no URL passthrough), so the
 *   image has to be downloaded and buffered in memory — which can OOM
 *   constrained runtimes. Off by default; the caller opts in.
 *
 * The mime type comes from the source when available, else inferred from the
 * URL extension, else `image/png`.
 */
export async function imagePartToFile(
  part: ImagePart<MediaInputMetadata>,
  fallbackName: string,
  allowUrlFetch: boolean,
): Promise<File> {
  ensureFileSupport()

  if (part.source.type === 'data') {
    const mimeType = part.source.mimeType || DEFAULT_MIME
    const bytes = base64ToArrayBuffer(part.source.value)
    return new File([bytes], `${fallbackName}.${extForMime(mimeType)}`, {
      type: mimeType,
    })
  }

  // Remote HTTP(S) URLs must be downloaded and buffered before upload; gate
  // that behind an explicit opt-in. `data:` URIs are already in memory, so
  // they're handled uniformly via fetch() below without the flag.
  if (/^https?:\/\//i.test(part.source.value) && !allowUrlFetch) {
    throw new Error(
      `openai: HTTP(S) URL image inputs are not fetched by default because ` +
        `OpenAI's edit / input_reference endpoints require uploaded bytes, so ` +
        `the image would be downloaded and buffered in memory (risking OOM on ` +
        `constrained runtimes). Pass a data: URI, or set \`allowUrlFetch: true\` ` +
        `on the adapter config to opt into fetching. URL: ${part.source.value}`,
    )
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
