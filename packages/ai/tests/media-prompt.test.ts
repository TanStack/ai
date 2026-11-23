import { describe, expect, it } from 'vitest'
import { resolveMediaPrompt } from '../src/utilities/media-prompt'
import type {
  ImagePart,
  MediaInputMetadata,
  MediaPromptPart,
  Model3dPart,
} from '../src'

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

function mesh(value: string): Model3dPart {
  return { type: 'model3d', source: { type: 'url', value } }
}

describe('resolveMediaPrompt', () => {
  it('wraps a string prompt as a single text part', () => {
    const resolved = resolveMediaPrompt('a cat')
    expect(resolved.text).toBe('a cat')
    expect(resolved.parts).toEqual([{ type: 'text', content: 'a cat' }])
    expect(resolved.images).toEqual([])
    expect(resolved.videos).toEqual([])
    expect(resolved.audios).toEqual([])
    expect(resolved.models3d).toEqual([])
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

  it('puts model3d parts in models3d, in prompt order', () => {
    const resolved = resolveMediaPrompt([
      mesh('https://a.glb'),
      { type: 'text', content: 'retexture as rusty metal' },
      image('https://style.png'),
      mesh('https://b.obj'),
    ])
    expect(resolved.text).toBe('retexture as rusty metal')
    expect(resolved.models3d).toEqual([
      mesh('https://a.glb'),
      mesh('https://b.obj'),
    ])
    expect(resolved.images).toEqual([image('https://style.png')])
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
