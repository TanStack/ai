import { describe, expect, it } from 'vitest'
import { decodeWsFrame, encodeWsFrame } from '../src/stream-to-websocket'
import { ev } from './test-utils'

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
