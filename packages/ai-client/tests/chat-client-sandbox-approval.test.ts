import { describe, expect, it, vi } from 'vitest'
import { INTERRUPT_BINDING_VERSION } from '@tanstack/ai/client'
import { ByokMissingError } from '@tanstack/ai/byok'
import { ChatClient } from '../src/chat-client'
import {
  createMockConnectionAdapter,
  createTextChunks,
  createUIMessage,
} from './test-utils'
import type { Interrupt, ModelMessage } from '@tanstack/ai/client'
import type { ChatClientOptions, UIMessage } from '../src/types'

const approvalId = 'claude-code:command:rm -rf build'
const rowId = `sandbox.approval:${approvalId}`

const pendingRow: UIMessage = {
  id: rowId,
  role: 'activity',
  parts: [
    {
      type: 'activity',
      activityType: 'sandbox.approval',
      content: { approvalId, title: 'Run rm -rf build', status: 'pending' },
    },
  ],
}

/** The `status` of the approval row in `messages`. */
function rowStatus(messages: ReadonlyArray<UIMessage | ModelMessage>) {
  for (const message of messages) {
    if (!('parts' in message) || message.id !== rowId) continue
    const part = message.parts[0]
    return part?.type === 'activity' ? part.content.status : undefined
  }
  return undefined
}

/**
 * A client with a user turn and a pending approval row. `sent` has the
 * messages of each request.
 */
function createClient(
  options: Pick<ChatClientOptions, 'initialResumeSnapshot'> = {},
) {
  const sent: Array<Array<UIMessage | ModelMessage>> = []
  const onMessagesChange = vi.fn()
  const client = new ChatClient({
    threadId: 'thread-1',
    connection: createMockConnectionAdapter({
      chunks: createTextChunks('done', 'asst-1'),
      chunkDelay: 5,
      onConnect: (messages) => {
        sent.push(messages)
      },
    }),
    initialMessages: [createUIMessage('user-1', 'Clean up'), pendingRow],
    onMessagesChange,
    ...options,
  })
  return { client, sent, onMessagesChange }
}

