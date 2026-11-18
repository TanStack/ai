import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai/client'
import { ChatClient } from '../src/chat-client'
import { registerWebMCPTools } from '../src/web-mcp-tools'
import { createTextChunks, createToolCallChunks } from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

const SERVER_ONLY_MESSAGE =
  'setResultMetadata works only in server tools. A client tool can return the data in its output or keep it in app state.'

const metadataTool = toolDefinition({
  name: 'metadata_tool',
  description: 'Sets result metadata',
}).client((_input, context) => {
  // @ts-expect-error A client tool cannot set result metadata. The test checks the runtime throw for untyped callers.
  context?.setResultMetadata?.({})
  return 'ok'
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('client tool setResultMetadata', () => {
  it('gives the client tool call an error result', async () => {
    const turns = [
      createToolCallChunks([
        { id: 'tc-metadata', name: 'metadata_tool', arguments: '{}' },
      ]),
      createTextChunks('done', 'msg-done'),
    ]
    let turn = 0
    const adapter: ConnectConnectionAdapter = {
      async *connect() {
        yield* turns[turn++] ?? []
      },
    }
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: adapter,
      tools: [metadataTool],
    })

    await client.sendMessage('go')

    const parts = client.getMessages().flatMap((message) => message.parts)
    expect(
      parts.find(
        (part) => part.type === 'tool-call' && part.id === 'tc-metadata',
      ),
    ).toMatchObject({
      state: 'error',
      output: { error: SERVER_ONLY_MESSAGE },
    })
  })

  it('rejects the WebMCP tool call', async () => {
    const tools = new Map<
      string,
      { execute: (input: object) => Promise<unknown> }
    >()
    vi.stubGlobal('document', {
      modelContext: {
        async registerTool(tool: {
          name: string
          execute: (input: object) => Promise<unknown>
        }) {
          tools.set(tool.name, tool)
        },
      },
    })

    await registerWebMCPTools([metadataTool], {
      signal: new AbortController().signal,
    })

    await expect(tools.get('metadata_tool')?.execute({})).rejects.toThrow(
      SERVER_ONLY_MESSAGE,
    )
  })
})
