import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai/client'
import {
  ByokBlockedError,
  ByokMissingError,
  ByokUnresolvedProviderError,
  byokMissing,
} from '@tanstack/ai/byok'
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

  it('stops the failed run when the BYOK request subscriber stops', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    const onErrorChange = vi.fn()
    let client!: GenerationClient<{ prompt: string }, { id: string }>
    client = new GenerationClient({
      fetcher: async (): Promise<{ id: string }> => {
        throw new ByokMissingError('elevenlabs')
      },
      byok,
      byokProvider: () => 'elevenlabs',
      onErrorChange,
    })
    byok.subscribe(() => {
      if (byok.getSnapshot().prompt) client.stop()
    })

    await client.generate({ prompt: 'first' })

    expect(client.getStatus()).toBe('idle')
    expect(client.getError()).toBeUndefined()
    expect(onErrorChange).not.toHaveBeenCalledWith(expect.any(Error))
  })

  it('does not let a failed BYOK run overwrite a replacement', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    let releaseSecond!: (value: { id: string }) => void
    const secondResult = new Promise<{ id: string }>((resolve) => {
      releaseSecond = resolve
    })
    let secondGenerate: Promise<void> | undefined
    let replaced = false
    const client = new GenerationClient({
      fetcher: async (input) => {
        if (input.prompt === 'first') {
          throw new ByokMissingError('elevenlabs')
        }
        return secondResult
      },
      byok,
      byokProvider: () => 'elevenlabs',
    })
    byok.subscribe(() => {
      if (!byok.getSnapshot().prompt || replaced) return
      replaced = true
      client.stop()
      secondGenerate = client.generate({ prompt: 'second' })
    })

    await client.generate({ prompt: 'first' })

    expect(client.getStatus()).toBe('generating')
    expect(client.getError()).toBeUndefined()
    releaseSecond({ id: 'second' })
    await secondGenerate
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

  it('does not call the fetcher when the provider key is missing', async () => {
    const byok = defineByok()
    const fetcher = vi.fn()
    const client = new GenerationClient({
      fetcher,
      byok,
      byokProvider: () => 'elevenlabs',
    })

    await client.generate({ prompt: 'hello' })

    expect(fetcher).not.toHaveBeenCalled()
    expect(client.getError()).toBeInstanceOf(ByokBlockedError)
    expect(byok.getSnapshot().prompt).toEqual({
      provider: 'elevenlabs',
      reason: 'missing',
    })
  })

  it('does not send every stored key when no provider resolves', async () => {
    const byok = defineByok({ storage: memoryStorage() })
    await byok.update('openai', 'sk-live-secret')
    await byok.update('elevenlabs', ELEVENLABS_KEY)
    const fetcher = vi.fn()
    const client = new GenerationClient({
      fetcher,
      byok,
    })

    await client.generate({ prompt: 'hello' })

    expect(fetcher).not.toHaveBeenCalled()
    expect(client.getError()).toBeInstanceOf(ByokUnresolvedProviderError)
  })
})
