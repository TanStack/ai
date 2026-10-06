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
function foreignServer() {
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
              {
                type: 'RUN_FINISHED',
                threadId: 't',
                runId,
                outcome: { type: 'success' },
              },
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
    const client = new ChatClient({ connection, tools: [ping] })

    await client.sendMessage('ping me')

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(execute).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(requests[1])).toContain('{\\"reply\\":\\"pong\\"}')
  })

  it('does not run a tool that needs approval', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const execute = vi.fn(() => ({ reply: 'pong' }))
    const ping = toolDefinition({
      name: 'ping',
      description: 'Reply with pong',
      inputSchema: z.object({}),
      needsApproval: true,
    }).client(execute)
    const { connection, requests } = foreignServer()
    const client = new ChatClient({ connection, tools: [ping] })

    await client.sendMessage('ping me')
    await new Promise((resolve) => setTimeout(resolve, 20))

    expect(execute).not.toHaveBeenCalled()
    expect(requests).toHaveLength(1)
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })
})
