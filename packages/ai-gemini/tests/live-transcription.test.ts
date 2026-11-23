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
    // 80 samples at 8 kHz upsample to 158 at 16 kHz. The last two wait for the next chunk.
    expect(atob(chunk.realtimeInput.audio.data).length).toBe(158 * 2)

    socket.receive({
      serverContent: { interimInputTranscription: { text: 'Hel' } },
    })
    socket.receive({
      serverContent: { inputTranscription: { text: 'Hello.' } },
    })
    await session.close()
    await reading
    expect(events).toEqual([
      { type: 'interim', text: 'Hel' },
      { type: 'final', text: 'Hello.' },
      { type: 'turn-end' },
    ])
  })

  it('passes 24 kHz PCM through with the rate in the mime type', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: geminiLiveTranscription('gemini-3.5-transcribe-live', {
        apiKey: 'g-key',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'linear16', sampleRate: 24000 },
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ setupComplete: {} })
    const session = await opening
    session.send(new Uint8Array([1, 0, 2, 0]))
    expect(socket.json().at(-1)).toEqual({
      realtimeInput: {
        audio: { data: 'AQACAA==', mimeType: 'audio/pcm;rate=24000' },
      },
    })
    const closing = session.close()
    socket.receive({ serverContent: { inputTranscription: { text: 'hi' } } })
    await closing
  })

  it('waits for the transcript of audio sent just before close', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: geminiLiveTranscription('gemini-3.5-transcribe-live', {
        apiKey: 'g-key',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'linear16', sampleRate: 16000 },
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ setupComplete: {} })
    const session = await opening
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()

    session.send(new Uint8Array(320))
    const closing = session.close()
    // No interim arrived yet, so the socket stays open for the final.
    expect(socket.json().at(-1)).toEqual({
      realtimeInput: { audioStreamEnd: true },
    })
    socket.receive({ serverContent: { inputTranscription: { text: 'Hi.' } } })
    await closing
    await reading
    expect(events).toEqual([
      { type: 'final', text: 'Hi.' },
      { type: 'turn-end' },
    ])
  })

  it('waits on close for a segment that comes after an earlier final', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: geminiLiveTranscription('gemini-3.5-transcribe-live', {
        apiKey: 'g-key',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'linear16', sampleRate: 16000 },
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ setupComplete: {} })
    const session = await opening
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()
    const final = (text: string) => ({
      serverContent: { inputTranscription: { text } },
    })

    session.send(new Uint8Array(320)) // segment 1
    session.send(new Uint8Array(320)) // segment 2
    socket.receive(final('One.'))
    const closing = session.close()
    await new Promise((r) => setTimeout(r, 10))
    socket.receive({
      serverContent: { interimInputTranscription: { text: 'Tw' } },
    })
    socket.receive(final('Two.'))
    await closing
    await reading
    expect(events.filter((e) => e.type === 'final')).toEqual([
      { type: 'final', text: 'One.' },
      { type: 'final', text: 'Two.' },
    ])
  })

  it('rejects SMART mode', async () => {
    const ws = fakeWebSocket()
    await expect(
      transcriptionSession({
        adapter: geminiLiveTranscription('gemini-3.5-transcribe-live', {
          apiKey: 'g-key',
          WebSocket: ws.WebSocket,
        }),
        audio: { encoding: 'linear16', sampleRate: 16000 },
        modelOptions: { mode: 'SMART' },
      }),
    ).rejects.toThrow("mode 'SMART'")
    expect(ws.sockets).toHaveLength(0)
  })
})
