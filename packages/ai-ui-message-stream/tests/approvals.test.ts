import { describe, expect, it, vi } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { fakeText } from '@tanstack/ai/testing'
import { toolDefinition } from '@tanstack/ai/client'
import { ChatClient } from '@tanstack/ai-client'
import { readUIMessageStream } from 'ai'
import { z } from 'zod'
import { fromChatTransport, toUIMessageStream } from '../src'
import { chatParamsFromAISDKRequest } from '../src/request'
import type { StreamChunk } from '@tanstack/ai'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

function chunkStream(
  list: Array<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of list) controller.enqueue(chunk)
      controller.close()
    },
  })
}

describe('TanStack server, AI SDK client: approvals', () => {
  async function run(approved: boolean) {
    const fake = fakeText()
    fake.setResponses([
      { toolCalls: [{ name: 'deleteFile', input: { path: 'a.txt' } }] },
      ({ request }) => ({
        text: `Result: ${String(request.messages.at(-1)?.content)}`,
      }),
    ])
    const execute = vi.fn(() => ({ deleted: true }))
    const deleteFile = toolDefinition({
      name: 'deleteFile',
      description: 'Delete a file',
      inputSchema: z.object({ path: z.string() }),
      needsApproval: true,
    }).server(execute)

    // The run ids chat() sees, from a middleware.
    const runs: Array<{ runId: string; parentRunId?: string }> = []
    const middleware = [
      {
        onStart: (ctx: { runId: string; parentRunId?: string }) => {
          runs.push({ runId: ctx.runId, parentRunId: ctx.parentRunId })
        },
      },
    ]

    const user: UIMessage = {
      id: 'u-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Delete a.txt' }],
    }

    // Turn 1: the AI SDK client sends the user message.
    const firstParams = await chatParamsFromAISDKRequest(
      new Request('http://x/api/chat', {
        method: 'POST',
        body: JSON.stringify({ id: 'chat-1', messages: [user] }),
      }),
    )
    let first: UIMessage | undefined
    for await (const message of readUIMessageStream({
      stream: toUIMessageStream(
        chat({
          adapter: fake,
          tools: [deleteFile],
          middleware,
          ...firstParams,
        }),
      ),
    }))
      first = message
    // The message keeps the paused TanStack run id.
    expect(first?.metadata).toMatchObject({
      tanstack: { runId: runs[0]?.runId },
    })
    const requested = first?.parts.find((p) => p.type === 'tool-deleteFile')
    expect(requested).toMatchObject({
      state: 'approval-requested',
      input: { path: 'a.txt' },
      approval: { id: expect.any(String) },
    })
    expect(execute).not.toHaveBeenCalled()

    // The AI SDK client answers: `addToolApprovalResponse` sets this state.
    const answered: UIMessage = {
      ...first!,
      parts: first!.parts.map((part) =>
        part.type === 'tool-deleteFile' && part.state === 'approval-requested'
          ? {
              ...part,
              state: 'approval-responded',
              approval: { id: part.approval.id, approved },
            }
          : part,
      ),
    }

    // Turn 2: the history goes back, and chat() resumes the paused call.
    const params = await chatParamsFromAISDKRequest(
      new Request('http://x/api/chat', {
        method: 'POST',
        body: JSON.stringify({ id: 'chat-1', messages: [user, answered] }),
      }),
    )
    expect(params.resume).toEqual([
      {
        interruptId: answered.parts.flatMap((p) =>
          p.type === 'tool-deleteFile' && p.state === 'approval-responded'
            ? [p.approval.id]
            : [],
        )[0],
        status: 'resolved',
        payload: { approved },
      },
    ])
    // The resume names the paused run, not the chat id.
    expect(params.parentRunId).toBe(runs[0]?.runId)
    expect(params.parentRunId).not.toBe('chat-1')
    let second: UIMessage | undefined
    for await (const message of readUIMessageStream({
      // The AI SDK client continues the last assistant message.
      message: answered,
      stream: toUIMessageStream(
        chat({ adapter: fake, tools: [deleteFile], middleware, ...params }),
      ),
    }))
      second = message
    expect(runs[1]?.parentRunId).toBe(runs[0]?.runId)
    return { execute, second: second! }
  }

  it('runs the tool after the user approves', async () => {
    const { execute, second } = await run(true)
    expect(execute).toHaveBeenCalledTimes(1)
    expect(second.parts).toMatchObject([
      { type: 'step-start' },
      {
        type: 'tool-deleteFile',
        state: 'output-available',
        output: { deleted: true },
      },
      { type: 'step-start' },
      { type: 'text', text: 'Result: {"deleted":true}' },
    ])
  })

  it('skips the tool after the user denies', async () => {
    const { execute, second } = await run(false)
    expect(execute).not.toHaveBeenCalled()
    expect(second.parts).toMatchObject([
      { type: 'step-start' },
      {
        type: 'tool-deleteFile',
        state: 'output-denied',
        approval: { approved: false },
      },
      { type: 'step-start' },
      { type: 'text', text: expect.stringContaining('Result:') },
    ])
  })

  it('shows a subagent approval on its card, not as a top-level request', async () => {
    const events: Array<StreamChunk> = [
      { type: EventType.RUN_STARTED, threadId: 't', runId: 'r' },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call-1',
        toolCallName: 'researcher',
        parentMessageId: 'm',
      },
      { type: EventType.TOOL_CALL_END, toolCallId: 'call-1' },
      {
        type: EventType.SUBAGENT_STARTED,
        subagentRunId: 's-1',
        name: 'researcher',
        parentToolCallId: 'call-1',
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'c-1',
        toolCallName: 'deleteFile',
        subagentRunId: 's-1',
      },
      {
        type: EventType.SUBAGENT_FINISHED,
        subagentRunId: 's-1',
        outcome: { type: 'suspended', interruptIds: ['ap-1'] },
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 't',
        runId: 'r',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'ap-1',
              reason: 'tool_call',
              toolCallId: 'c-1',
              subagentRunId: 's-1',
              metadata: { kind: 'approval' },
            },
          ],
        },
      },
    ]
    async function* source() {
      yield* events
    }
    let message: UIMessage | undefined
    // The AI SDK client throws on an approval for an unknown tool call.
    for await (const m of readUIMessageStream({
      stream: toUIMessageStream(source()),
    }))
      message = m
    expect(message?.parts).toMatchObject([
      { type: 'step-start' },
      { type: 'tool-researcher', toolCallId: 'call-1' },
      {
        type: 'data-subagent',
        id: 's-1',
        data: { status: 'suspended', interruptIds: ['ap-1'] },
      },
    ])
  })

  it('rejects a body that is not an AI SDK chat request', async () => {
    const error: unknown = await chatParamsFromAISDKRequest(
      new Request('http://x/api/chat', { method: 'POST', body: '{}' }),
    ).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Response)
    expect(error instanceof Response && error.status).toBe(400)
  })

  it('rejects an approval answer with no paused run id', async () => {
    // A history that `toUIMessageStream` did not make has no run to resume.
    const assistant: UIMessage = {
      id: 'a-1',
      role: 'assistant',
      parts: [
        {
          type: 'dynamic-tool',
          toolName: 'deleteFile',
          toolCallId: 'call-1',
          input: { path: 'a.txt' },
          state: 'approval-responded',
          approval: { id: 'ap-1', approved: true },
        },
      ],
    }
    const error: unknown = await chatParamsFromAISDKRequest(
      new Request('http://x/api/chat', {
        method: 'POST',
        body: JSON.stringify({ id: 'chat-1', messages: [assistant] }),
      }),
    ).catch((e: unknown) => e)
    expect(error instanceof Response && error.status).toBe(400)
  })
})

