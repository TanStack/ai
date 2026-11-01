import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { grokLiveTranscription } from '../src'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

describe('grokLiveTranscription', () => {
  it('waits for transcript.created and de-duplicates utterance finals', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: grokLiveTranscription('grok-voice-transcribe-2.0', {
        apiKey: 'xai-k',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'alaw', sampleRate: 8000 },
      language: 'en',
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ type: 'transcript.created', id: '1' })
    const session = await opening
    expect(socket.protocols).toEqual(['xai-client-secret.xai-k'])
    expect(Object.fromEntries(new URL(socket.url).searchParams)).toEqual({
      model: 'grok-voice-transcribe-2.0',
      encoding: 'alaw',
      sample_rate: '8000',
      interim_results: 'true',
      language: 'en',
    })

    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    session.send(new Uint8Array([1, 2]))
    expect(socket.sent[0]).toEqual(new Uint8Array([1, 2]))

    const partial = (text: string, isFinal: boolean, speechFinal: boolean) => ({
      type: 'transcript.partial',
      text,
      is_final: isFinal,
      speech_final: speechFinal,
    })
    socket.receive(partial('book a', false, false))
    socket.receive(partial('Book a table.', true, false))
    socket.receive(partial('Book a table. For two.', true, true))
    const closing = session.close()
    expect(socket.json()).toEqual([{ type: 'audio.done' }])
    socket.serverClose(1000)
    await closing
    await reading
    expect(events).toEqual([
      { type: 'interim', text: 'book a' },
      { type: 'final', text: 'Book a table.' },
      { type: 'final', text: 'For two.' },
      { type: 'turn-end' },
    ])
  })
})