describe('ChatClient.respondToSandboxApproval', () => {
  it.each([
    [true, 'granted'],
    [false, 'denied'],
  ])(
    'with %s, sets the row to %s and starts a run that carries the row',
    async (granted, status) => {
      const { client, sent, onMessagesChange } = createClient()

      await client.respondToSandboxApproval(approvalId, granted)

      expect(rowStatus(client.getMessages())).toBe(status)
      // The first messages change is the decision, before the run.
      expect(rowStatus(onMessagesChange.mock.calls[0]?.[0] ?? [])).toBe(status)
      expect(sent).toHaveLength(1)
      expect(rowStatus(sent[0] ?? [])).toBe(status)
    },
  )

  it('does nothing for an unknown approval id', async () => {
    const { client, sent, onMessagesChange } = createClient()

    await client.respondToSandboxApproval('claude-code:command:ls', true)

    expect(rowStatus(client.getMessages())).toBe('pending')
    expect(onMessagesChange).not.toHaveBeenCalled()
    expect(sent).toEqual([])
  })

  it('does nothing when the row already has a decision', async () => {
    const { client, sent } = createClient()

    await client.respondToSandboxApproval(approvalId, true)
    await client.respondToSandboxApproval(approvalId, false)

    expect(rowStatus(client.getMessages())).toBe('granted')
    expect(sent).toHaveLength(1)
  })

  it('starts the run after a run in progress ends', async () => {
    const { client, sent } = createClient()

    const sending = client.sendMessage('Go on')
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(true))
    await client.respondToSandboxApproval(approvalId, true)
    expect(sent).toHaveLength(1)
    await sending

    expect(sent).toHaveLength(2)
    // A pending row is never sent. The run after the decision carries it.
    expect(rowStatus(sent[0] ?? [])).toBeUndefined()
    expect(rowStatus(sent[1] ?? [])).toBe('granted')
  })

  it('keeps the decision but starts no run while an interrupt waits', async () => {
    const interrupt: Interrupt = {
      id: 'confirm-1',
      reason: 'confirmation',
      metadata: {
        'tanstack:interruptBinding': {
          v: INTERRUPT_BINDING_VERSION,
          kind: 'generic',
          interruptId: 'confirm-1',
          interruptedRunId: 'run-1',
          generation: 1,
          responseSchemaHash: 'none',
        },
      },
    }
    const { client, sent } = createClient({
      initialResumeSnapshot: {
        resumeState: { threadId: 'thread-1', runId: 'run-1' },
        pendingInterrupts: [interrupt],
      },
    })

    await client.respondToSandboxApproval(approvalId, true)

    expect(rowStatus(client.getMessages())).toBe('granted')
    expect(sent).toEqual([])
  })

  it('keeps the row pending when send throws, so a later call can retry', async () => {
    let fail = true
    const sent: Array<Array<UIMessage | ModelMessage>> = []
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('done', 'asst-1'),
        chunkDelay: 5,
        onConnect: (messages) => {
          sent.push(messages)
        },
      }),
      initialMessages: [createUIMessage('user-1', 'Clean up'), pendingRow],
      onResponse: () => {
        if (fail) throw new ByokMissingError('openai')
      },
    })

    await expect(
      client.respondToSandboxApproval(approvalId, true),
    ).rejects.toBeInstanceOf(ByokMissingError)
    expect(rowStatus(client.getMessages())).toBe('pending')
    expect(sent).toEqual([])

    fail = false
    await client.respondToSandboxApproval(approvalId, true)
    expect(rowStatus(client.getMessages())).toBe('granted')
    expect(sent).toHaveLength(1)
    expect(rowStatus(sent[0] ?? [])).toBe('granted')
  })

  it('does not treat a false streamResponse result as a failed send', async () => {
    const sent: Array<Array<UIMessage | ModelMessage>> = []
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: createMockConnectionAdapter({
        shouldError: true,
        error: new Error('connect failed'),
        onConnect: (messages) => {
          sent.push(messages)
        },
      }),
      initialMessages: [createUIMessage('user-1', 'Clean up'), pendingRow],
    })

    await client.respondToSandboxApproval(approvalId, true)

    expect(rowStatus(client.getMessages())).toBe('granted')
    expect(sent).toHaveLength(1)
    await client.respondToSandboxApproval(approvalId, false)
    expect(rowStatus(client.getMessages())).toBe('granted')
  })

  it('does not start a queued approval run after clear()', async () => {
    const { client, sent } = createClient()

    const sending = client.sendMessage('Go on')
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(true))
    await client.respondToSandboxApproval(approvalId, true)
    client.clear()
    await sending

    expect(sent).toHaveLength(1)
    expect(client.getMessages()).toEqual([])
  })

  it('restores pending when stop() skips a queued approval continue', async () => {
    const { client, sent } = createClient()

    const sending = client.sendMessage('Go on')
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(true))
    await client.respondToSandboxApproval(approvalId, true)
    expect(rowStatus(client.getMessages())).toBe('granted')
    client.stop()
    await sending

    expect(rowStatus(client.getMessages())).toBe('pending')
    expect(sent).toHaveLength(1)

    await client.respondToSandboxApproval(approvalId, true)
    expect(rowStatus(client.getMessages())).toBe('granted')
    expect(sent).toHaveLength(2)
    expect(rowStatus(sent[1] ?? [])).toBe('granted')
  })

  it('does not restore a delivered approval when a later queued continue throws', async () => {
    const approvalIdB = 'claude-code:command:ls'
    const rowIdB = `sandbox.approval:${approvalIdB}`
    const pendingB: UIMessage = {
      id: rowIdB,
      role: 'activity',
      parts: [
        {
          type: 'activity',
          activityType: 'sandbox.approval',
          content: {
            approvalId: approvalIdB,
            title: 'Run ls',
            status: 'pending',
          },
        },
      ],
    }
    let responses = 0
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('done', 'asst-1'),
        chunkDelay: 5,
      }),
      initialMessages: [
        createUIMessage('user-1', 'Clean up'),
        pendingRow,
        pendingB,
      ],
      onResponse: () => {
        responses += 1
        if (responses === 2) throw new ByokMissingError('openai')
      },
    })

    const approvingA = client.respondToSandboxApproval(approvalId, true)
    await vi.waitFor(() => expect(client.getIsLoading()).toBe(true))
    await client.respondToSandboxApproval(approvalIdB, true)
    await expect(approvingA).rejects.toBeInstanceOf(ByokMissingError)

    expect(rowStatus(client.getMessages())).toBe('granted')
    const rowB = client.getMessages().find((message) => message.id === rowIdB)
    const partB = rowB?.parts[0]
    expect(partB?.type === 'activity' ? partB.content.status : undefined).toBe(
      'pending',
    )
  })
})
