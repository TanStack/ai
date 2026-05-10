import { toFile } from 'openai'
import type { ImagePart } from '@tanstack/ai'
import type { Uploadable } from 'openai'

/**
 * Convert an `ImagePart` (base64 or URL source) into an OpenAI `Uploadable`
 * suitable for endpoints like `images.edit()` and `videos.create({ input_reference })`.
 *
 * URLs are fetched first so the SDK uploads the bytes directly — the OpenAI
 * API does not accept remote URLs for image / video reference inputs.
 */
export async function imagePartToUploadable(
  part: ImagePart,
  index: number,
): Promise<Uploadable> {
  const { source } = part
  const filename = `input-${index}.${mimeToExtension(source.mimeType)}`
  const type = source.mimeType ?? 'image/png'

  if (source.type === 'data') {
    const buffer = decodeBase64(source.value)
    return toFile(buffer, filename, { type })
  }

  const response = await fetch(source.value)
  if (!response.ok) {
    throw new Error(
      `Failed to fetch input image at ${source.value}: ${response.status} ${response.statusText}`,
    )
  }
  const arrayBuffer = await response.arrayBuffer()
  return toFile(new Uint8Array(arrayBuffer), filename, {
    type: response.headers.get('content-type') ?? type,
  })
}

function decodeBase64(value: string): Uint8Array {
  // Strip a `data:...;base64,` prefix if present.
  const commaIndex = value.indexOf(',')
  const payload =
    commaIndex !== -1 && value.startsWith('data:')
      ? value.slice(commaIndex + 1)
      : value
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(payload, 'base64'))
  }
  // Browser fallback — `atob` returns a binary string.
  const binary = atob(payload)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i)
  return out
}

function mimeToExtension(mimeType: string | undefined): string {
  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/jpeg':
    case 'image/jpg':
      return 'jpg'
    case 'image/webp':
      return 'webp'
    default:
      return 'png'
  }
}
