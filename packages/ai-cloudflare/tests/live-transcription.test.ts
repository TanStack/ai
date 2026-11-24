import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { cloudflareLiveTranscription } from '../src'
import type { Ai } from '@cloudflare/workers-types'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

describe('cloudflareLiveTranscription', () => {
  it('runs Nova-3 over the binding socket with Deepgram parameters', async () => {
    const ws = fakeWebSocket()
    const calls: Array<unknown> = []
    let accepted = false
    const binding = {
      run: async (...args: Array<unknown>) => {
        calls.push(args)
        const socket = Object.assign(new ws.WebSocket('binding'), {
          accept: () => {
            accepted = true
            ws.sockets[0]!.open()
          },
        })
        return { webSocket: socket }
      },
    }
    const session = await transcriptionSession({
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- the fake binding implements only run()
      adapter: cloudflareLiveTranscription('@cf/deepgram/nova-3', {
        binding: binding as unknown as Ai,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
      language: 'en',
    })
    expect(accepted).toBe(true)
    expect(calls[0]).toEqual([
      '@cf/deepgram/nova-3',
      {
        encoding: 'mulaw',
        sample_rate: '8000',
        interim_results: 'true',
        channels: '1',
        language: 'en',
      },
      { websocket: true },
    ])

    const socket = ws.sockets[0]!
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    session.send(new Uint8Array([1, 2]))
    expect(socket.sent[0]).toEqual(new Uint8Array([1, 2]))
    socket.receive({
      type: 'Results',
      is_final: true,
      speech_final: true,
      channel: { alternatives: [{ transcript: 'hello' }] },
    })
    const closing = session.close()
    expect(socket.json()).toEqual([{ type: 'CloseStream' }])
    socket.serverClose(1000)
    await closing
    await reading
    expect(events).toEqual([
      { type: 'final', text: 'hello' },
      { type: 'turn-end' },
    ])
  })

  it('rejects more than one keyterm', async () => {
    const adapter = cloudflareLiveTranscription('@cf/deepgram/nova-3', {
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- run() must not be reached
      binding: {} as Ai,
    })
    await expect(
      transcriptionSession({
        adapter,
        audio: { encoding: 'mulaw', sampleRate: 8000 },
        modelOptions: { keyterms: ['TanStack', 'Nx'] },
      }),
    ).rejects.toThrow('one keyterm')
  })

  it('converts μ-law to linear16 for Flux', async () => {
    const adapter = cloudflareLiveTranscription('@cf/deepgram/flux', {
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- not run in this test
      binding: {} as Ai,
    })
    expect(adapter.audioInputs.map((a) => a.encoding)).toEqual(['linear16'])
  })
})
