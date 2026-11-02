import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai/client'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import type { ConnectConnectionAdapter } from '../src/connection-adapters'
import type { StreamChunk } from '@tanstack/ai/client'

/**
 * An AG-UI server outside TanStack AI ends a run that calls a frontend tool
 * with a success outcome and no TOOL_CALL_RESULT (issue #1464).
 */
function foreignServer(
  finished: Record<string, unknown> = {
    outcome: { type: 'success' },
  },
) {
  const requests: Array<unknown> = []
  const connection: ConnectConnectionAdapter = {
    async *connect(messages) {
      requests.push(messages)
      const runId = `run-${requests.length}`
      const chunks =
        requests.length === 1
          ? [
              { type: 'RUN_STARTED', threadId: 't', runId },
              {
                type: 'TOOL_CALL_START',
                toolCallId: 'tc-1',
                toolCallName: 'ping',
              },
              { type: 'TOOL_CALL_ARGS', toolCallId: 'tc-1', delta: '{}' },
              { type: 'TOOL_CALL_END', toolCallId: 'tc-1' },
              { type: 'RUN_FINISHED', threadId: 't', runId, ...finished },
            ]
          : [
              { type: 'RUN_STARTED', threadId: 't', runId },
              { type: 'RUN_FINISHED', threadId: 't', runId },
            ]
      for (const chunk of chunks) {
        yield { ...chunk, timestamp: Date.now() } as StreamChunk
      }
    },
  }
  return { connection, requests }
}

describe('client tools from a foreign AG-UI server', () => {
  it('runs the tool and continues with its result', async () => {
    const execute = vi.fn(() => ({ reply: 'pong' }))
    const ping = toolDefinition({
      name: 'ping',
      description: 'Reply with pong',
      inputSchema: z.object({}),
    }).client(execute)
    const { connection, requests } = foreignServer()
    const client = new ChatClient({
      threadId: 'thread-1',
      connection,
      tools: [ping],
    })

    await client.sendMessage('ping me')

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(execute).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(requests[1])).toContain('{\\"reply\\":\\"pong\\"}')
  })

  it('runs the tool when the run ends with finishReason tool_calls', async () => {
    const execute = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return { reply: 'pong' }
    })
    const ping = toolDefinition({
      name: 'ping',
      description: 'Reply with pong',
      inputSchema: z.object({}),
    }).client(execute)
    // A custom server that forwards the provider finish reason and closes.
    const { connection, requests } = foreignServer({
      finishReason: 'tool_calls',
    })
    const client = new ChatClient({
      threadId: 'thread-1',
      connection,
      tools: [ping],
    })

    await client.sendMessage('ping me')

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(execute).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(requests[1])).toContain('{\\"reply\\":\\"pong\\"}')
  })

  it.each([
    ['a success outcome', { outcome: { type: 'success' } }],
    ['finishReason tool_calls', { finishReason: 'tool_calls' }],
  ])(
    'sends the tool result before a queued message (%s)',
    async (_, finished) => {
      const execute = vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 20))
        return { reply: 'pong' }
      })
      const ping = toolDefinition({
        name: 'ping',
        description: 'Reply with pong',
        inputSchema: z.object({}),
      }).client(execute)
      const { connection, requests } = foreignServer(finished)
      const client = new ChatClient({
        threadId: 'thread-1',
        connection,
        tools: [ping],
      })

      // The second message waits in the queue while the first run streams.
      await Promise.all([
        client.sendMessage('ping me'),
        client.sendMessage('queued'),
      ])

      await vi.waitFor(() =>
        expect(
          requests.some((request) =>
            JSON.stringify(request).includes('queued'),
          ),
        ).toBe(true),
      )
      const queued = requests.find((request) =>
        JSON.stringify(request).includes('queued'),
      )
      expect(JSON.stringify(queued)).toContain('{\\"reply\\":\\"pong\\"}')
    },
  )

  describe.each([
    ['a success outcome', { outcome: { type: 'success' } }],
    ['finishReason tool_calls', { finishReason: 'tool_calls' }],
  ])('with %s', (_, finished) => {
    it.each([
      [true, '{\\"reply\\":\\"pong\\"}'],
      [false, 'User declined tool execution'],
    ])(
      'asks for approval of a tool that needs it (approved: %s)',
      async (approved, sent) => {
        const execute = vi.fn(() => ({ reply: 'pong' }))
        const ping = toolDefinition({
          name: 'ping',
          description: 'Reply with pong',
          inputSchema: z.object({}),
          needsApproval: true,
        }).client(execute)
        const { connection, requests } = foreignServer(finished)
        const client = new ChatClient({
          threadId: 'thread-1',
          connection,
          tools: [ping],
        })

        await client.sendMessage('ping me')

        const interrupt = client.getInterrupts()[0]
        if (interrupt?.kind !== 'tool-approval') {
          throw new Error('expected a tool-approval interrupt')
        }
        expect(interrupt.toolName).toBe('ping')
        expect(execute).not.toHaveBeenCalled()
        expect(requests).toHaveLength(1)

        interrupt.resolveInterrupt(approved)

        await vi.waitFor(() => expect(requests).toHaveLength(2))
        expect(execute).toHaveBeenCalledTimes(approved ? 1 : 0)
        expect(JSON.stringify(requests[1])).toContain(sent)
        expect(client.getInterrupts()).toEqual([])
      },
    )
  })

  it('keeps a queued message until the approval is answered', async () => {
    const execute = vi.fn(() => ({ reply: 'pong' }))
    const ping = toolDefinition({
      name: 'ping',
      description: 'Reply with pong',
      inputSchema: z.object({}),
      needsApproval: true,
    }).client(execute)
    const { connection, requests } = foreignServer()
    const client = new ChatClient({
      threadId: 'thread-1',
      connection,
      tools: [ping],
    })

    // The second message waits in the queue while the first run streams.
    await Promise.all([
      client.sendMessage('ping me'),
      client.sendMessage('queued'),
    ])
    await new Promise((resolve) => setTimeout(resolve, 20))

    const interrupt = client.getInterrupts()[0]
    if (interrupt?.kind !== 'tool-approval') {
      throw new Error('expected a tool-approval interrupt')
    }
    expect(requests).toHaveLength(1)

    interrupt.resolveInterrupt(true)

    await vi.waitFor(() =>
      expect(
        requests.some((request) => JSON.stringify(request).includes('queued')),
      ).toBe(true),
    )
    const queued = requests.find((request) =>
      JSON.stringify(request).includes('queued'),
    )
    expect(JSON.stringify(queued)).toContain('{\\"reply\\":\\"pong\\"}')
  })
})
