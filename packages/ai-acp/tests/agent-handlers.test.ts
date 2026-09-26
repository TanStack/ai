import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { client, ndJsonStream } from '@agentclientprotocol/sdk/experimental/v2'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createAcpAgent, serveAcp, toSessionUpdate } from '../src/agent'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type {
  ClientApp,
  SessionUpdate,
} from '@agentclientprotocol/sdk/experimental/v2'

const now = () => Date.now()

/**
 * A model that answers from the last user message: `wait` waits until the
 * turn is cancelled, `remove` calls the remove tool, anything else echoes.
 */
function model(): AnyTextAdapter {
  return {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
      systemPromptMetadata: undefined as never,
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options: any) =>
      (async function* (): AsyncGenerator<StreamChunk> {
        const last = options.messages.at(-1)
        const said = typeof last?.content === 'string' ? last.content : ''
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
        }
        if (said === 'wait') {
          const signal: AbortSignal | undefined =
            options.abortController?.signal ?? options.request?.signal
          await new Promise<void>((resolve) => {
            if (!signal || signal.aborted) return resolve()
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
          return
        }
        if (said.startsWith('remove')) {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call_1',
            toolCallName: 'remove',
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_ARGS,
            toolCallId: 'call_1',
            delta: '{"path":"a.txt"}',
            timestamp: now(),
          }
          yield {
            type: EventType.TOOL_CALL_END,
            toolCallId: 'call_1',
            timestamp: now(),
          }
          yield {
            type: EventType.RUN_FINISHED,
            runId: 'r',
            threadId: 't',
            timestamp: now(),
            metadata: { tanstack: { finishReason: 'tool_calls' } },
          }
          return
        }
        const reply = last?.role === 'tool' ? 'Kept a.txt.' : `echo: ${said}`
        yield {
          type: EventType.TEXT_MESSAGE_START,
          messageId: 'm',
          role: 'assistant',
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_CONTENT,
          messageId: 'm',
          delta: reply,
          timestamp: now(),
        }
        yield {
          type: EventType.TEXT_MESSAGE_END,
          messageId: 'm',
          timestamp: now(),
        }
        yield {
          type: EventType.RUN_FINISHED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
          metadata: { tanstack: { finishReason: 'stop' } },
        }
      })(),
  }
}

function setup() {
  const remove = vi.fn(async () => ({ removed: true }))
  const harness = defineHarness({
    name: 'test/acp-handlers',
    adapter: model(),
    tools: [
      toolDefinition({
        name: 'remove',
        description: 'Remove a file',
        needsApproval: true,
        inputSchema: {
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      }).server(remove),
    ],
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const updates: Array<{ sessionId: string; update: SessionUpdate }> = []
  const permissions: Array<{ title: string; toolCallId: string }> = []
  const editor: ClientApp = client()
    .onNotification('session/update', ({ params }) => {
      updates.push({ sessionId: params.sessionId, update: params.update })
    })
    .onRequest('session/request_permission', ({ params }) => {
      permissions.push({
        title: params.title,
        // The subject names the tool call: `{ type, toolCall: { toolCallId } }`.
        toolCallId: JSON.stringify(params.subject ?? null).includes('call_1')
          ? 'call_1'
          : '',
      })
      return { outcome: { outcome: 'selected', optionId: 'reject' } }
    })
  const idle = (sessionId: string) =>
    updates.find(
      (entry) =>
        entry.sessionId === sessionId &&
        entry.update.sessionUpdate === 'state_update' &&
        entry.update.state === 'idle',
    )?.update
  const textOf = (sessionId: string) =>
    updates
      .filter((entry) => entry.sessionId === sessionId)
      .map((entry) => {
        if (entry.update.sessionUpdate !== 'agent_message_chunk') return ''
        const content: unknown = entry.update.content
        return typeof content === 'object' &&
          content !== null &&
          'text' in content &&
          typeof content.text === 'string'
          ? content.text
          : ''
      })
      .join('')
  const running = (sessionId: string) =>
    updates.some(
      (entry) =>
        entry.sessionId === sessionId &&
        entry.update.sessionUpdate === 'state_update' &&
        entry.update.state === 'running',
    )
  return {
    harness,
    host,
    editor,
    updates,
    permissions,
    remove,
    idle,
    running,
    textOf,
  }
}

describe('toSessionUpdate', () => {
  it('maps reasoning and tool results, and skips child and unknown events', () => {
    expect(
      toSessionUpdate({
        type: EventType.REASONING_MESSAGE_CONTENT,
        messageId: 'r1',
        delta: 'thinking',
        timestamp: 1,
      }),
    ).toEqual({
      sessionUpdate: 'agent_thought_chunk',
      messageId: 'r1',
      content: { type: 'text', text: 'thinking' },
    })
    expect(
      toSessionUpdate({
        type: EventType.TOOL_CALL_RESULT,
        messageId: 'm',
        toolCallId: 'call_9',
        content: 'done',
        timestamp: 1,
      }),
    ).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_9',
      status: 'completed',
    })
    expect(
      toSessionUpdate({
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'from a child',
        subagentRunId: 'child-1',
        timestamp: 1,
      } as StreamChunk),
    ).toBeUndefined()
    expect(
      toSessionUpdate({
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: 1,
      }),
    ).toBeUndefined()
  })
})

describe('ACP agent handlers', () => {
  let close: (() => Promise<void>) | undefined
  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('keeps the tool from running when the editor rejects it', async () => {
    const { harness, host, editor, permissions, remove, idle, textOf } = setup()
    close = () => host.close()
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      const init = await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      expect(init.info.version).toBe('0.0.0')
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [
          { type: 'image', data: 'AA==', mimeType: 'image/png' },
          { type: 'text', text: 'remove a.txt' },
        ],
      })
      await vi.waitFor(() => expect(idle(sessionId)).toBeDefined())
      expect(idle(sessionId)).toMatchObject({ stopReason: 'end_turn' })
      expect(textOf(sessionId)).toBe('Kept a.txt.')
    })
    expect(remove).not.toHaveBeenCalled()
    expect(permissions).toEqual([
      { title: expect.any(String), toolCallId: 'call_1' },
    ])
  })

  it('resumes a session by id, cancels a running turn, and closes it', async () => {
    const { harness, host, editor, idle, running, textOf } = setup()
    close = () => host.close()
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      await ctx.request('session/resume', {
        sessionId: 'kept-session',
        cwd: '/tmp',
      })
      await ctx.request('session/prompt', {
        sessionId: 'kept-session',
        prompt: [{ type: 'text', text: 'hello' }],
      })
      await vi.waitFor(() => expect(idle('kept-session')).toBeDefined())
      expect(textOf('kept-session')).toBe('echo: hello')

      await ctx.request('session/prompt', {
        sessionId: 'slow-session',
        prompt: [{ type: 'text', text: 'wait' }],
      })
      await vi.waitFor(() => expect(running('slow-session')).toBe(true))
      await ctx.notify('session/cancel', { sessionId: 'slow-session' })
      await vi.waitFor(() => expect(idle('slow-session')).toBeDefined())
      expect(idle('slow-session')).toMatchObject({ stopReason: 'cancelled' })

      await ctx.request('session/close', { sessionId: 'kept-session' })
      // Closing an unknown session and cancelling one are both quiet.
      await ctx.request('session/close', { sessionId: 'never-opened' })
      await ctx.notify('session/cancel', { sessionId: 'never-opened' })
    })
  })
})

