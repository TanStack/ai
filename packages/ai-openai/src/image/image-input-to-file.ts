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
  if (match && match[1]) {
    const ext = match[1].toLowerCase()
    const isJpeg = ext === 'jpg' || ext === 'jpeg'
    if (isJpeg) return 'image/jpeg'
    return `image/${ext}`
  }
  return DEFAULT_MIME
}
