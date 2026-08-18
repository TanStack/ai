import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import { ByokMissingError, byokMissing } from '@tanstack/ai/byok'
import { defineByok, memoryStorage } from '../src/byok'
import { GenerationClient } from '../src/generation-client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

const ELEVENLABS_KEY = 'el-live-secret'

describe('GenerationClient byok', () => {
  it('passes elevenlabs headers to the fetcher after updateOptions', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    const fetcher = vi.fn(async () => ({ ok: true }))
    const client = new GenerationClient({
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
    const client = new GenerationClient({
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
    const client = new GenerationClient({
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
    const client = new GenerationClient({
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
