import { describe, expect, it } from 'vitest'
import { resolveMediaPrompt } from '../src/utilities/media-prompt'
import type { ImagePart, MediaInputMetadata, MediaPromptPart } from '../src'

function image(
  value: string,
  role?: NonNullable<MediaInputMetadata['role']>,
): ImagePart<MediaInputMetadata> {
  return {
    type: 'image',
    source: { type: 'url', value },
    ...(role && { metadata: { role } }),
  }
}

describe('resolveMediaPrompt', () => {
  it('wraps a string prompt as a single text part', () => {
    const resolved = resolveMediaPrompt('a cat')
    expect(resolved.text).toBe('a cat')
    expect(resolved.parts).toEqual([{ type: 'text', content: 'a cat' }])
    expect(resolved.images).toEqual([])
    expect(resolved.videos).toEqual([])
    expect(resolved.audios).toEqual([])
  })

  it('buckets media parts by modality in prompt order', () => {
    const parts: Array<MediaPromptPart> = [
      image('https://a.png'),
      { type: 'text', content: 'animate this' },
      { type: 'video', source: { type: 'url', value: 'https://v.mp4' } },
      { type: 'audio', source: { type: 'url', value: 'https://a.mp3' } },
      image('https://b.png', 'end_frame'),
    ]
    const resolved = resolveMediaPrompt(parts)
    expect(resolved.text).toBe('animate this')
    expect(resolved.parts).toBe(parts)
    expect(resolved.images.map((p) => p.source.value)).toEqual([
      'https://a.png',
      'https://b.png',
    ])
    expect(resolved.images[1]?.metadata?.role).toBe('end_frame')
    expect(resolved.videos).toHaveLength(1)
    expect(resolved.audios).toHaveLength(1)
  })

  it('joins multiple text parts with paragraph breaks', () => {
    const resolved = resolveMediaPrompt([
      { type: 'text', content: 'first' },
      image('https://a.png'),
      { type: 'text', content: 'second' },
    ])
    expect(resolved.text).toBe('first\n\nsecond')
  })

  it('returns empty text for media-only prompts', () => {
    const resolved = resolveMediaPrompt([image('https://a.png')])
    expect(resolved.text).toBe('')
    expect(resolved.images).toHaveLength(1)
  })

  it('skips empty text parts', () => {
    const resolved = resolveMediaPrompt([
      { type: 'text', content: '' },
      { type: 'text', content: 'real' },
    ])
    expect(resolved.text).toBe('real')
  })

  it('never rewrites text — provider referencing syntax passes through verbatim', () => {
    const resolved = resolveMediaPrompt([
      {
        type: 'text',
        content: 'Put @Image1 next to <IMAGE_0> from image 1',
      },
      image('https://a.png'),
    ])
    expect(resolved.text).toBe('Put @Image1 next to <IMAGE_0> from image 1')
  })
})
