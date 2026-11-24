import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { elevenlabsLiveTranscription } from '../src'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

describe('elevenlabsLiveTranscription', () => {
  it('mints a token, streams base64 chunks, and maps commits', async () => {
    const ws = fakeWebSocket()
    const requests: Array<[string, RequestInit | undefined]> = []
    const fetchToken = (async (url: string, init?: RequestInit) => {
      requests.push([url, init])
      return new Response(JSON.stringify({ token: 'sutkn_1' }))
    }) as typeof fetch
    const opening = transcriptionSession({
      adapter: elevenlabsLiveTranscription('scribe_v2_realtime', {
        apiKey: 'xi',
        fetch: fetchToken,
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
      language: 'en',
    })
    await new Promise((r) => setTimeout(r, 0))
    const socket = ws.sockets[0]!
    socket.open()
    const session = await opening

    expect(requests[0]![0]).toBe(
      'https://api.elevenlabs.io/v1/single-use-token/realtime_scribe',
    )
    expect(requests[0]![1]!.headers).toEqual({ 'xi-api-key': 'xi' })
    const url = new URL(socket.url)
    expect(url.host + url.pathname).toBe(
      'api.elevenlabs.io/v1/speech-to-text/realtime',
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      model_id: 'scribe_v2_realtime',
      audio_format: 'ulaw_8000',
      commit_strategy: 'vad',
      token: 'sutkn_1',
      language_code: 'en',
    })

    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    // Small frames gather into one 250 ms message (2000 bytes of ulaw_8000).
    session.send(new Uint8Array(1999).fill(0xff))
    expect(socket.json()).toHaveLength(0)
    session.send(new Uint8Array([0x7f]))
    expect(socket.json()).toHaveLength(1)
    expect(socket.json()[0]).toEqual({
      message_type: 'input_audio_chunk',
      audio_base_64: Buffer.concat([
        Buffer.alloc(1999, 0xff),
        Buffer.from([0x7f]),
      ]).toString('base64'),
      commit: false,
      sample_rate: 8000,
    })
    session.send(new Uint8Array([0xff, 0x7f]))

    socket.receive({ message_type: 'partial_transcript', text: 'Hi' })
    socket.receive({ message_type: 'partial_transcript', text: 'Hi' }) // keepalive repeat
    socket.receive({ message_type: 'committed_transcript', text: 'Hi there.' })
    socket.receive({ message_type: 'quota_exceeded', error: 'out of credit' })
    const closing = session.close()
    // The remainder flushes with the commit.
    expect(socket.json().at(-1)).toMatchObject({
      commit: true,
      audio_base_64: '/38=',
    })
    socket.receive({ message_type: 'committed_transcript', text: '' })
    await closing
    await reading
    expect(
      events.map((e) => (e.type === 'error' ? e.error.message : e)),
    ).toEqual([
      { type: 'interim', text: 'Hi' },
      { type: 'final', text: 'Hi there.' },
      { type: 'turn-end' },
      'ElevenLabs quota_exceeded: out of credit',
      { type: 'turn-end' },
    ])
  })

  it('keeps each chunk when the caller reuses its buffer', async () => {
    const ws = fakeWebSocket()
    const fetchToken = (async () =>
      new Response(JSON.stringify({ token: 'sutkn_1' }))) as typeof fetch
    const opening = transcriptionSession({
      adapter: elevenlabsLiveTranscription('scribe_v2_realtime', {
        apiKey: 'xi',
        fetch: fetchToken,
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
    })
    await new Promise((r) => setTimeout(r, 0))
    const socket = ws.sockets[0]!
    socket.open()
    const session = await opening

    // One buffer, filled and sent twice. 2000 bytes is one 250 ms message.
    const buffer = new Uint8Array(1000)
    session.send(buffer.fill(0x11))
    session.send(buffer.fill(0x22))
    expect(socket.json()[0]).toMatchObject({
      audio_base_64: Buffer.concat([
        Buffer.alloc(1000, 0x11),
        Buffer.alloc(1000, 0x22),
      ]).toString('base64'),
    })
  })

  it('waits on close when a VAD commit for an earlier segment comes first', async () => {
    const ws = fakeWebSocket()
    const fetchToken = (async () =>
      new Response(JSON.stringify({ token: 'sutkn_1' }))) as typeof fetch
    const opening = transcriptionSession({
      adapter: elevenlabsLiveTranscription('scribe_v2_realtime', {
        apiKey: 'xi',
        fetch: fetchToken,
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
    })
    await new Promise((r) => setTimeout(r, 0))
    const socket = ws.sockets[0]!
    socket.open()
    const session = await opening
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()

    session.send(new Uint8Array(100))
    const closing = session.close()
    // VAD commit of segment A, then segment B, which close() committed.
    socket.receive({ message_type: 'committed_transcript', text: 'A.' })
    await new Promise((r) => setTimeout(r, 10))
    socket.receive({ message_type: 'partial_transcript', text: 'B' })
    socket.receive({ message_type: 'committed_transcript', text: 'B.' })
    await closing
    await reading
    expect(events.filter((e) => e.type === 'final')).toEqual([
      { type: 'final', text: 'A.' },
      { type: 'final', text: 'B.' },
    ])
  })
})
