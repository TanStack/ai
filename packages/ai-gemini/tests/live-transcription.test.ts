import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { geminiLiveTranscription } from '../src'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

describe('geminiLiveTranscription', () => {
  it('sends setup, converts μ-law to 16 kHz PCM, and maps transcriptions', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: geminiLiveTranscription('gemini-3.5-transcribe-live', {
        apiKey: 'g-key',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
      language: 'en',
    })
    const socket = ws.sockets[0]!
    socket.open()
    expect(new URL(socket.url).searchParams.get('key')).toBe('g-key')
    expect(socket.json()[0]).toEqual({
      setup: {
        model: 'models/gemini-3.5-transcribe-live',
        generationConfig: { responseModalities: ['TEXT'] },
        inputAudioTranscription: { languageCodes: ['en'] },
      },
    })
    socket.receive({ setupComplete: {} })
    const session = await opening

    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    session.send(new Uint8Array(80).fill(0xff)) // 10 ms of μ-law silence
    const chunk = socket.json()[1] as {
      realtimeInput: { audio: { data: string; mimeType: string } }
    }
    expect(chunk.realtimeInput.audio.mimeType).toBe('audio/pcm;rate=16000')
    // 80 samples at 8 kHz upsample to 159 samples at 16 kHz (the last waits for more).
    expect(atob(chunk.realtimeInput.audio.data).length).toBe(159 * 2)

    socket.receive({ serverContent: { interimInputTranscription: { text: 'Hel' } } })
    socket.receive({ serverContent: { inputTranscription: { text: 'Hello.' } } })
    await session.close()
    await reading
    expect(events).toEqual([
      { type: 'interim', text: 'Hel' },
      { type: 'final', text: 'Hello.' },
      { type: 'turn-end' },
    ])
  })
})
