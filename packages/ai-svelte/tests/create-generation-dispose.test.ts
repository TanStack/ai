import { describe, expect, it } from 'vitest'
import { createGeneration } from '../src/create-generation.svelte'
import { createGenerateVideo } from '../src/create-generate-video.svelte'

describe('Svelte generate() after dispose() rebinds the snapshot', () => {
  it('createGeneration updates result after dispose then generate', async () => {
    const gen = createGeneration<{ prompt: string }, { id: string }>({
      fetcher: async (input) => ({ id: input.prompt }),
    })

    await gen.generate({ prompt: 'a' })
    expect(gen.result).toEqual({ id: 'a' })

    gen.dispose()
    await gen.generate({ prompt: 'b' })
    expect(gen.result).toEqual({ id: 'b' })
  })

  it('createGenerateVideo updates result after dispose then generate', async () => {
    const video = createGenerateVideo({
      fetcher: async (input) => {
        if (typeof input.prompt !== 'string') {
          throw new Error('Expected a text prompt')
        }

        return {
          jobId: input.prompt,
          status: 'completed' as const,
          url: `https://example.com/${input.prompt}.mp4`,
        }
      },
    })

    await video.generate({ prompt: 'one' })
    expect(video.result?.jobId).toBe('one')

    video.dispose()
    await video.generate({ prompt: 'two' })
    expect(video.result?.jobId).toBe('two')
  })
})
