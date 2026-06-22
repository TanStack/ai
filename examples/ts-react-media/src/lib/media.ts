import type { MediaInputMetadata, MediaPromptPart } from '@tanstack/ai/client'

/**
 * An image the user attached as conditioning input. `dataUrl` is the full
 * `data:<mime>;base64,...` string used directly for the thumbnail preview;
 * `base64` is the same payload with the prefix stripped for the prompt part.
 */
export interface AttachedImage {
  id: string
  name: string
  mimeType: string
  /** Full data URL, used for the <img> preview. */
  dataUrl: string
  /** Base64 payload without the `data:` prefix, used for the prompt part. */
  base64: string
}

/** Reads a File into an AttachedImage (data URL preview + raw base64 payload). */
export function readImageFile(file: File): Promise<AttachedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read file'))
    reader.onload = () => {
      const dataUrl = reader.result
      if (typeof dataUrl !== 'string') {
        reject(new Error('Unexpected file read result'))
        return
      }
      const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1)
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        mimeType: file.type,
        dataUrl,
        base64,
      })
    }
    reader.readAsDataURL(file)
  })
}

/** Builds an image prompt part from an attached image, with optional role hint. */
export function toImagePart(
  image: AttachedImage,
  metadata?: MediaInputMetadata,
): MediaPromptPart {
  return {
    type: 'image',
    source: { type: 'data', value: image.base64, mimeType: image.mimeType },
    ...(metadata ? { metadata } : {}),
  }
}

/**
 * Builds an image prompt part from a URL string — either a remote URL
 * (passed through as a `url` source) or a `data:` URL (decomposed into a
 * `data` source so adapters that upload files get the raw payload).
 */
export function imageUrlToPart(
  url: string,
  metadata?: MediaInputMetadata,
): MediaPromptPart {
  const meta = metadata ? { metadata } : {}
  if (!url.startsWith('data:')) {
    return { type: 'image', source: { type: 'url', value: url }, ...meta }
  }
  const comma = url.indexOf(',')
  const mimeType = url.slice(5, comma).split(';')[0]
  if (comma === -1 || !mimeType) {
    throw new Error('data: URL is missing a mime type')
  }
  return {
    type: 'image',
    source: { type: 'data', value: url.slice(comma + 1), mimeType },
    ...meta,
  }
}
