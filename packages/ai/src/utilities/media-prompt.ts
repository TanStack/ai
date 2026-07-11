import { detectImageMimeType } from '../utils'
import type {
  AudioPart,
  ContentPartSource,
  GeneratedImage,
  ImagePart,
  MediaInputMetadata,
  MediaPrompt,
  MediaPromptPart,
  TextPart,
  VideoPart,
} from '../types'

/**
 * A {@link MediaPrompt} decomposed into the views adapters consume.
 *
 * Adapters with native multimodal prompts (Gemini `contents`, OpenRouter
 * chat content parts) consume `parts` to preserve interleaving; named-field
 * providers (fal, OpenAI) consume `text` plus the typed media buckets.
 *
 * Prompt text is **never rewritten**: text parts are concatenated verbatim.
 * Providers that support referencing inputs from the prompt (e.g. fal's
 * `@Image1`, OpenAI's "image 1" prose) expect the user to write that syntax
 * themselves — the SDK does not inject or substitute markers.
 */
export interface ResolvedMediaPrompt {
  /**
   * Text parts concatenated verbatim (paragraph-separated). Empty string
   * for media-only prompts.
   */
  text: string
  /** The prompt as ordered parts; a string prompt becomes one text part. */
  parts: Array<MediaPromptPart>
  /** Image parts in prompt order. */
  images: Array<ImagePart<MediaInputMetadata>>
  /** Video parts in prompt order. */
  videos: Array<VideoPart<MediaInputMetadata>>
  /** Audio parts in prompt order. */
  audios: Array<AudioPart<MediaInputMetadata>>
}

/**
 * Decompose a {@link MediaPrompt} into flattened text and per-modality part
 * buckets, preserving prompt order everywhere. This is the single downrev
 * point from the canonical interleaved prompt shape to the named-field
 * request shapes most providers expose.
 */
export function resolveMediaPrompt(prompt: MediaPrompt): ResolvedMediaPrompt {
  if (typeof prompt === 'string') {
    const textPart: TextPart = { type: 'text', content: prompt }
    return {
      text: prompt,
      parts: [textPart],
      images: [],
      videos: [],
      audios: [],
    }
  }

  const images: Array<ImagePart<MediaInputMetadata>> = []
  const videos: Array<VideoPart<MediaInputMetadata>> = []
  const audios: Array<AudioPart<MediaInputMetadata>> = []
  const textSegments: Array<string> = []

  for (const part of prompt) {
    switch (part.type) {
      case 'text':
        if (part.content) textSegments.push(part.content)
        break
      case 'image':
        images.push(part)
        break
      case 'video':
        videos.push(part)
        break
      case 'audio':
        audios.push(part)
        break
    }
  }

  return {
    text: textSegments.join('\n\n'),
    parts: prompt,
    images,
    videos,
    audios,
  }
}

/**
 * Convert a media URL into a {@link ContentPartSource}: remote URLs pass
 * through as `url` sources; `data:` URLs are decomposed into `data` sources
 * so adapters that upload raw bytes (OpenAI edits, Gemini `inlineData`) get
 * the payload without re-parsing.
 */
function mediaUrlToSource(url: string): ContentPartSource {
  if (!url.startsWith('data:')) {
    return { type: 'url', value: url }
  }
  const comma = url.indexOf(',')
  const mimeType = comma === -1 ? '' : url.slice(5, comma).split(';')[0]
  if (comma === -1 || !mimeType) {
    throw new Error('data: URL is missing a mime type')
  }
  return { type: 'data', value: url.slice(comma + 1), mimeType }
}

/**
 * Convert a previously generated image into an {@link ImagePart} so it can
 * be fed back into a media prompt (follow-up edits, image-to-image). URL
 * results pass through as `url` sources (`data:` URLs are decomposed into
 * `data` sources); `b64Json` results become `data` sources with the mime
 * type sniffed from the payload's magic bytes (defaulting to `image/png`,
 * the format every provider's b64 output uses today).
 */
export function generatedImageToImagePart(
  image: GeneratedImage,
): ImagePart<MediaInputMetadata> {
  if (image.url !== undefined) {
    return { type: 'image', source: mediaUrlToSource(image.url) }
  }
  return {
    type: 'image',
    source: {
      type: 'data',
      value: image.b64Json,
      mimeType: detectImageMimeType(image.b64Json) ?? 'image/png',
    },
  }
}

/**
 * Convert a previously generated video URL into a {@link VideoPart} so it
 * can be fed back into a media prompt (follow-up edits). Remote URLs pass
 * through; `data:` URLs (e.g. Gemini Omni's inline MP4 results) are
 * decomposed into `data` sources.
 */
export function generatedVideoUrlToVideoPart(
  url: string,
  metadata?: MediaInputMetadata,
): VideoPart<MediaInputMetadata> {
  return {
    type: 'video',
    source: mediaUrlToSource(url),
    ...(metadata ? { metadata } : {}),
  }
}
