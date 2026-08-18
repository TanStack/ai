import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ByokMissingError, byokMissing } from '@tanstack/ai/byok'
import { defineByok, memoryStorage } from '../src/byok'
import { VideoGenerationClient } from '../src/video-generation-client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

const ELEVENLABS_KEY = 'el-live-secret'
const VIDEO_RESULT = {
  jobId: 'job-1',
  status: 'completed' as const,
  url: 'https://example.com/v.mp4',
}

describe('VideoGenerationClient byok', () => {
  it('passes elevenlabs headers to the fetcher after updateOptions', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    const fetcher = vi.fn(async () => VIDEO_RESULT)
    const client = new VideoGenerationClient({
      fetcher,
      byok,
    })

    client.updateOptions({ byokProvider: () => 'elevenlabs' })
    await client.generate({ prompt: 'hello' })

    expect(fetcher).toHaveBeenCalledWith(
      { prompt: 'hello' },
      {
        signal: expect.any(AbortSignal),
        headers: { 'x-byok-elevenlabs': ELEVENLABS_KEY },
      },
    )
  })

  it('stamps headers on the connection runContext', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    const connect = vi.fn(async function* () {
      const chunk: StreamChunk = {
        type: EventType.RUN_FINISHED,
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
        finishReason: 'stop',
      }
      yield chunk
    })
    const connection: ConnectConnectionAdapter = { connect }
    const client = new VideoGenerationClient({
      connection,
      byok,
      byokProvider: () => 'elevenlabs',
    })

    await client.generate({ prompt: 'hello' })

    expect(connect).toHaveBeenCalledWith(
      [],
      { prompt: 'hello' },
      expect.any(AbortSignal),
      expect.objectContaining({
        headers: { 'x-byok-elevenlabs': ELEVENLABS_KEY },
      }),
    )
  })

  it('requests a missing key when the fetcher throws ByokMissingError', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    const client = new VideoGenerationClient({
      fetcher: async () => {
        throw new ByokMissingError('elevenlabs')
      },
      byok,
      byokProvider: () => 'elevenlabs',
    })

    await client.generate({ prompt: 'hello' })

    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'elevenlabs',
      reason: 'missing',
    })
    expect(client.getError()).toBeInstanceOf(ByokMissingError)
  })

  it('requests a missing key when the fetcher returns a byokMissing Response', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    const client = new VideoGenerationClient({
      fetcher: async () => byokMissing('elevenlabs'),
      byok,
      byokProvider: () => 'elevenlabs',
    })

    await client.generate({ prompt: 'hello' })

    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'elevenlabs',
      reason: 'missing',
    })
  })
})
