import { describe, expect, it } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { ChatClient } from '../src/chat-client'
import { createTextChunks, createToolCallChunks } from './test-utils'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'

describe('ChatClient runtime context', () => {
  it('passes client-local context to client tool execution without serializing it', async () => {
    const firstChunks = createToolCallChunks([
      { id: 'tc-client-context', name: 'read_client_context', arguments: '{}' },
    ])
    const secondChunks = createTextChunks('done', 'msg-2')
    const outputs: Array<unknown> = []
    const sentPayloads: Array<Record<string, unknown> | undefined> = []
    let callIndex = 0

    const adapter: ConnectConnectionAdapter = {
      async *connect(_messages, data, abortSignal) {
        sentPayloads.push(data)
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
      outputs.push(ctx.context?.localUserId ?? null)
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
})
