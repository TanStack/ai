import { describe, expect, it } from 'vitest'
import { StreamProcessor } from '../src/activities/chat/stream/processor'
import { ev } from './test-utils'

describe('StreamProcessor subagent parts', () => {
  it('nests attributed text under a type subagent part', () => {
    const processor = new StreamProcessor()
    processor.processChunk(ev.runStarted())
    processor.processChunk({
      type: 'SUBAGENT_STARTED',
      subagentRunId: 'sub-1',
      name: 'researcher',
      description: 'Looks up facts',
      timestamp: Date.now(),
    })
    processor.processChunk({
      type: 'TEXT_MESSAGE_START',
      messageId: 'child-msg',
      role: 'assistant',
      timestamp: Date.now(),
      subagentRunId: 'sub-1',
    })
    processor.processChunk({
      type: 'TEXT_MESSAGE_CONTENT',
      messageId: 'child-msg',
      delta: 'Paris',
      timestamp: Date.now(),
      subagentRunId: 'sub-1',
    })
    processor.processChunk({
      type: 'TEXT_MESSAGE_END',
      messageId: 'child-msg',
      timestamp: Date.now(),
      subagentRunId: 'sub-1',
    })
    processor.processChunk({
      type: 'SUBAGENT_FINISHED',
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
})
