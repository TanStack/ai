import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { mistralLiveTranscription } from '../src'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

describe('mistralLiveTranscription', () => {
  it('mints a token, sets the format, and maps deltas and segments', async () => {
    const ws = fakeWebSocket()
    const requests: Array<[string, RequestInit | undefined]> = []
    const fetchToken = (async (url: string, init?: RequestInit) => {
      requests.push([url, init])
      return new Response(JSON.stringify({ client_secret: { value: 'rt_1' } }))
    }) as typeof fetch
    const opening = transcriptionSession({
      adapter: mistralLiveTranscription(
        'voxtral-mini-transcribe-realtime-2602',
        {
          apiKey: 'mk',
          fetch: fetchToken,
          WebSocket: ws.WebSocket,
        },
      ),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
      modelOptions: { targetStreamingDelayMs: 480 },
    })
    await new Promise((r) => setTimeout(r, 0))
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ type: 'session.created', session: {} })
    const session = await opening

    expect(requests[0]![0]).toBe('https://api.mistral.ai/v1/client/sessions')
    expect(JSON.parse(String(requests[0]![1]!.body))).toEqual({
      purpose: 'realtime',
      model: 'voxtral-mini-transcribe-realtime-2602',
    })
    expect(socket.url).toBe(
      'wss://api.mistral.ai/v1/audio/transcriptions/realtime?model=voxtral-mini-transcribe-realtime-2602',
    )
    expect(socket.protocols).toEqual(['realtime', 'rt_1'])

    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    session.send(new Uint8Array([0xff, 0x7f]))
    socket.receive({ type: 'transcription.text.delta', text: ' Book a' })
    socket.receive({ type: 'transcription.text.delta', text: ' table' })
    socket.receive({
      type: 'transcription.segment',
      text: ' Book a table.',
      start: 0,
      end: 1,
    })
    socket.receive({ type: 'transcription.text.delta', text: ' Thanks' })

    const closing = session.close()
    socket.receive({ type: 'transcription.done', text: 'Book a table. Thanks' })
    await closing
    await reading

    expect(socket.json()).toEqual([
      {
        type: 'session.update',
        session: {
          audio_format: { encoding: 'pcm_mulaw', sample_rate: 8000 },
          target_streaming_delay_ms: 480,
        },
      },
      { type: 'input_audio.append', audio: '/38=' },
      { type: 'input_audio.flush' },
      { type: 'input_audio.end' },
    ])
    expect(events).toEqual([
      { type: 'interim', text: 'Book a' },
      { type: 'interim', text: 'Book a table' },
      { type: 'final', text: 'Book a table.' },
      { type: 'interim', text: 'Thanks' },
      { type: 'final', text: 'Thanks' },
    ])
  })
})
