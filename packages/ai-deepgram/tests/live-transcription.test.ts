import { describe, expect, it } from 'vitest'
import { transcriptionSession } from '@tanstack/ai'
import { fakeWebSocket } from '@tanstack/ai/testing'
import { deepgramLiveTranscription } from '../src'
import type { LiveTranscriptionEvent } from '@tanstack/ai'

async function open(model: 'nova-3' | 'flux-general-en') {
  const ws = fakeWebSocket()
  const opening = transcriptionSession({
    adapter: deepgramLiveTranscription(model, {
      apiKey: 'dg-key',
      WebSocket: ws.WebSocket,
    }),
    audio: { encoding: 'mulaw', sampleRate: 8000 },
    language: 'en',
    modelOptions: { keyterms: ['TanStack'] },
  })
  const socket = ws.sockets[0]!
  socket.open()
  const session = await opening
  const events: Array<LiveTranscriptionEvent> = []
  const reading = (async () => {
    for await (const e of session) events.push(e)
  })()
  return { socket, session, events, reading }
}

const results = (
  transcript: string,
  isFinal: boolean,
  speechFinal = false,
) => ({
  type: 'Results',
  is_final: isFinal,
  speech_final: speechFinal,
  channel: { alternatives: [{ transcript }] },
})

describe('deepgramLiveTranscription', () => {
  it('streams Nova-3 μ-law audio and maps results', async () => {
    const { socket, session, events, reading } = await open('nova-3')
    const url = new URL(socket.url)
    expect(url.pathname).toBe('/v1/listen')
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      model: 'nova-3',
      encoding: 'mulaw',
      sample_rate: '8000',
      interim_results: 'true',
      language: 'en',
      keyterm: 'TanStack',
    })
    expect(socket.protocols).toEqual(['token', 'dg-key'])

    session.send(new Uint8Array([1, 2, 3]))
    expect(socket.sent[0]).toEqual(new Uint8Array([1, 2, 3]))

    socket.receive(results('hel', false))
    socket.receive(results('hello there', true, true))
    socket.receive({ type: 'UtteranceEnd' }) // already ended by speech_final
    socket.receive(results('', true, true)) // silence: no events

    const closing = session.close()
    expect(socket.json()).toEqual([{ type: 'CloseStream' }])
    socket.serverClose(1000)
    await closing
    await reading
    expect(events).toEqual([
      { type: 'interim', text: 'hel' },
      { type: 'final', text: 'hello there' },
      { type: 'turn-end' },
    ])
  })

  it('maps Flux turn events', async () => {
    const { socket, session, events, reading } = await open('flux-general-en')
    expect(new URL(socket.url).pathname).toBe('/v2/listen')
    socket.receive({ type: 'TurnInfo', event: 'StartOfTurn', transcript: 'I' })
    socket.receive({ type: 'TurnInfo', event: 'Update', transcript: 'I want' })
    socket.receive({
      type: 'TurnInfo',
      event: 'EndOfTurn',
      transcript: 'I want pizza',
    })
    socket.receive({ type: 'Error', description: 'bad audio' })
    socket.serverClose(1011, 'internal')
    await session.close()
    await reading
    expect(events.slice(0, 4)).toEqual([
      { type: 'interim', text: 'I' },
      { type: 'interim', text: 'I want' },
      { type: 'final', text: 'I want pizza' },
      { type: 'turn-end' },
    ])
    expect(
      events.slice(4).map((e) => e.type === 'error' && e.error.message),
    ).toEqual(['bad audio', 'Connection closed with code 1011: internal.'])
  })
})
