import type {
  AudioPart,
  ImagePart,
  MediaInputMetadata,
  MediaPrompt,
  MediaPromptPart,
  TextPart,
  VideoPart,
} from '../types'

export interface ResolvedMediaPrompt {
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
