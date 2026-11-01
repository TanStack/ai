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
    expect(url.host + url.pathname).toBe('api.elevenlabs.io/v1/speech-to-text/realtime')
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
    session.send(new Uint8Array([0xff, 0x7f]))
    expect(socket.json()[0]).toEqual({
      message_type: 'input_audio_chunk',
      audio_base_64: '/38=',
      commit: false,
      sample_rate: 8000,
    })

    socket.receive({ message_type: 'partial_transcript', text: 'Hi' })
    socket.receive({ message_type: 'partial_transcript', text: 'Hi' }) // keepalive repeat
    socket.receive({ message_type: 'committed_transcript', text: 'Hi there.' })
    socket.receive({ message_type: 'quota_exceeded', error: 'out of credit' })
    const closing = session.close()
    expect(socket.json().at(-1)).toMatchObject({ commit: true, audio_base_64: '' })
    socket.receive({ message_type: 'committed_transcript', text: '' })
    await closing
    await reading
    expect(events.map((e) => (e.type === 'error' ? e.error.message : e))).toEqual([
      { type: 'interim', text: 'Hi' },
      { type: 'final', text: 'Hi there.' },
      { type: 'turn-end' },
      'ElevenLabs quota_exceeded: out of credit',
      { type: 'turn-end' },
    ])
  })
})