describe('serveAcp', () => {
  it('serves the agent over a stream', async () => {
    const { harness, host, editor, idle, textOf } = setup()
    const toClient = new TransformStream<Uint8Array, Uint8Array>()
    const toAgent = new TransformStream<Uint8Array, Uint8Array>()
    const connection = serveAcp({
      host,
      harness,
      version: '2.0.0',
      stream: ndJsonStream(toClient.writable, toAgent.readable),
    })
    await editor.connectWith(
      ndJsonStream(toAgent.writable, toClient.readable),
      async (ctx) => {
        const init = await ctx.request('initialize', {
          protocolVersion: 2,
          info: { name: 'editor', version: '1.0.0' },
        })
        expect(init.info).toEqual({
          name: 'test/acp-handlers',
          version: '2.0.0',
        })
        const { sessionId } = await ctx.request('session/new', {
          cwd: '/tmp',
          mcpServers: [],
        })
        await ctx.request('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: 'over a stream' }],
        })
        await vi.waitFor(() => expect(idle(sessionId)).toBeDefined())
        expect(textOf(sessionId)).toBe('echo: over a stream')
      },
    )
    connection.close()
    await host.close()
  })

  it('uses stdin and stdout when no stream is given', async () => {
    const { harness, host } = setup()
    const listeners = new Map<string, (data?: Uint8Array) => void>()
    const on = vi
      .spyOn(process.stdin, 'on')
      .mockImplementation((event: string | symbol, listener: any) => {
        listeners.set(String(event), listener)
        return process.stdin
      })
    const written: Array<string> = []
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation((chunk: any, callback?: any) => {
        written.push(Buffer.from(chunk).toString())
        if (typeof callback === 'function') callback()
        return true
      })
    try {
      const connection = serveAcp({ host, harness })
      await vi.waitFor(() => expect(listeners.has('data')).toBe(true))
      listeners.get('data')?.(
        new TextEncoder().encode(
          `${JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: 2,
              info: { name: 'editor', version: '1.0.0' },
            },
          })}\n`,
        ),
      )
      await vi.waitFor(() =>
        expect(written.join('')).toContain('test/acp-handlers'),
      )
      listeners.get('end')?.()
      connection.close()
    } finally {
      on.mockRestore()
      write.mockRestore()
      await host.close()
    }
  })
})
