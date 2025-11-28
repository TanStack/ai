/**
 * Test for message parts ordering
 *
 * This test ensures that when an assistant message contains:
 * - Text content before tool calls
 * - Tool calls
 * - Tool results
 * - Text content after tool results
 *
 * The parts array maintains the correct order instead of concatenating all text into one part.
 */

import { describe, it, expect } from 'vitest'
import { StreamProcessor } from '../../src/stream/processor'
import { updateTextPart, updateToolCallPart } from '../../src/message-updaters'
import type { UIMessage } from '../../src/types'

describe('Message Parts Ordering', () => {
  it('should create separate text parts before and after tool calls', async () => {
    // Track the message state as it's built
    let messages: UIMessage[] = [
      {
        id: 'test-msg-1',
        role: 'assistant',
        parts: [],
        createdAt: new Date(),
      },
    ]

    // Simulate the streaming chunks from Anthropic
    const chunks = [
      // Initial text: "I'll search the product catalog for acoustic guitars and recommend a good option for you."
      {
        type: 'content',
        delta: "I'll search the product catalog",
        content: "I'll search the product catalog",
      },
      {
        type: 'content',
        delta: ' for acoustic guitars',
        content: "I'll search the product catalog for acoustic guitars",
      },
      {
        type: 'content',
        delta: ' and recommend a good option for you.',
        content:
          "I'll search the product catalog for acoustic guitars and recommend a good option for you.",
      },

      // Tool call: getGuitars
      {
        type: 'tool_call',
        toolCall: {
          id: 'tool-1',
          type: 'function',
          function: { name: 'getGuitars', arguments: '{}' },
        },
        index: 0,
      },

      // Text after tool call: "Great! I found several guitars in the catalog..."
      {
        type: 'content',
        delta: 'Great! I found several guitars',
        content: 'Great! I found several guitars',
      },
      {
        type: 'content',
        delta: ' in the catalog.',
        content: 'Great! I found several guitars in the catalog.',
      },

      // Second tool call: recommendGuitar
      {
        type: 'tool_call',
        toolCall: {
          id: 'tool-2',
          type: 'function',
          function: { name: 'recommendGuitar', arguments: '{"id": "6"}' },
        },
        index: 1,
      },

      // Done
      { type: 'done' },
    ]

    const processor = new StreamProcessor({
      handlers: {
        onTextUpdate: (content: string) => {
          // Use the actual updateTextPart function
          messages = updateTextPart(messages, 'test-msg-1', content)
        },
        onToolCallStart: (_index: number, id: string, name: string) => {
          messages = updateToolCallPart(messages, 'test-msg-1', {
            id,
            name,
            arguments: '',
            state: 'awaiting-input',
          })
        },
        onToolCallStateChange: (
          _index: number,
          id: string,
          name: string,
          state: any,
          args: string,
        ) => {
          messages = updateToolCallPart(messages, 'test-msg-1', {
            id,
            name,
            arguments: args,
            state,
          })
        },
      },
    })

    // Process the stream
    await processor.process(
      (async function* () {
        for (const chunk of chunks) {
          yield chunk
        }
      })(),
    )

    const currentMessage = messages[0]!

    // Verify the structure
    // EXPECTED: parts should be [text, tool-call, text, tool-call]
    // ACTUAL (BUG): parts are [text (concatenated), tool-call, tool-call]
    expect(currentMessage.parts.length).toBeGreaterThan(3)

    // First part should be text
    expect(currentMessage.parts[0]!.type).toBe('text')
    if (currentMessage.parts[0]!.type === 'text') {
      expect(currentMessage.parts[0]!.content).toBe(
        "I'll search the product catalog for acoustic guitars and recommend a good option for you.",
      )
    }

    // Second part should be tool-call
    expect(currentMessage.parts[1]!.type).toBe('tool-call')
    if (currentMessage.parts[1]!.type === 'tool-call') {
      expect(currentMessage.parts[1]!.name).toBe('getGuitars')
    }

    // Third part should be text (NOT concatenated with first text)
    expect(currentMessage.parts[2]!.type).toBe('text')
    if (currentMessage.parts[2]!.type === 'text') {
      expect(currentMessage.parts[2]!.content).toBe(
        'Great! I found several guitars in the catalog.',
      )
    }

    // Fourth part should be tool-call
    expect(currentMessage.parts[3]!.type).toBe('tool-call')
    if (currentMessage.parts[3]!.type === 'tool-call') {
      expect(currentMessage.parts[3]!.name).toBe('recommendGuitar')
    }
  })
})
