import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { openaiLiveTranscription } from '../src'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

describe('openaiLiveTranscription', () => {
  it('configures a transcription session and maps deltas to events', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: openaiLiveTranscription('gpt-transcribe', {
        apiKey: 'sk-test',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
      language: 'en',
    })
    const socket = ws.sockets[0]!
    socket.open()
    expect(socket.url).toBe('wss://api.openai.com/v1/realtime?intent=transcription')
    expect(socket.protocols).toEqual(['realtime', 'openai-insecure-api-key.sk-test'])
    expect(socket.json()[0]).toEqual({
      type: 'session.update',
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            transcription: { model: 'gpt-transcribe', language: 'en' },
            turn_detection: { type: 'server_vad' },
          },
        },
      },
    })
    socket.receive({ type: 'session.updated' })
    const session = await opening

    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    session.send(new Uint8Array([0xff, 0x7f]))
    expect(socket.json()[1]).toEqual({ type: 'input_audio_buffer.append', audio: '/38=' })

    const delta = (d: string) => ({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: d,
    })
    socket.receive({ type: 'input_audio_buffer.speech_started' })
    socket.receive(delta('Hel'))
    socket.receive(delta('lo'))
    socket.receive({
      type: 'conversation.item.input_audio_transcription.completed',
      item_id: 'a',
      transcript: 'Hello.',
    })
    socket.receive({ type: 'error', error: { message: 'bad event' } })
    await session.close() // nothing pending: closes without waiting
    await reading
    expect(events.map((e) => (e.type === 'error' ? e.error.message : e))).toEqual([
      { type: 'interim', text: 'Hel' },
      { type: 'interim', text: 'Hello' },
      { type: 'final', text: 'Hello.' },
      { type: 'turn-end' },
      'bad event',
    ])
  })

  it('turns off VAD for gpt-live-transcribe', async () => {
    const ws = fakeWebSocket()
    void transcriptionSession({
      adapter: openaiLiveTranscription('gpt-live-transcribe', {
        apiKey: 'k',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'linear16', sampleRate: 16000 },
      language: 'en',
    })
    ws.sockets[0]!.open()
    const input = (ws.sockets[0]!.json()[0] as { session: { audio: { input: unknown } } })
      .session.audio.input
    expect(input).toMatchObject({
      format: { type: 'audio/pcm', rate: 24000 },
      transcription: { languages: ['en'] },
      turn_detection: null,
    })
  })
})
