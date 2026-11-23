import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { openaiLiveTranscription } from '../src'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

const completed = (id: string, transcript: string) => ({
  type: 'conversation.item.input_audio_transcription.completed',
  item_id: id,
  transcript,
})
const empty = {
  type: 'error',
  error: { code: 'input_audio_buffer_commit_empty', message: 'empty' },
}

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
    expect(socket.url).toBe(
      'wss://api.openai.com/v1/realtime?intent=transcription',
    )
    expect(socket.protocols).toEqual([
      'realtime',
      'openai-insecure-api-key.sk-test',
    ])
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
    expect(socket.json()[1]).toEqual({
      type: 'input_audio_buffer.append',
      audio: '/38=',
    })

    const delta = (d: string) => ({
      type: 'conversation.item.input_audio_transcription.delta',
      item_id: 'a',
      delta: d,
    })
    socket.receive({ type: 'input_audio_buffer.speech_started' })
    socket.receive({ type: 'input_audio_buffer.committed', item_id: 'a' })
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
    expect(
      events.map((e) => (e.type === 'error' ? e.error.message : e)),
    ).toEqual([
      { type: 'interim', text: 'Hel' },
      { type: 'interim', text: 'Hello' },
      { type: 'final', text: 'Hello.' },
      { type: 'turn-end' },
      'bad event',
    ])
  })

  it('waits on close for an item VAD committed before', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: openaiLiveTranscription('gpt-transcribe', {
        apiKey: 'k',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ type: 'session.updated' })
    const session = await opening
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()

    session.send(new Uint8Array([0xff]))
    socket.receive({ type: 'input_audio_buffer.committed', item_id: 'a' })
    const closing = session.close()
    // The buffer is empty: VAD committed it already. Item a is in progress.
    socket.receive(empty)
    socket.receive(empty)
    socket.receive(completed('a', 'Last words.'))
    await closing
    await reading
    expect(events).toEqual([
      { type: 'final', text: 'Last words.' },
      { type: 'turn-end' },
    ])
  })

  it('waits on close for audio sent after the last commit', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: openaiLiveTranscription('gpt-transcribe', {
        apiKey: 'k',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ type: 'session.updated' })
    const session = await opening
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()

    session.send(new Uint8Array([0xff]))
    socket.receive({ type: 'input_audio_buffer.committed', item_id: 'a' })
    session.send(new Uint8Array([0xff])) // B: not committed yet
    socket.receive(completed('a', 'First.'))
    const closing = session.close()
    // Without the wait, the socket closes here and B is lost.
    await new Promise((r) => setTimeout(r, 10))
    socket.receive({ type: 'input_audio_buffer.committed', item_id: 'b' })
    socket.receive(empty) // the second commit
    socket.receive(completed('b', 'Second.'))
    await closing
    await reading
    expect(events.filter((e) => e.type === 'final')).toEqual([
      { type: 'final', text: 'First.' },
      { type: 'final', text: 'Second.' },
    ])
  })

  it('waits for its own commit when a VAD commit is in flight at close', async () => {
    const ws = fakeWebSocket()
    const opening = transcriptionSession({
      adapter: openaiLiveTranscription('gpt-transcribe', {
        apiKey: 'k',
        WebSocket: ws.WebSocket,
      }),
      audio: { encoding: 'mulaw', sampleRate: 8000 },
    })
    const socket = ws.sockets[0]!
    socket.open()
    socket.receive({ type: 'session.updated' })
    const session = await opening
    const events: Array<LiveTranscriptionEvent> = []
    const reading = (async () => {
      for await (const e of session) events.push(e)
    })()

    session.send(new Uint8Array([0xff]))
    const closing = session.close()
    expect(socket.json().slice(-2)).toEqual([
      { type: 'input_audio_buffer.commit' },
      { type: 'input_audio_buffer.commit' },
    ])
    // VAD committed x just before close. Its transcript is in before the
    // answer to close's commit.
    socket.receive({ type: 'input_audio_buffer.committed', item_id: 'x' })
    socket.receive(completed('x', 'First.'))
    await new Promise((r) => setTimeout(r, 10))
    socket.receive({ type: 'input_audio_buffer.committed', item_id: 'y' })
    socket.receive(empty) // the second commit
    socket.receive(completed('y', 'Last.'))
    await closing
    await reading
    expect(events.filter((e) => e.type === 'final')).toEqual([
      { type: 'final', text: 'First.' },
      { type: 'final', text: 'Last.' },
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
    const input = (
      ws.sockets[0]!.json()[0] as { session: { audio: { input: unknown } } }
    ).session.audio.input
    expect(input).toMatchObject({
      format: { type: 'audio/pcm', rate: 24000 },
      transcription: { languages: ['en'] },
      turn_detection: null,
    })
  })
})
