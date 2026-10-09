import { describe, expect, it } from 'vitest'
import {
  transformMessagesForReplay,
  hashToolCallId,
} from '../src/utilities/replay-messages'
import { orderedAssistantBlocks } from '../src/utilities/block-order'
import type { MessageSource, ModelMessage, ToolCall } from '../src/types'

const target: MessageSource = {
  provider: 'target',
  api: 'wire',
  model: 'model',
}
const foreign = { ...target, model: 'other' }
const call = (id: string): ToolCall => ({
  id,
  type: 'function',
  function: { name: 'lookup', arguments: '{ "q": "x" }' },
})

describe('request-local replay', () => {
  it.each(['error', 'aborted'])(
    'drops only results of the latest failed call batch: %s',
    (stopReason) => {
      const messages: Array<ModelMessage> = [
        { role: 'assistant', content: null, toolCalls: [call('a')] },
        { role: 'tool', toolCallId: 'a', content: 'keep earlier' },
        {
          role: 'assistant',
          content: 'partial',
          toolCalls: [call('x')],
          metadata: { tanstack: { stopReason } },
        },
        { role: 'tool', toolCallId: 'x', content: 'drop failed result' },
        { role: 'assistant', content: null, toolCalls: [call('x')] },
        { role: 'tool', toolCallId: 'x', content: 'keep reused ID' },
        { role: 'user', content: 'continue' },
      ]
      const before = JSON.stringify(messages)
      const result = transformMessagesForReplay(messages)
      expect(result.messages).toEqual([
        messages[0],
        messages[1],
        messages[4],
        messages[5],
        messages[6],
      ])
      expect(JSON.stringify(messages)).toBe(before)
    },
  )
  it('cleans history without guessing a source when the target is absent', () => {
    const toolCall = {
      ...call('signed'),
      metadata: {
        thoughtSignature: 'opaque',
        itemId: 'item',
        namespace: 'keep',
      },
    }
    const message: ModelMessage = {
      role: 'assistant',
      content: 'answer',
      thinking: [
        { content: 'reason', signature: 'signed' },
        { content: '', signature: 'encrypted', redacted: true },
      ],
      toolCalls: [toolCall],
      metadata: { tanstack: { source: foreign } },
    }
    const result = transformMessagesForReplay([
      message,
      {
        role: 'assistant',
        content: 'partial',
        metadata: { tanstack: { stopReason: 'error' } },
      },
    ])
    expect(result.messages[0]).toBe(message)
    expect(result.messages[0]?.toolCalls?.[0]).toBe(toolCall)
    expect(result.messages[1]?.error).toBe('No result provided')
  })
  it('keeps foreign multimodal parts and converts readable thinking before them', () => {
    const parts: NonNullable<Extract<ModelMessage['content'], Array<unknown>>> =
      [
        { type: 'text', content: 'answer' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/opaque' },
        },
      ]
    const message: ModelMessage = {
      role: 'assistant',
      content: parts,
      thinking: [
        { content: 'reason', signature: 'foreign' },
        { content: '', signature: 'opaque', redacted: true },
      ],
      metadata: { tanstack: { source: foreign } },
    }
    expect(
      transformMessagesForReplay([message], target).messages[0]?.content,
    ).toEqual([{ type: 'text', content: 'reason' }, ...parts])
    expect(message.content).toBe(parts)
  })
  it.each([undefined, target])(
    'preserves complete source-free and same-source messages: %#',
    (source) => {
      const message: ModelMessage = {
        role: 'assistant',
        content: 'answer',
        thinking: [{ content: 'private', signature: '\ud800' }],
        ...(source ? { metadata: { tanstack: { source } } } : {}),
      }
      expect(transformMessagesForReplay([message], target).messages[0]).toBe(
        message,
      )
    },
  )
  it.each(['provider', 'api', 'model'])(
    'compares every source field: %s',
    (field) => {
      const source = { ...target, [field]: 'different' }
      const message: ModelMessage = {
        role: 'assistant',
        content: 'answer',
        thinking: [{ content: 'reason', signature: 'opaque' }],
        metadata: { tanstack: { source } },
      }
      expect(
        transformMessagesForReplay([message], target).messages[0],
      ).toMatchObject({ content: 'reasonanswer' })
      expect(
        transformMessagesForReplay([message], target).messages[0]?.thinking,
      ).toBeUndefined()
    },
  )
  it('rebuilds ordered blocks before changed text lengths and drops foreign opaque thinking', () => {
    const first = call('one')
    first.metadata = {
      thoughtSignature: 'foreign',
      namespace: 'keep',
      itemId: 'item',
    }
    const message: ModelMessage = {
      role: 'assistant',
      content: 'AB',
      thinking: [
        { content: 'reason', signature: 'signed' },
        { content: '', signature: 'encrypted', redacted: true },
        { content: '   ', signature: 'empty' },
      ],
      toolCalls: [first, call('two')],
      blockOrder: [
        { type: 'text', length: 1 },
        { type: 'thinking', index: 0 },
        { type: 'tool-call', id: 'one' },
        { type: 'thinking', index: 1 },
        { type: 'text', length: 1 },
        { type: 'thinking', index: 2 },
        { type: 'tool-call', id: 'two' },
      ],
      metadata: { tanstack: { source: foreign } },
    }
    const before = JSON.stringify(message)
    const result = transformMessagesForReplay(
      [message],
      target,
      (id) => `mapped_${id}`,
    )
    expect(orderedAssistantBlocks(result.messages[0]!)).toEqual([
      { type: 'text', text: 'Areason' },
      {
        type: 'tool-call',
        toolCall: {
          ...first,
          id: 'mapped_one',
          metadata: { namespace: 'keep', itemId: 'item' },
        },
      },
      { type: 'text', text: 'B' },
      { type: 'tool-call', toolCall: { ...call('two'), id: 'mapped_two' } },
    ])
    expect(JSON.stringify(message)).toBe(before)
    expect(
      transformMessagesForReplay(result.messages, target).messages,
    ).toEqual(result.messages)
  })
  it('reserves later same-source IDs and retries truncation collisions for calls and results', () => {
    const messages: Array<ModelMessage> = [
      {
        role: 'assistant',
        content: null,
        toolCalls: [call('foreign/one'), call('foreign/two')],
        metadata: { tanstack: { source: foreign } },
      },
      { role: 'tool', toolCallId: 'foreign/one', content: 'one' },
      { role: 'tool', toolCallId: 'foreign/two', content: 'two' },
      { role: 'assistant', content: null, toolCalls: [call('reserved')] },
      { role: 'tool', toolCallId: 'reserved', content: 'three' },
    ]
    const seenSources: Array<MessageSource | undefined> = []
    const result = transformMessagesForReplay(
      messages,
      target,
      (_id, context) => {
        seenSources.push(context.source)
        return context.attempt === 0 ? 'reserved' : `unique_${context.attempt}`
      },
    )
    expect(result.messages[0]?.toolCalls?.map((entry) => entry.id)).toEqual([
      'unique_1',
      'unique_2',
    ])
    expect(
      result.messages.slice(1, 3).map((entry) => entry.toolCallId),
    ).toEqual(['unique_1', 'unique_2'])
    expect(result.messages[3]).toBe(messages[3])
    expect(seenSources).toContainEqual(foreign)
  })
  it('drops genuine failed segments and closes only missing results before each boundary', () => {
    const messages: Array<ModelMessage> = [
      { role: 'assistant', content: null, toolCalls: [call('a'), call('b')] },
      { role: 'tool', toolCallId: 'a', content: '' },
      {
        role: 'assistant',
        content: 'partial',
        metadata: { tanstack: { stopReason: 'aborted' } },
      },
      { role: 'user', content: 'retry' },
    ]
    const result = transformMessagesForReplay(messages, target)
    expect(result.messages).toEqual([
      messages[0],
      messages[1],
      {
        role: 'tool',
        toolCallId: 'b',
        name: 'lookup',
        content: 'No result provided',
        error: 'No result provided',
      },
      messages[3],
    ])
  })
  it('adds missing results at end and keeps local stop and opaque content intact', () => {
    const message: ModelMessage = {
      role: 'assistant',
      content: 'local stop',
      toolCalls: [call('end')],
      thinking: [{ content: '', signature: '\ud800', redacted: true }],
    }
    const result = transformMessagesForReplay([message], target)
    expect(result.messages[0]).toBe(message)
    expect(result.messages[1]?.error).toBe('No result provided')
  })
  it('matches the pi UTF-16 hash', () => {
    expect(hashToolCallId('hello')).toBe('1h6qa0qrowduu')
  })
})
