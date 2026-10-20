import { afterEach, describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { client, ndJsonStream } from '@agentclientprotocol/sdk/experimental/v2'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  membersOnly,
} from '@tanstack/ai-harness'
import { createAcpAgent, serveAcp, toSessionUpdate } from '../src/agent'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { HarnessAccess, HostLifecycleOptions } from '@tanstack/ai-harness'
import type {
  ClientApp,
  RequestPermissionOutcome,
  SessionUpdate,
} from '@agentclientprotocol/sdk/experimental/v2'

const now = () => Date.now()

/**
 * A model that answers from the last user message: `wait` waits until the
 * turn is cancelled, `remove` calls the remove tool, `pick` calls the pick
 * client tool, anything else echoes. After the tool of `remove slowly`, it
 * waits until the turn is cancelled too.
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
        const last: ModelMessage | undefined = options.messages.at(-1)
        // A prompt with an image comes as parts: read its text parts.
        const said =
          typeof last?.content === 'string'
            ? last.content
            : (last?.content ?? [])
                .map((part) => (part.type === 'text' ? part.content : ''))
                .join('')
        yield {
          type: EventType.RUN_STARTED,
          runId: 'r',
          threadId: 't',
          timestamp: now(),
        }
        const asked: ModelMessage | undefined = options.messages.findLast(
          (message: ModelMessage) => message.role === 'user',
        )
        const isSlow =
          last?.role === 'tool' && asked?.content === 'remove a.txt slowly'
        if (said === 'wait' || isSlow) {
          const signal: AbortSignal | undefined =
            options.abortController?.signal ?? options.request?.signal
          await new Promise<void>((resolve) => {
            if (!signal || signal.aborted) return resolve()
            signal.addEventListener('abort', () => resolve(), { once: true })
          })
          return
        }
        const tool = said.startsWith('remove')
          ? 'remove'
          : said === 'pick'
            ? 'pick'
            : undefined
        if (tool && last?.role === 'user') {
          yield {
            type: EventType.TOOL_CALL_START,
            toolCallId: 'call_1',
            toolCallName: tool,
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

/** With `access`, the host checks each action of each user. */
function setup({
  access,
  lifecycle,
}: { access?: HarnessAccess; lifecycle?: HostLifecycleOptions } = {}) {
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
      // No server function: the client runs it, and an editor cannot.
      toolDefinition({
        name: 'pick',
        description: 'Pick a file in the editor',
        inputSchema: { type: 'object', properties: {} },
      }),
    ],
  })
  const persistence = memoryPersistence()
  const host = createHarnessHost({ persistence, access, lifecycle })
  const updates: Array<{ sessionId: string; update: SessionUpdate }> = []
  const permissions: Array<{ title: string; toolCallId: string }> = []
  // The answer of the editor to each permission request. Default: Reject.
  const editorState: { answer: () => Promise<RequestPermissionOutcome> } = {
    answer: async () => ({ outcome: 'selected', optionId: 'reject' }),
  }
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
      return editorState.answer().then((outcome) => ({ outcome }))
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
  /** The states of a session, in order, with the stop reason of an idle. */
  const states = (sessionId: string) =>
    updates.flatMap(({ sessionId: id, update }) =>
      id === sessionId && update.sessionUpdate === 'state_update'
        ? [
            update.state === 'idle' && 'stopReason' in update
              ? `idle:${String(update.stopReason)}`
              : update.state,
          ]
        : [],
    )
  const running = (sessionId: string) =>
    updates.some(
      (entry) =>
        entry.sessionId === sessionId &&
        entry.update.sessionUpdate === 'state_update' &&
        entry.update.state === 'running',
    )
  return {
    harness,
    persistence,
    host,
    editor,
    updates,
    permissions,
    editorState,
    remove,
    idle,
    states,
    running,
    textOf,
  }
}

