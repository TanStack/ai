import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { DuplicateToolNameError } from '../src/activities/chat/tools/unique-tool-names'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { StreamChunk, Tool } from '../src/types'

function nativeTool(name: string): Tool {
  return {
    name,
    description: '',
    metadata: { __kind: 'anthropic.web_search' },
  }
}

function customTool(name: string): Tool {
  return {
    name,
    description: 'Search application data',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
    },
  }
}

async function runChat(tools: Array<Tool>) {
  const { adapter } = createMockAdapter({ iterations: [] })
  const stream = chat({
    adapter,
    messages: [{ role: 'user', content: 'hi' }],
    tools,
  })
  return collectChunks(stream as AsyncIterable<StreamChunk>)
}

describe('duplicate tool names', () => {
  it('throws DuplicateToolNameError when a factory tool and a custom tool share a name', async () => {
    await expect(
      runChat([nativeTool('web_search'), customTool('web_search')]),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof DuplicateToolNameError)) {
        return false
      }
      return (
        error.toolName === 'web_search' &&
        error.message.includes('provider-native') &&
        error.message.includes('web_search')
      )
    })
  })

  it('throws DuplicateToolNameError when two custom tools share a name', async () => {
    await expect(
      runChat([customTool('lookup'), customTool('lookup')]),
    ).rejects.toSatisfy((error: unknown) => {
      if (!(error instanceof DuplicateToolNameError)) {
        return false
      }
      return (
        error.toolName === 'lookup' &&
        error.message.includes('must be unique') &&
        !error.message.includes('provider-native')
      )
    })
  })

  it('allows a factory tool and a custom tool when the names differ', async () => {
    const { adapter } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished('stop')]],
    })

    const stream = chat({
      adapter,
      messages: [{ role: 'user', content: 'hi' }],
      tools: [nativeTool('web_search'), customTool('search_docs')],
    })

    await expect(
      collectChunks(stream as AsyncIterable<StreamChunk>),
    ).resolves.toEqual(expect.any(Array))
  })
})
