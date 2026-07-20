import { describe, expect, it } from 'vitest'
import { decodeWsFrame, encodeWsFrame } from '../src/stream-to-websocket'
import { ev } from './test-utils'
import type { WebSocketLike } from '../src/stream-to-websocket'

describe('ws frame codec', () => {
  it('encodes a durable frame as an { id, chunk } envelope', () => {
    const chunk = ev.textContent('hi')
    expect(JSON.parse(encodeWsFrame(chunk, 'off-1'))).toEqual({
      id: 'off-1',
      chunk,
    })
  })

  it('encodes a non-durable frame as a bare chunk', () => {
    const chunk = ev.textContent('hi')
    expect(JSON.parse(encodeWsFrame(chunk, undefined))).toEqual(chunk)
  })

  it('decodes a RunAgentInput frame as a run', () => {
    const input = { threadId: 't', runId: 'r', messages: [] }
    expect(decodeWsFrame(JSON.stringify(input))).toEqual({
      kind: 'run',
      input,
    })
  })

  it('decodes an abort control frame', () => {
    expect(decodeWsFrame(JSON.stringify({ type: 'abort', runId: 'r' }))).toEqual(
      { kind: 'abort', runId: 'r' },
    )
  })
})

class FakeSocket implements WebSocketLike {
  sent: Array<string> = []
  closed = false
  closeCode: number | undefined
  bufferedAmount = 0
  private handlers: Record<string, Array<(ev: any) => void>> = {}
  send(data: string): void {
    this.sent.push(data)
  }
  close(code?: number): void {
    this.closed = true
    this.closeCode = code
    this.emit('close', { code })
  }
  addEventListener(type: string, handler: (ev: any) => void): void {
    ;(this.handlers[type] ??= []).push(handler)
  }
  emitMessage(data: string): void {
    this.emit('message', { data })
  }
  emitClose(): void {
    this.emit('close', {})
  }
  private emit(type: string, ev: any): void {
    for (const h of this.handlers[type] ?? []) h(ev)
  }
}

describe('FakeSocket double', () => {
  it('records sent frames and delivers messages to listeners', () => {
    const socket = new FakeSocket()
    const received: Array<string> = []
    socket.addEventListener('message', (e) => received.push(e.data))
    socket.send('a')
    socket.emitMessage('b')
    expect(socket.sent).toEqual(['a'])
    expect(received).toEqual(['b'])
  })
})