describe('toSessionUpdate', () => {
  it('starts a tool call, then sends its collected arguments as rawInput', () => {
    const args = new Map<string, string>()
    const at = (chunk: StreamChunk) => toSessionUpdate(chunk, args)
    expect(
      at({
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call_1',
        toolCallName: 'remove',
        timestamp: 1,
      }),
    ).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      name: 'remove',
      title: 'remove',
      status: 'in_progress',
    })
    expect(
      at({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call_1',
        delta: '{"path":',
        timestamp: 1,
      }),
    ).toBeUndefined()
    expect(
      at({
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: 'call_1',
        delta: '"a.txt"}',
        timestamp: 1,
      }),
    ).toBeUndefined()
    expect(
      at({ type: EventType.TOOL_CALL_END, toolCallId: 'call_1', timestamp: 1 }),
    ).toEqual({
      sessionUpdate: 'tool_call_update',
      toolCallId: 'call_1',
      status: 'in_progress',
      rawInput: { path: 'a.txt' },
    })
    expect(args.size).toBe(0)
  })

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

  it('holds no handle on an idle session, and opens it again at the next prompt', async () => {
    // A session that no handle holds closes at once when it is idle.
    const { harness, host, editor, running, states, textOf } = setup({
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    close = () => host.close()
    const isOpen = (threadId: string) => host.isOpen(harness, { threadId })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await vi.waitFor(() => expect(isOpen(sessionId)).toBe(false))

      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'wait' }],
      })
      await vi.waitFor(() => expect(running(sessionId)).toBe(true))
      // A running prompt holds the session.
      expect(isOpen(sessionId)).toBe(true)
      await ctx.notify('session/cancel', { sessionId })
      await vi.waitFor(() => expect(isOpen(sessionId)).toBe(false))

      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      })
      await vi.waitFor(() =>
        expect(states(sessionId)).toContain('idle:end_turn'),
      )
      // The session opened again and ran the prompt.
      expect(textOf(sessionId)).toBe('echo: hello')
      await vi.waitFor(() => expect(isOpen(sessionId)).toBe(false))
    })
  })

  it('takes the prompts of its new sessions on a host with no session index', async () => {
    const { harness, editor, states, textOf } = setup()
    // Only a log store: `host.sessions.get` finds no session.
    const host = createHarnessHost({
      persistence: { stores: { log: memoryPersistence().stores.log } },
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    close = () => host.close()
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await vi.waitFor(() =>
        expect(host.isOpen(harness, { threadId: sessionId })).toBe(false),
      )

      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      })
      await vi.waitFor(() =>
        expect(states(sessionId)).toContain('idle:end_turn'),
      )
      expect(textOf(sessionId)).toBe('echo: hello')
    })
  })

  it('keeps the order of two prompts when the first one uploads a file', async () => {
    const { harness, host, persistence, editor, updates, states, textOf } =
      setup()
    close = () => host.close()
    // The store of the first file answers only when the test lets it.
    let upload = () => {}
    const uploaded = new Promise<void>((resolve) => {
      upload = resolve
    })
    const put = persistence.stores.blobs.put.bind(persistence.stores.blobs)
    const slowPut = vi
      .spyOn(persistence.stores.blobs, 'put')
      .mockImplementation(async (...args) => {
        await uploaded
        return put(...args)
      })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      const first = ctx.request('session/prompt', {
        sessionId,
        prompt: [
          { type: 'text', text: 'first' },
          { type: 'image', data: 'AQIDBA==', mimeType: 'image/png' },
        ],
      })
      await vi.waitFor(() => expect(slowPut).toHaveBeenCalled())
      const second = ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'second' }],
      })
      // The second prompt has no file, so the agent takes it at once.
      await vi.waitFor(() =>
        expect(
          updates.filter(
            (entry) => entry.update.sessionUpdate === 'user_message',
          ),
        ).toHaveLength(1),
      )
      upload()
      await Promise.all([first, second])
      await vi.waitFor(() =>
        expect(
          states(sessionId).filter((state) => state === 'idle:end_turn'),
        ).toHaveLength(2),
      )
      expect(textOf(sessionId)).toBe('echo: firstecho: second')
    })
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

  it('lists the sessions of the harness, a page at a time', async () => {
    const { harness, host, editor } = setup()
    close = () => host.close()
    const other = defineHarness({ name: 'test/other', adapter: model() })
    await host.open(other, { threadId: 'other-thread' })
    for (let index = 0; index < 50; index++) {
      await host.open(harness, { threadId: `old-${index}` })
    }
    await editor.connectWith(
      createAcpAgent({ host, harness, cwd: '/work' }),
      async (ctx) => {
        await ctx.request('initialize', {
          protocolVersion: 2,
          info: { name: 'editor', version: '1.0.0' },
        })
        const { sessionId } = await ctx.request('session/new', {
          cwd: '/work',
          mcpServers: [],
        })
        await host.sessions.rename({
          threadId: sessionId,
          title: 'Fix the build',
        })

        const first = await ctx.request('session/list', {})
        expect(first.sessions).toHaveLength(50)
        expect(first.nextCursor).toEqual(expect.any(String))
        const second = await ctx.request('session/list', {
          cursor: first.nextCursor,
        })
        expect(second.nextCursor ?? undefined).toBeUndefined()
        const sessions = [...first.sessions, ...second.sessions]
        const ids = sessions.map((session) => session.sessionId)
        expect(ids).toHaveLength(51)
        expect(ids).not.toContain('other-thread')
        expect(
          sessions.find((session) => session.sessionId === sessionId),
        ).toEqual({
          sessionId,
          cwd: '/work',
          title: 'Fix the build',
          updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        })

        const elsewhere = await ctx.request('session/list', {
          cwd: '/somewhere/else',
        })
        expect(elsewhere.sessions).toEqual([])
      },
    )
  })

  it('stops the turn when the editor cancels an approval', async () => {
    const { harness, host, editor, editorState, remove, states, textOf } =
      setup()
    close = () => host.close()
    editorState.answer = async () => ({ outcome: 'cancelled' })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'remove a.txt' }],
      })
      await vi.waitFor(() =>
        expect(states(sessionId)).toContain('idle:cancelled'),
      )
      expect(states(sessionId)).toEqual([
        'running',
        'requires_action',
        'idle:cancelled',
      ])
      // The next prompt cancels the open approval first, then runs.
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      })
      await vi.waitFor(() =>
        expect(states(sessionId)).toContain('idle:end_turn'),
      )
      expect(textOf(sessionId)).toBe('echo: hello')
    })
    expect(remove).not.toHaveBeenCalled()
  })

  it('cancels an interrupt that the editor cannot answer, and goes on', async () => {
    const { harness, host, editor, idle, permissions, textOf } = setup()
    close = () => host.close()
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'pick' }],
      })
      await vi.waitFor(() => expect(idle(sessionId)).toBeDefined())
      expect(idle(sessionId)).toMatchObject({ stopReason: 'end_turn' })
      expect(textOf(sessionId)).toBe('Kept a.txt.')
    })
    expect(permissions).toEqual([])
  })

  it('echoes the user message with the id of the prompt response', async () => {
    const { harness, host, editor, updates } = setup()
    close = () => host.close()
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      const prompt = [{ type: 'text' as const, text: 'hello' }]
      const { messageId } = await ctx.request('session/prompt', {
        sessionId,
        prompt,
      })
      expect(updates).toContainEqual({
        sessionId,
        update: { sessionUpdate: 'user_message', messageId, content: prompt },
      })
    })
  })

  it('reports a queued prompt after the turn before it', async () => {
    const { harness, host, editor, running, states, textOf } = setup()
    close = () => host.close()
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'wait' }],
      })
      await vi.waitFor(() => expect(running(sessionId)).toBe(true))
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      })
      await ctx.notify('session/cancel', { sessionId })
      await vi.waitFor(() =>
        expect(states(sessionId)).toContain('idle:end_turn'),
      )
      expect(states(sessionId)).toEqual([
        'running',
        'idle:cancelled',
        'running',
        'idle:end_turn',
      ])
      expect(textOf(sessionId)).toBe('echo: hello')
    })
  })

  it('runs a prompt sent during an approval after that approval', async () => {
    const {
      harness,
      host,
      editor,
      editorState,
      permissions,
      remove,
      states,
      textOf,
    } = setup()
    close = () => host.close()
    let allow = () => {}
    editorState.answer = () =>
      new Promise((resolve) => {
        allow = () => resolve({ outcome: 'selected', optionId: 'allow' })
      })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'remove a.txt' }],
      })
      await vi.waitFor(() => expect(permissions).toHaveLength(1))
      // The editor still asks when the next prompt comes.
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      })
      allow()
      await vi.waitFor(() =>
        expect(
          states(sessionId).filter((state) => state === 'idle:end_turn'),
        ).toHaveLength(2),
      )
      expect(states(sessionId)).toEqual([
        'running',
        'requires_action',
        'running',
        'idle:end_turn',
        'running',
        'idle:end_turn',
      ])
      expect(textOf(sessionId)).toBe('Kept a.txt.echo: hello')
    })
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('stops a prompt when the editor cancels the turn that closes an approval', async () => {
    const { harness, host, editor, editorState, states, textOf } = setup()
    close = () => host.close()
    editorState.answer = async () => ({ outcome: 'cancelled' })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'remove a.txt slowly' }],
      })
      await vi.waitFor(() =>
        expect(states(sessionId)).toContain('idle:cancelled'),
      )
      // This prompt first closes the approval. That turn waits, and the
      // editor cancels it.
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'hello' }],
      })
      const session = await host.open(harness, { threadId: sessionId })
      await vi.waitFor(() => expect(session.snapshot().status).toBe('running'))
      await ctx.notify('session/cancel', { sessionId })
      await vi.waitFor(() =>
        expect(
          states(sessionId).filter((state) => state === 'idle:cancelled'),
        ).toHaveLength(2),
      )
      expect(states(sessionId)).toEqual([
        'running',
        'requires_action',
        'idle:cancelled',
        'running',
        'idle:cancelled',
      ])
      expect(textOf(sessionId)).toBe('')
    })
  })

  it('fails the turn when the session refuses the approval answers', async () => {
    const { harness, host, editor, editorState, idle } = setup()
    close = () => host.close()
    editorState.answer = async () => ({
      outcome: 'selected',
      optionId: 'allow',
    })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      const session = await host.open(harness, { threadId: sessionId })
      vi.spyOn(session, 'resolve').mockResolvedValue({
        inputId: 'input-1',
        status: 'rejected',
        reason: 'busy',
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'remove a.txt' }],
      })
      await vi.waitFor(() => expect(idle(sessionId)).toBeDefined())
      expect(idle(sessionId)).toMatchObject({
        stopReason: 'error',
        error: { message: 'A chat turn is already running.' },
      })
    })
  })

  it('refuses an unknown session and data that is not base64', async () => {
    const { harness, host, editor } = setup()
    close = () => host.close()
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      await expect(
        ctx.request('session/resume', { sessionId: 'never-made', cwd: '/tmp' }),
      ).rejects.toMatchObject({ code: -32002 })
      await expect(
        ctx.request('session/prompt', {
          sessionId: 'never-made',
          prompt: [{ type: 'text', text: 'hello' }],
        }),
      ).rejects.toMatchObject({ code: -32002 })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await expect(
        ctx.request('session/prompt', {
          sessionId,
          prompt: [
            { type: 'image', data: 'not base64!', mimeType: 'image/png' },
          ],
        }),
      ).rejects.toMatchObject({ code: -32602 })
    })
  })

  it('refuses a subagent child: the editor reaches it through its parent', async () => {
    const { harness, persistence, host, editor } = setup()
    close = () => host.close()
    await persistence.stores.sessions.upsert({
      threadId: 'subagent:run-1',
      parentThreadId: 'lead',
      harness: harness.name,
      members: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })
      await expect(
        ctx.request('session/resume', {
          sessionId: 'subagent:run-1',
          cwd: '/tmp',
        }),
      ).rejects.toMatchObject({ code: -32002 })
    })
  })

  it('resumes a session by id, cancels a running turn, and closes it', async () => {
    const { harness, host, editor, idle, running, textOf } = setup()
    close = () => host.close()
    // Sessions from before: the session index knows them.
    await host.open(harness, { threadId: 'kept-session' })
    await host.open(harness, { threadId: 'slow-session' })
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

  it('resumes a session without opening it: it opens at its first prompt', async () => {
    const { harness, host, editor, idle, textOf } = setup({
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    close = () => host.close()
    await (await host.open(harness, { threadId: 'kept-session' })).close()
    const isOpen = () => host.isOpen(harness, { threadId: 'kept-session' })
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor', version: '1.0.0' },
      })

      await ctx.request('session/resume', {
        sessionId: 'kept-session',
        cwd: '/tmp',
      })
      expect(isOpen()).toBe(false)

      await ctx.request('session/prompt', {
        sessionId: 'kept-session',
        prompt: [{ type: 'text', text: 'hello' }],
      })
      await vi.waitFor(() => expect(idle('kept-session')).toBeDefined())
      expect(textOf('kept-session')).toBe('echo: hello')
    })
  })

  describe('on a host with access', () => {
    const olga = { id: 'olga', tenantId: 'acme' }
    const bea = { id: 'bea', tenantId: 'acme' }
    // The agent runs for one local user, so no request is identified.
    const access: HarnessAccess = {
      getUser: () => null,
      rules: membersOnly(),
    }

    it('throws at the start without a user', () => {
      const { harness, host } = setup({ access })
      close = () => host.close()

      expect(() => createAcpAgent({ host, harness })).toThrow(
        'createAcpAgent needs a user: the host has access. Pass the local user as the user option.',
      )
    })

    it('opens and lists only the sessions of its user', async () => {
      const { harness, host, editor, idle, textOf } = setup({ access })
      close = () => host.close()
      await host.open(harness, { threadId: 'bea-thread', user: bea })
      const agentApp = createAcpAgent({ host, harness, user: olga })
      await editor.connectWith(agentApp, async (ctx) => {
        await ctx.request('initialize', {
          protocolVersion: 2,
          info: { name: 'editor', version: '1.0.0' },
        })
        const { sessionId } = await ctx.request('session/new', {
          cwd: '/tmp',
          mcpServers: [],
        })
        await ctx.request('session/prompt', {
          sessionId,
          prompt: [{ type: 'text', text: 'hello' }],
        })
        await vi.waitFor(() => expect(idle(sessionId)).toBeDefined())

        expect(textOf(sessionId)).toBe('echo: hello')
        expect(
          await host.sessions.get({ threadId: sessionId, user: olga }),
        ).toMatchObject({ members: [{ userId: 'olga', role: 'owner' }] })
        const listed = await ctx.request('session/list', {})
        expect(listed.sessions.map((session) => session.sessionId)).toEqual([
          sessionId,
        ])
        // A session of another user gets the answer of an unknown id.
        await expect(
          ctx.request('session/resume', {
            sessionId: 'bea-thread',
            cwd: '/tmp',
          }),
        ).rejects.toMatchObject({ code: -32002 })
      })
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
