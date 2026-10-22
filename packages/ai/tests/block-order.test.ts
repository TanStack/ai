import { describe, expect, it } from 'vitest'
import * as adapterInternals from '../src/adapter-internals'
import * as ai from '../src/index'
import {
  buildBlockOrder,
  orderedAssistantBlocks,
} from '../src/utilities/block-order'
import type { OrderedAssistantBlock } from '../src/utilities/block-order'
import type { ModelMessage, ModelMessageBlock, ToolCall } from '../src/types'

function call(id: string): ToolCall {
  return {
    id,
    type: 'function',
    function: { name: 'lookup', arguments: '{}' },
  }
}

/** A short text form of resolved blocks, for readable assertions. */
function describeBlocks(blocks: Array<OrderedAssistantBlock> | undefined) {
  return blocks?.map((block) =>
    block.type === 'thinking'
      ? `thinking:${block.thinking.content}`
      : block.type === 'text'
        ? `text:${block.text}`
        : `tool-call:${block.toolCall.id}`,
  )
}

const thinking = [
  { content: 'plan', signature: 'sig-a' },
  { content: 'check', signature: 'sig-b' },
]

/** thinking, text "A", tool call, thinking, text "B" */
const interleaved: ModelMessage = {
  role: 'assistant',
  content: 'AB',
  thinking,
  toolCalls: [call('call_1')],
  blockOrder: [
    { type: 'thinking', index: 0 },
    { type: 'text', length: 1 },
    { type: 'tool-call', id: 'call_1' },
    { type: 'thinking', index: 1 },
    { type: 'text', length: 1 },
  ],
}

function withOrder(blockOrder: Array<ModelMessageBlock>): ModelMessage {
  return { ...interleaved, blockOrder }
}

describe('buildBlockOrder', () => {
  it('returns undefined for the default order', () => {
    expect(
      buildBlockOrder([
        { type: 'thinking' },
        { type: 'thinking' },
        { type: 'text', text: 'Hel' },
        { type: 'text', text: 'lo' },
        { type: 'tool-call', id: 'call_1' },
        { type: 'tool-call', id: 'call_2' },
      ]),
    ).toBeUndefined()
    expect(buildBlockOrder([])).toBeUndefined()
  })

  it('maps thinking, tool call, thinking, tool call', () => {
    expect(
      buildBlockOrder([
        { type: 'thinking' },
        { type: 'tool-call', id: 'call_1' },
        { type: 'thinking' },
        { type: 'tool-call', id: 'call_2' },
      ]),
    ).toEqual([
      { type: 'thinking', index: 0 },
      { type: 'tool-call', id: 'call_1' },
      { type: 'thinking', index: 1 },
      { type: 'tool-call', id: 'call_2' },
    ])
  })

  it('maps text after a tool call', () => {
    expect(
      buildBlockOrder([
        { type: 'text', text: 'A' },
        { type: 'tool-call', id: 'call_1' },
        { type: 'text', text: 'B' },
      ]),
    ).toEqual([
      { type: 'text', length: 1 },
      { type: 'tool-call', id: 'call_1' },
      { type: 'text', length: 1 },
    ])
  })

  it('merges adjacent text and leaves out empty text', () => {
    expect(
      buildBlockOrder([
        { type: 'thinking' },
        { type: 'text', text: 'Hel' },
        { type: 'text', text: 'lo' },
        { type: 'thinking' },
        { type: 'text', text: '' },
        { type: 'text', text: 'B' },
      ]),
    ).toEqual([
      { type: 'thinking', index: 0 },
      { type: 'text', length: 5 },
      { type: 'thinking', index: 1 },
      { type: 'text', length: 1 },
    ])
  })

  it('keeps an emoji text block whole', () => {
    // "Done 👍" is 7 UTF-16 code units: the emoji is a surrogate pair.
    const blockOrder = buildBlockOrder([
      { type: 'thinking' },
      { type: 'text', text: 'Done 👍' },
      { type: 'thinking' },
      { type: 'text', text: 'Next' },
    ])
    expect(blockOrder).toEqual([
      { type: 'thinking', index: 0 },
      { type: 'text', length: 7 },
      { type: 'thinking', index: 1 },
      { type: 'text', length: 4 },
    ])

    const blocks = orderedAssistantBlocks({
      role: 'assistant',
      content: 'Done 👍Next',
      thinking,
      blockOrder,
    })
    expect(describeBlocks(blocks)).toEqual([
      'thinking:plan',
      'text:Done 👍',
      'thinking:check',
      'text:Next',
    ])
  })
})

