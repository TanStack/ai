import { describe, expect, it, vi } from 'vitest'
import { generateVideo } from '../src/index'
import type { VideoAdapter } from '../src/activities/generateVideo/adapter'
import type { StreamChunk, VideoJobResult } from '../src/types'

async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  return chunks
}

function liveVideoAdapter(
  overrides?: Partial<{
    createVideoJob: VideoAdapter['createVideoJob']
  }>,
): VideoAdapter {
  return {
    kind: 'video',
    name: 'reactor',
    model: 'helios',
    '~types': {} as VideoAdapter['~types'],
    availableDurations: () => ({ kind: 'none' }),
    snapDuration: () => undefined,
    createVideoJob:
      overrides?.createVideoJob ??
      (async () =>
        ({
          jobId: 'video-live-1',
          model: 'reactor/helios',
          token: 'jwt-live',
          expiresAt: 1_800_000_000_000,
          prompt: 'a city at night',
        }) satisfies VideoJobResult),
    getVideoStatus: vi.fn(async () => {
      throw new Error('getVideoStatus should not run for a live session')
    }),
    getVideoUrl: vi.fn(async () => {
      throw new Error('getVideoUrl should not run for a live session')
    }),
  }
}

describe('generateVideo live session', () => {
  it('returns the token from a non-streaming create', async () => {
    const result = await generateVideo({
      adapter: liveVideoAdapter(),
      prompt: 'a city at night',
      debug: false,
    })

    expect(result.token).toBe('jwt-live')
    expect(result.model).toBe('reactor/helios')
    expect(result.prompt).toBe('a city at night')
    expect(result.jobId).toBe('video-live-1')
  })

  it('skips polling when stream:true and the job includes a token', async () => {
    const adapter = liveVideoAdapter()

    const chunks = await collectChunks(
      generateVideo({
        adapter,
        prompt: 'a city at night',
        stream: true,
        pollingInterval: 10,
        debug: false,
      }),
    )

    const types = chunks.map((chunk) =>
      chunk.type === 'CUSTOM' ? `CUSTOM:${chunk.name}` : chunk.type,
    )
    expect(types).toEqual([
      'RUN_STARTED',
      'CUSTOM:video:job:created',
      'CUSTOM:generation:result',
      'RUN_FINISHED',
    ])

    const resultChunk = chunks.find(
      (chunk) => chunk.type === 'CUSTOM' && chunk.name === 'generation:result',
    )
    expect(resultChunk).toMatchObject({
      type: 'CUSTOM',
      name: 'generation:result',
      value: {
        jobId: 'video-live-1',
        status: 'completed',
        token: 'jwt-live',
        model: 'reactor/helios',
        prompt: 'a city at night',
      },
    })
    expect(adapter.getVideoStatus).not.toHaveBeenCalled()
    expect(adapter.getVideoUrl).not.toHaveBeenCalled()
  })
})
