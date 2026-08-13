import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import { createTextChunks, createToolCallChunks } from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

function findToolCallPart(client: ChatClient, toolCallId: string) {
  for (const message of client.getMessages()) {
    if (message.role !== 'assistant') {
      continue
    }

    const part = message.parts.find(
      (messagePart) =>
        messagePart.type === 'tool-call' && messagePart.id === toolCallId,
    )
    if (part) {
      return part
    }
  }

  return undefined
}

function findToolResultPart(client: ChatClient, toolCallId: string) {
  for (const message of client.getMessages()) {
    if (message.role !== 'assistant') {
      continue
    }

    const part = message.parts.find(
      (messagePart) =>
        messagePart.type === 'tool-result' &&
        messagePart.toolCallId === toolCallId,
    )
    if (part) {
      return part
    }
  }

  return undefined
}

describe('ChatClient runtime context', () => {
  it('passes client-local context to client tool execution without serializing it', async () => {
    const firstChunks = createToolCallChunks([
      { id: 'tc-client-context', name: 'read_client_context', arguments: '{}' },
    ])
    const secondChunks = createTextChunks('done', 'msg-2')
    const outputs: Array<unknown> = []
    const sentPayloads: Array<Record<string, unknown> | undefined> = []
    const runContexts: Array<unknown> = []
    let callIndex = 0

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, data, abortSignal, runContext) {
        sentPayloads.push(data)
        runContexts.push(runContext)
        const chunks = callIndex === 0 ? firstChunks : secondChunks
        callIndex++
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    }

    const tool = toolDefinition({
      name: 'read_client_context',
      description: 'Read client context',
    }).client<{ localUserId: string; secretToken: string }>((_input, ctx) => {
      outputs.push({
        localUserId: ctx.context.localUserId,
        tokenLength: ctx.context.secretToken.length,
      })
      return { ok: true }
    })

    const client = new ChatClient({
      connection: adapter,
      context: { localUserId: 'local-1', secretToken: 'secret-value' },
      tools: [tool],
    })

    await client.sendMessage('use client context')

    expect(outputs).toEqual([{ localUserId: 'local-1', tokenLength: 12 }])
    expect(JSON.stringify(sentPayloads)).not.toContain('secret-value')
    expect(JSON.stringify(runContexts)).not.toContain('secret-value')
    expect(runContexts).toEqual([
      expect.objectContaining({
        forwardedProps: {},
      }),
      expect.objectContaining({
        forwardedProps: {},
      }),
    ])
  })

  it('clears client-local context when updateOptions receives undefined', async () => {
    type ClientContext = { localUserId: string }

    const toolChunks = createToolCallChunks([
      {
        id: 'tc-update-context',
        name: 'read_optional_context',
        arguments: '{}',
      },
    ])
    const textChunks = createTextChunks('done', 'msg-update-context')
    const outputs: Array<string | null> = []
    let callIndex = 0

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        const chunks = callIndex % 2 === 0 ? toolChunks : textChunks
        callIndex++
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    }

    const tool = toolDefinition({
      name: 'read_optional_context',
      description: 'Read optional client context',
    }).client<ClientContext | undefined>((_input, ctx) => {
      outputs.push(ctx?.context?.localUserId ?? null)
      return { ok: true }
    })

    const client = new ChatClient({
      connection: adapter,
      context: { localUserId: 'local-1' },
      tools: [tool],
    })

    await client.sendMessage('use initial context')
    client.updateOptions({ context: undefined })
    await client.sendMessage('use cleared context')

    expect(outputs).toEqual(['local-1', null])
  })

  it('uses the per-run context snapshot for in-flight client tool execution', async () => {
    const firstChunks = createToolCallChunks([
      {
        id: 'tc-context-snapshot',
        name: 'read_snapshot_context',
        arguments: '{}',
      },
    ])
    const secondChunks = createTextChunks('done', 'msg-context-snapshot')
    const outputs: Array<string> = []
    let callIndex = 0
    let client: ChatClient

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        const chunks = callIndex === 0 ? firstChunks : secondChunks
        callIndex++
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    }

    const tool = toolDefinition({
      name: 'read_snapshot_context',
      description: 'Read snapshot context',
    }).client<{ localUserId: string }>((_input, ctx) => {
      outputs.push(ctx.context.localUserId)
      return { ok: true }
    })

    client = new ChatClient({
      connection: adapter,
      context: { localUserId: 'initial-user' },
      tools: [tool],
      onChunk: (chunk) => {
        if (chunk.type === 'TOOL_CALL_START') {
          client.updateOptions({ context: { localUserId: 'updated-user' } })
        }
      },
    })

    await client.sendMessage('use snapshot context')

    expect(outputs).toEqual(['initial-user'])
  })

  it('uses the per-run client tool snapshot for automatic result validation', async () => {
    type ClientContext = { localUserId: string }

    const firstChunks = createToolCallChunks([
      {
        id: 'tc-tool-snapshot',
        name: 'snapshot_schema_tool',
        arguments: '{}',
      },
    ])
    const secondChunks = createTextChunks('done', 'msg-tool-snapshot')
    const outputs: Array<string> = []
    let callIndex = 0

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        const chunks = callIndex === 0 ? firstChunks : secondChunks
        callIndex++
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    }

    const replacementTool = toolDefinition({
      name: 'snapshot_schema_tool',
      description: 'Replacement schema for later runs',
      outputSchema: z.object({ updated: z.number() }),
    }).client<ClientContext>(() => ({ updated: 1 }))

    const initialTool = toolDefinition({
      name: 'snapshot_schema_tool',
      description: 'Initial schema for the active run',
      outputSchema: z.object({ initial: z.string() }),
    }).client<ClientContext>((_input, ctx) => {
      outputs.push(ctx.context.localUserId)
      client.updateOptions({ tools: replacementTools })
      return { initial: 'from-original-tool' }
    })

    type SnapshotTools = ReadonlyArray<
      typeof initialTool | typeof replacementTool
    >

    const initialTools: SnapshotTools = [initialTool]
    const replacementTools: SnapshotTools = [replacementTool]

    let client: ChatClient<SnapshotTools, ClientContext>

    client = new ChatClient<SnapshotTools, ClientContext>({
      connection: adapter,
      context: { localUserId: 'snapshot-user' },
      tools: initialTools,
    })

    await client.sendMessage('use snapshot tool')

    expect(outputs).toEqual(['snapshot-user'])
    expect(findToolCallPart(client, 'tc-tool-snapshot')).toMatchObject({
      output: { initial: 'from-original-tool' },
      state: 'input-complete',
    })
    expect(findToolResultPart(client, 'tc-tool-snapshot')).toMatchObject({
      content: JSON.stringify({ initial: 'from-original-tool' }),
      state: 'complete',
    })
  })

  it('surfaces executable client tool outputSchema failures as output-error results', async () => {
    const firstChunks = createToolCallChunks([
      {
        id: 'tc-invalid-executable-output',
        name: 'invalid_output_tool',
        arguments: '{}',
      },
    ])
    const secondChunks = createTextChunks('done', 'msg-invalid-output')
    let callIndex = 0

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        const chunks = callIndex === 0 ? firstChunks : secondChunks
        callIndex++
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    }

    const tool = toolDefinition({
      name: 'invalid_output_tool',
      description: 'Returns invalid output',
      outputSchema: z.object({ count: z.number() }),
    }).client(() => JSON.parse('null'))

    const client = new ChatClient({
      connection: adapter,
      tools: [tool],
    })

    await client.sendMessage('call invalid output tool')

    expect(
      findToolCallPart(client, 'tc-invalid-executable-output'),
    ).toMatchObject({
      state: 'error',
      output: {
        error: expect.stringContaining('expected object'),
      },
    })
    expect(
      findToolResultPart(client, 'tc-invalid-executable-output'),
    ).toMatchObject({
      state: 'error',
    })
  })

  it('renders a client tool that throws an empty-message error as terminal "error" (issue #718)', async () => {
    const firstChunks = createToolCallChunks([
      {
        id: 'tc-empty-error',
        name: 'throwing_tool',
        arguments: '{}',
      },
    ])
    const secondChunks = createTextChunks('done', 'msg-empty-error')
    let callIndex = 0

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, _data, abortSignal) {
        const chunks = callIndex === 0 ? firstChunks : secondChunks
        callIndex++
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    }

    const tool = toolDefinition({
      name: 'throwing_tool',
      description: 'Throws an error with no message',
    }).client(() => {
      // Empty message — error-ness must come from the output-error state, not
      // from the truthiness of the message string.
      throw new Error()
    })

    const client = new ChatClient({
      connection: adapter,
      tools: [tool],
    })

    await client.sendMessage('call throwing tool')

    expect(findToolCallPart(client, 'tc-empty-error')).toMatchObject({
      state: 'error',
    })
    expect(findToolResultPart(client, 'tc-empty-error')).toMatchObject({
      state: 'error',
    })
  })

  it('validates manual client tool results against outputSchema', async () => {
    const tool = toolDefinition({
      name: 'manual_invalid_output_tool',
      description: 'Validates manual output',
      outputSchema: z.object({ count: z.number() }),
    }).client(() => ({ count: 1 }))

    const client = new ChatClient({
      connection: {
        async *connect() {},
      },
      tools: [tool],
    })

    client.setMessagesManually([
      {
        id: 'msg-manual-invalid-output',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'tc-manual-invalid-output',
            name: 'manual_invalid_output_tool',
            arguments: '{}',
            state: 'input-complete',
            input: {},
          },
        ],
      },
    ])

    await client.addToolResult({
      toolCallId: 'tc-manual-invalid-output',
      tool: 'manual_invalid_output_tool',
      output: JSON.parse('{"count":"not-a-number"}'),
    })

    expect(findToolCallPart(client, 'tc-manual-invalid-output')).toMatchObject({
      state: 'error',
      output: {
        error: expect.stringContaining('expected number'),
      },
    })
    expect(
      findToolResultPart(client, 'tc-manual-invalid-output'),
    ).toMatchObject({
      state: 'error',
    })
  })
})