describe('orderedAssistantBlocks', () => {
  it('returns undefined when the message has no map', () => {
    expect(
      orderedAssistantBlocks({ ...interleaved, blockOrder: undefined }),
    ).toBeUndefined()
  })

  it('resolves the blocks in map order', () => {
    expect(describeBlocks(orderedAssistantBlocks(interleaved))).toEqual([
      'thinking:plan',
      'text:A',
      'tool-call:call_1',
      'thinking:check',
      'text:B',
    ])
  })

  it.each([
    { label: 'null', content: null },
    { label: 'empty', content: '' },
  ])(
    'reads a map with no text on a message with $label content',
    ({ content }) => {
      const blocks = orderedAssistantBlocks({
        role: 'assistant',
        content,
        thinking,
        toolCalls: [call('call_1'), call('call_2')],
        blockOrder: [
          { type: 'thinking', index: 0 },
          { type: 'tool-call', id: 'call_1' },
          { type: 'thinking', index: 1 },
          { type: 'tool-call', id: 'call_2' },
        ],
      })
      expect(describeBlocks(blocks)).toEqual([
        'thinking:plan',
        'tool-call:call_1',
        'thinking:check',
        'tool-call:call_2',
      ])
    },
  )

  const invalid: Array<{ name: string; message: ModelMessage }> = [
    {
      name: 'a thinking index is out of range',
      message: withOrder([
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
        { type: 'tool-call', id: 'call_1' },
        { type: 'thinking', index: 2 },
        { type: 'text', length: 1 },
      ]),
    },
    {
      name: 'a thinking entry is used twice',
      message: withOrder([
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
        { type: 'tool-call', id: 'call_1' },
        { type: 'thinking', index: 1 },
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
      ]),
    },
    {
      name: 'a thinking entry is left out',
      message: withOrder([
        { type: 'thinking', index: 0 },
        { type: 'text', length: 2 },
        { type: 'tool-call', id: 'call_1' },
      ]),
    },
    {
      name: 'a tool call id is not in toolCalls',
      message: withOrder([
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
        { type: 'tool-call', id: 'call_x' },
        { type: 'thinking', index: 1 },
        { type: 'text', length: 1 },
      ]),
    },
    {
      name: 'a tool call is used twice',
      message: withOrder([
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
        { type: 'tool-call', id: 'call_1' },
        { type: 'thinking', index: 1 },
        { type: 'tool-call', id: 'call_1' },
        { type: 'text', length: 1 },
      ]),
    },
    {
      name: 'a tool call is left out',
      message: withOrder([
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
        { type: 'thinking', index: 1 },
        { type: 'text', length: 1 },
      ]),
    },
    {
      name: 'the text lengths do not add up to the content length',
      message: withOrder([
        { type: 'thinking', index: 0 },
        { type: 'text', length: 1 },
        { type: 'tool-call', id: 'call_1' },
        { type: 'thinking', index: 1 },
        { type: 'text', length: 2 },
      ]),
    },
    {
      name: 'the content is a part array',
      message: { ...interleaved, content: [{ type: 'text', content: 'AB' }] },
    },
  ]

  it.each(invalid)('returns undefined when $name', ({ message }) => {
    expect(orderedAssistantBlocks(message)).toBeUndefined()
  })
})

describe('block order exports', () => {
  it('reaches adapters from both entry points', () => {
    expect(ai.orderedAssistantBlocks).toBe(orderedAssistantBlocks)
    expect(adapterInternals.orderedAssistantBlocks).toBe(orderedAssistantBlocks)
    expect(adapterInternals.buildBlockOrder).toBe(buildBlockOrder)
  })
})