describe('AI SDK server, TanStack client: approvals', () => {
  const deleteFile = toolDefinition({
    name: 'deleteFile',
    description: 'Delete a file',
    inputSchema: z.object({ path: z.string() }),
    needsApproval: true,
  })

  const tools = [deleteFile] as const

  /** `bound`: the adapter gets the tools too, as the docs show. */
  async function run(
    approved: boolean,
    answer: (client: ChatClient<typeof tools>) => void,
    bound = true,
  ) {
    const requests: Array<Array<UIMessage>> = []
    const transport: ChatTransport<UIMessage> = {
      sendMessages({ messages }) {
        requests.push(messages)
        return Promise.resolve(
          chunkStream(
            requests.length === 1
              ? [
                  { type: 'start', messageId: 'a-1' },
                  {
                    type: 'tool-input-start',
                    toolCallId: 'c-1',
                    toolName: 'deleteFile',
                  },
                  {
                    type: 'tool-input-available',
                    toolCallId: 'c-1',
                    toolName: 'deleteFile',
                    input: { path: 'a.txt' },
                  },
                  {
                    type: 'tool-approval-request',
                    approvalId: 'ap-1',
                    toolCallId: 'c-1',
                  },
                  { type: 'finish', finishReason: 'tool-calls' },
                ]
              : [
                  { type: 'start', messageId: 'a-1' },
                  approved
                    ? {
                        type: 'tool-output-available',
                        toolCallId: 'c-1',
                        output: { deleted: true },
                      }
                    : { type: 'tool-output-denied', toolCallId: 'c-1' },
                  { type: 'text-start', id: '0' },
                  { type: 'text-delta', id: '0', delta: 'All done.' },
                  { type: 'text-end', id: '0' },
                  { type: 'finish', finishReason: 'stop' },
                ],
          ),
        )
      },
      reconnectToStream: () => Promise.resolve(null),
    }
    const client = new ChatClient({
      threadId: 'thread-1',
      tools,
      connection: fromChatTransport(transport, bound ? { tools } : {}),
    })

    await client.sendMessage('Delete a.txt')
    const toolCall = client
      .getMessages()
      .flatMap((m) => m.parts)
      .find((p) => p.type === 'tool-call')
    expect(toolCall).toMatchObject({
      state: 'approval-requested',
      approval: { id: 'ap-1' },
    })

    expect(client.getInterrupts()).toMatchObject([
      {
        kind: bound ? 'tool-approval' : 'generic',
        canResolve: true,
        id: 'ap-1',
        metadata: { toolName: 'deleteFile', input: { path: 'a.txt' } },
      },
    ])
    answer(client)

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1]!.find((m) => m.role === 'assistant')?.parts).toEqual([
      {
        type: 'dynamic-tool',
        toolName: 'deleteFile',
        toolCallId: 'c-1',
        input: { path: 'a.txt' },
        state: 'approval-responded',
        approval: { id: 'ap-1', approved },
      },
    ])
    await vi.waitFor(() =>
      expect(JSON.stringify(client.getMessages())).toContain('All done.'),
    )
    expect(client.getInterrupts()).toEqual([])
    return client
  }

  it('sends the approval and shows the tool output', async () => {
    const client = await run(true, (c) => {
      const [interrupt] = c.getInterrupts()
      if (interrupt?.kind !== 'tool-approval') throw new Error('not bound')
      interrupt.resolveInterrupt(true)
    })
    const parts = client.getMessages().flatMap((m) => m.parts)
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'c-1',
        content: '{"deleted":true}',
      }),
    )
  })

  it('sends the denial and marks the tool result as denied', async () => {
    const client = await run(false, (c) => c.resolveInterrupts(false))
    const parts = client.getMessages().flatMap((m) => m.parts)
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'c-1',
        state: 'error',
        outcome: 'denied',
      }),
    )
  })

  it('falls back to a generic interrupt when the adapter has no tools', async () => {
    const client = await run(
      true,
      (c) => {
        const [interrupt] = c.getInterrupts()
        if (interrupt?.kind !== 'generic') throw new Error('expected generic')
        interrupt.resolveInterrupt({ approved: true })
      },
      false,
    )
    expect(client.getMessages().flatMap((m) => m.parts)).toContainEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: 'c-1',
        content: '{"deleted":true}',
      }),
    )
  })
})
