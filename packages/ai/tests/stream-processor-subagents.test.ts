import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { ev } from './test-utils'
import { EventType, type StreamChunk } from '../src/types'

function attributed(chunk: StreamChunk, subagentRunId: string) {
  return { ...chunk, subagentRunId }
}

describe('StreamProcessor subagent parts', () => {
  it('nests attributed text under a type subagent part', () => {
    const processor = new StreamProcessor()
    processor.processChunk(ev.runStarted())
    processor.processChunk({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'sub-1',
      name: 'researcher',
      description: 'Looks up facts',
      timestamp: Date.now(),
    })
    processor.processChunk(attributed(ev.textStart('child-msg'), 'sub-1'))
    processor.processChunk(
      attributed(ev.textContent('Paris', 'child-msg'), 'sub-1'),
    )
    processor.processChunk(attributed(ev.textEnd('child-msg'), 'sub-1'))
    processor.processChunk({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'sub-1',
      timestamp: Date.now(),
    })
    processor.processChunk(ev.runFinished())

    const assistant = processor
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(part.subagent.id).toBe('sub-1')
    expect(part.subagent.name).toBe('researcher')
    expect(part.subagent.status).toBe('finished')
    expect(part.subagent.messages[0]?.parts).toEqual([
      { type: 'text', content: 'Paris' },
    ])
  })

  it('keeps status error when SUBAGENT_FINISHED arrives after SUBAGENT_ERROR', () => {
    const processor = new StreamProcessor()
    processor.processChunk(ev.runStarted())
    processor.processChunk({
      type: EventType.SUBAGENT_STARTED,
      subagentRunId: 'sub-1',
      name: 'researcher',
      timestamp: Date.now(),
    })
    processor.processChunk({
      type: EventType.SUBAGENT_ERROR,
      subagentRunId: 'sub-1',
      message: 'Stopped',
      timestamp: Date.now(),
    })
    processor.processChunk(attributed(ev.textStart('late-msg'), 'sub-1'))
    processor.processChunk(
      attributed(ev.textContent('late', 'late-msg'), 'sub-1'),
    )
    processor.processChunk({
      type: EventType.SUBAGENT_FINISHED,
      subagentRunId: 'sub-1',
      timestamp: Date.now(),
    })

    const assistant = processor
      .getMessages()
      .find((message) => message.role === 'assistant')
    const part = assistant?.parts.find((entry) => entry.type === 'subagent')
    expect(part?.type).toBe('subagent')
    if (part?.type !== 'subagent') throw new Error('expected subagent part')
    expect(part.subagent.status).toBe('error')
    expect(part.subagent.error).toEqual({ message: 'Stopped' })
    expect(part.subagent.messages).toEqual([])
  })
})
