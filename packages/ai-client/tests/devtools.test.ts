import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { aiEventClient } from '@tanstack/ai-event-client'
import { z } from 'zod'
import { ChatClient } from '../src/chat-client'
import {
  createMockConnectionAdapter,
  createTextChunks,
  createToolCallChunks,
} from './test-utils'
import type { AnyClientTool, StreamChunk } from '@tanstack/ai'
import type {
  ConnectConnectionAdapter,
  RunAgentInputContext,
} from '../src/connection-adapters'
import type { AIDevtoolsToolFixture } from '../src/devtools'
import type { MessagePart, UIMessage } from '../src/types'

interface DevtoolsEvent<TPayload = unknown> {
  type: string
  payload: TPayload
  pluginId?: string
}

type DevtoolsEventCallback = (event: DevtoolsEvent) => void

const eventClientMock = vi.hoisted(() => {
  const listeners = new Map<string, Array<DevtoolsEventCallback>>()
  const unsubscribe = vi.fn()

  return {
    emit: vi.fn(),
    emitAIDevtoolsEvent: vi.fn((eventName: string, payload: unknown) => {
      eventClientMock.emit(eventName, payload)
    }),
    unsubscribe,
    on: vi.fn((eventName: string, callback: DevtoolsEventCallback) => {
      const currentListeners = listeners.get(eventName) ?? []
      currentListeners.push(callback)
      listeners.set(eventName, currentListeners)

      return () => {
        unsubscribe()
        const nextListeners = (listeners.get(eventName) ?? []).filter(
          (listener) => listener !== callback,
        )
        listeners.set(eventName, nextListeners)
      }
    }),
    dispatch(eventName: string, payload: unknown) {
      for (const listener of listeners.get(eventName) ?? []) {
        listener({
          type: `tanstack-ai-devtools:${eventName}`,
          payload,
          pluginId: 'tanstack-ai-devtools',
        })
      }
    },
    emitted(eventName: string) {
      return eventClientMock.emit.mock.calls.filter(
        ([name]) => name === eventName,
      )
    },
    reset() {
      listeners.clear()
      unsubscribe.mockClear()
      eventClientMock.emitAIDevtoolsEvent.mockClear()
    },
  }
})

vi.mock('@tanstack/ai-event-client', () => ({
  aiEventClient: {
    emit: eventClientMock.emit,
    on: eventClientMock.on,
  },
  emitAIDevtoolsEvent: eventClientMock.emitAIDevtoolsEvent,
  createAIDevtoolsEventEnvelope: (input: {
    eventType: string
    timestamp: number
  }) => ({
    ...input,
    eventId: `event:${input.eventType}:${input.timestamp}`,
  }),
}))

describe('ChatClient devtools bridge', () => {
  const userMessage: UIMessage = {
    id: 'msg-user',
    role: 'user',
    parts: [{ type: 'text', content: 'Hello' }],
  }

  const assistantMessage: UIMessage = {
    id: 'msg-assistant',
    role: 'assistant',
    parts: [{ type: 'text', content: 'Hi' }],
  }

  beforeEach(() => {
    vi.clearAllMocks()
    eventClientMock.reset()
  })

  function createClient(options?: {
    id?: string
    threadId?: string
    connection?: ConnectConnectionAdapter
    tools?: ReadonlyArray<AnyClientTool>
    initialMessages?: Array<UIMessage>
    mountDevtools?: boolean
    devtoolsName?: string
  }) {
    const client = new ChatClient({
      id: options?.id ?? 'chat-1',
      threadId: options?.threadId ?? 'thread-1',
      connection: options?.connection ?? createMockConnectionAdapter(),
      ...(options?.tools ? { tools: options.tools } : {}),
      ...(options?.initialMessages
        ? { initialMessages: options.initialMessages }
        : {}),
      devtools: {
        ...(options?.devtoolsName ? { name: options.devtoolsName } : {}),
        framework: 'react',
        hookName: 'useChat',
      },
    })
    if (options?.mountDevtools ?? true) {
      client.mountDevtools()
    }
    return client
  }

  function createRunTrackingAdapter(
    chunkSets: Array<Array<StreamChunk>>,
    runContexts: Array<RunAgentInputContext>,
  ): ConnectConnectionAdapter {
    let connectCount = 0
    return {
      async *connect(_messages, _data, abortSignal, runContext) {
        if (runContext) {
          runContexts.push(runContext)
        }
        const chunks = chunkSets[connectCount] ?? []
        connectCount++
        for (const chunk of chunks) {
          if (abortSignal?.aborted) {
            return
          }
          yield chunk
        }
      },
    }
  }

  function textContentChunk(args: {
    messageId: string
    delta: string
    content: string
  }) {
    return {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: args.messageId,
      timestamp: Date.now(),
      delta: args.delta,
      content: args.content,
    } satisfies StreamChunk
  }

  function dispatchToolFixture(overrides: Partial<AIDevtoolsToolFixture> = {}) {
    const fixture: AIDevtoolsToolFixture = {
      hookId: 'chat-1',
      threadId: 'thread-1',
      runId: 'run-fixture',
      toolName: 'weather',
      input: { city: 'Paris' },
      output: { temperature: 21 },
      toolCallId: 'fixture-call',
      messageId: 'fixture-message',
      ...overrides,
    }

    eventClientMock.dispatch('devtools:tool-fixture:apply', fixture)
    return fixture
  }

  function latestSnapshotMessages(): Array<UIMessage> {
    const latestSnapshot = eventClientMock
      .emitted('hook:state-snapshot')
      .at(-1)?.[1] as { state?: { messages?: Array<UIMessage> } } | undefined
    return latestSnapshot?.state?.messages ?? []
  }

  function findToolCallPart(messages: Array<UIMessage>, toolCallId: string) {
    return messages
      .flatMap((message) => message.parts)
      .find(
        (part): part is Extract<MessagePart, { type: 'tool-call' }> =>
          part.type === 'tool-call' && part.id === toolCallId,
      )
  }

  function findStructuredOutputPart(
    messages: Array<UIMessage>,
    messageId: string,
  ) {
    return messages
      .find((message) => message.id === messageId)
      ?.parts.find(
        (part): part is Extract<MessagePart, { type: 'structured-output' }> =>
          part.type === 'structured-output',
      )
  }

  function runStartedChunk(args: { threadId: string; runId: string }) {
    return {
      type: EventType.RUN_STARTED,
      threadId: args.threadId,
      runId: args.runId,
      timestamp: Date.now(),
    } satisfies StreamChunk
  }

  function runFinishedChunk(args: { threadId: string; runId: string }) {
    return {
      type: EventType.RUN_FINISHED,
      threadId: args.threadId,
      runId: args.runId,
      timestamp: Date.now(),
      finishReason: 'stop',
    } satisfies StreamChunk
  }

  async function waitForCondition(assertion: () => boolean) {
    for (let attempt = 0; attempt < 50; attempt++) {
      if (assertion()) {
        return
      }
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    throw new Error('Timed out waiting for condition')
  }

  it('does not emit hook lifecycle events before devtools is mounted', () => {
    const client = createClient({ mountDevtools: false })

    expect(eventClientMock.emitted('hook:registered')).toEqual([])
    expect(eventClientMock.emitted('hook:state-snapshot')).toEqual([])

    client.dispose()

    expect(eventClientMock.emitted('hook:unregistered')).toEqual([])
  })

  it('can register again after a mount cleanup cycle', () => {
    const client = createClient({ mountDevtools: false })

    client.mountDevtools()
    client.dispose()
    vi.clearAllMocks()

    client.mountDevtools()

    expect(eventClientMock.emitted('hook:registered')).toEqual([
      [
        'hook:registered',
        expect.objectContaining({
          hookId: 'chat-1',
          lifecycle: 'mounted',
        }),
      ],
    ])

    client.dispose()
  })

  it('registers the chat hook and emits the initial state snapshot', () => {
    const client = createClient()

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:registered',
      expect.objectContaining({
        eventId: expect.any(String),
        eventType: 'hook:registered',
        timestamp: expect.any(Number),
        source: 'client',
        visibility: 'client-state',
        hookId: 'chat-1',
        clientId: 'chat-1',
        threadId: 'thread-1',
        hookName: 'useChat',
        framework: 'react',
        outputKind: 'chat',
        lifecycle: 'mounted',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        eventId: expect.any(String),
        eventType: 'hook:state-snapshot',
        source: 'client',
        visibility: 'client-state',
        hookId: 'chat-1',
        clientId: 'chat-1',
        threadId: 'thread-1',
        hookName: 'useChat',
        framework: 'react',
        outputKind: 'chat',
        state: expect.objectContaining({
          messages: [],
          status: 'ready',
          isLoading: false,
          activeRunIds: [],
        }),
      }),
    )

    client.dispose()
  })

  it('emits the configured devtools display name', () => {
    const client = createClient({ devtoolsName: 'Recipe Assistant' })

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:registered',
      expect.objectContaining({
        hookId: 'chat-1',
        hookName: 'useChat',
        displayName: 'Recipe Assistant',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'chat-1',
        hookName: 'useChat',
        displayName: 'Recipe Assistant',
      }),
    )

    client.dispose()
  })

  it('registers client tool metadata for devtools discovery', () => {
    const weather = toolDefinition({
      name: 'weather',
      description: 'Lookup weather',
      needsApproval: true,
      metadata: { fixture: true },
      inputSchema: z.object({ city: z.string() }),
      outputSchema: z.object({ temperature: z.number() }),
    }).client()

    const client = createClient({ tools: [weather] })

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'tools:registered',
      expect.objectContaining({
        hookId: 'chat-1',
        hookName: 'useChat',
        framework: 'react',
        outputKind: 'chat',
        tools: [
          expect.objectContaining({
            name: 'weather',
            description: 'Lookup weather',
            inputSchema: expect.objectContaining({ type: 'object' }),
            outputSchema: expect.objectContaining({ type: 'object' }),
            needsApproval: true,
            metadata: { fixture: true },
          }),
        ],
      }),
    )

    client.dispose()
  })

  it('responds to devtools state requests for its hook', () => {
    const client = createClient()
    vi.clearAllMocks()

    eventClientMock.dispatch('devtools:request-state', {
      targetHookId: 'chat-1',
    })

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:registered',
      expect.objectContaining({
        hookId: 'chat-1',
        clientId: 'chat-1',
        threadId: 'thread-1',
        hookName: 'useChat',
        outputKind: 'chat',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'tools:registered',
      expect.objectContaining({
        hookId: 'chat-1',
        tools: [],
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'chat-1',
        clientId: 'chat-1',
        threadId: 'thread-1',
        state: expect.objectContaining({
          messages: [],
          status: 'ready',
          isLoading: false,
          activeRunIds: [],
        }),
      }),
    )

    client.dispose()
  })

  it('uses the resilient devtools emitter for hook registration sync', () => {
    const client = createClient()

    expect(eventClientMock.emitAIDevtoolsEvent).toHaveBeenCalledWith(
      'hook:registered',
      expect.objectContaining({
        hookId: 'chat-1',
        threadId: 'thread-1',
        hookName: 'useChat',
        lifecycle: 'mounted',
      }),
    )

    eventClientMock.emitAIDevtoolsEvent.mockClear()
    eventClientMock.dispatch('devtools:request-state', {
      targetHookId: 'chat-1',
    })

    expect(eventClientMock.emitAIDevtoolsEvent).toHaveBeenCalledWith(
      'hook:registered',
      expect.objectContaining({
        hookId: 'chat-1',
        threadId: 'thread-1',
        hookName: 'useChat',
        lifecycle: 'mounted',
      }),
    )
    expect(eventClientMock.emitAIDevtoolsEvent).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        hookId: 'chat-1',
        threadId: 'thread-1',
        state: expect.objectContaining({
          messages: [],
        }),
      }),
    )

    client.dispose()
  })

  it('does not respond to devtools state requests for another hook', () => {
    const client = createClient()
    vi.clearAllMocks()

    eventClientMock.dispatch('devtools:request-state', {
      targetHookId: 'other-hook',
    })

    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'hook:registered',
      expect.anything(),
    )
    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.anything(),
    )

    client.dispose()
  })

  it('applies a devtools tool fixture as a normal assistant message', async () => {
    const client = createClient()
    vi.clearAllMocks()

    const fixture = dispatchToolFixture()

    await waitForCondition(() => client.getMessages().length === 1)
    const messages = client.getMessages()

    expect(messages).toEqual([
      expect.objectContaining({
        id: 'fixture-message',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'fixture-call',
            name: 'weather',
            arguments: '{"city":"Paris"}',
            input: { city: 'Paris' },
            state: 'input-complete',
            output: { temperature: 21 },
          },
          {
            type: 'tool-result',
            toolCallId: 'fixture-call',
            content: '{"temperature":21}',
            state: 'complete',
          },
        ],
        createdAt: expect.any(Date),
      }),
    ])
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'devtools:tool-fixture:applied',
      expect.objectContaining({
        hookId: 'chat-1',
        threadId: 'thread-1',
        runId: 'run-fixture',
        toolName: fixture.toolName,
        input: fixture.input,
        output: fixture.output,
        messageId: 'fixture-message',
        toolCallId: 'fixture-call',
        visibility: 'user-visible',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'text:message:created',
      expect.objectContaining({
        hookId: 'chat-1',
        threadId: 'thread-1',
        runId: 'run-fixture',
        toolCallId: 'fixture-call',
        messageId: 'fixture-message',
        role: 'assistant',
        parts: messages[0]?.parts,
        visibility: 'user-visible',
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        state: expect.objectContaining({
          messages,
        }),
      }),
    )

    client.dispose()
  })

  it('generates fresh ids when replaying a fixture from an existing tool call', async () => {
    const existingMessage: UIMessage = {
      id: 'fixture-message',
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: 'fixture-call',
          name: 'weather',
          arguments: '{"city":"Paris"}',
          input: { city: 'Paris' },
          state: 'input-complete',
          output: { temperature: 21 },
        },
        {
          type: 'tool-result',
          toolCallId: 'fixture-call',
          content: '{"temperature":21}',
          state: 'complete',
        },
      ],
    }
    const client = createClient({ initialMessages: [existingMessage] })
    vi.clearAllMocks()

    dispatchToolFixture()

    await waitForCondition(() => client.getMessages().length === 2)
    const replayedMessage = client.getMessages()[1]
    const replayedToolCall = replayedMessage?.parts?.[0]
    const replayedToolResult = replayedMessage?.parts?.[1]

    expect(replayedMessage?.id).not.toBe('fixture-message')
    expect(replayedToolCall).toEqual(
      expect.objectContaining({
        type: 'tool-call',
        name: 'weather',
        input: { city: 'Paris' },
      }),
    )
    expect(replayedToolCall).toEqual(
      expect.objectContaining({
        id: expect.not.stringMatching(/^fixture-call$/),
      }),
    )
    expect(replayedToolResult).toEqual(
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: (replayedToolCall as { id: string }).id,
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'text:message:created',
      expect.objectContaining({
        messageId: replayedMessage?.id,
        toolCallId: (replayedToolCall as { id: string }).id,
      }),
    )

    client.dispose()
  })

  it('replays the full source message when a fixture includes one', async () => {
    const existingMessage: UIMessage = {
      id: 'source-message',
      role: 'assistant',
      parts: [
        { type: 'thinking', content: 'Need to inspect the catalog.' },
        {
          type: 'tool-call',
          id: 'source-tool-call',
          name: 'weather',
          arguments: '{"city":"Paris"}',
          input: { city: 'Paris' },
          state: 'input-complete',
        },
        {
          type: 'tool-result',
          toolCallId: 'source-tool-call',
          content: '{"temperature":21}',
          state: 'complete',
        },
        { type: 'text', content: 'Paris is mild today.' },
      ],
    }
    const client = createClient({ initialMessages: [existingMessage] })
    vi.clearAllMocks()

    dispatchToolFixture({
      messageId: existingMessage.id,
      toolCallId: 'source-tool-call',
      message: {
        id: existingMessage.id,
        role: existingMessage.role,
        parts: existingMessage.parts,
      },
    })

    await waitForCondition(() => client.getMessages().length === 2)
    const replayedMessage = client.getMessages()[1]
    const replayedToolCall = replayedMessage?.parts.find(
      (part) => part.type === 'tool-call',
    )
    const replayedToolResult = replayedMessage?.parts.find(
      (part) => part.type === 'tool-result',
    )

    expect(replayedMessage?.id).not.toBe(existingMessage.id)
    expect(replayedMessage?.role).toBe(existingMessage.role)
    expect(replayedMessage?.parts).toEqual([
      { type: 'thinking', content: 'Need to inspect the catalog.' },
      expect.objectContaining({
        type: 'tool-call',
        id: expect.not.stringMatching(/^source-tool-call$/),
        name: 'weather',
        input: { city: 'Paris' },
        output: { temperature: 21 },
      }),
      expect.objectContaining({
        type: 'tool-result',
        toolCallId: (replayedToolCall as { id: string }).id,
        content: '{"temperature":21}',
      }),
      { type: 'text', content: 'Paris is mild today.' },
    ])
    expect(replayedToolResult).toEqual(
      expect.objectContaining({
        toolCallId: (replayedToolCall as { id: string }).id,
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'text:message:created',
      expect.objectContaining({
        messageId: replayedMessage?.id,
        toolCallId: (replayedToolCall as { id: string }).id,
        parts: replayedMessage?.parts,
      }),
    )

    client.dispose()
  })

  it('executes the registered client tool when firing a fixture', async () => {
    const execute = vi.fn((input: { city: string }) => ({
      city: input.city,
      temperature: 23,
    }))
    const weatherTool = toolDefinition({
      name: 'weather',
      description: 'Get the weather for a city',
      inputSchema: z.object({ city: z.string() }),
      outputSchema: z.object({
        city: z.string(),
        temperature: z.number(),
      }),
    }).client(execute)
    const client = createClient({ tools: [weatherTool] })
    vi.clearAllMocks()

    dispatchToolFixture({
      input: { city: 'Berlin' },
      output: null,
      execute: true,
    })

    await waitForCondition(
      () =>
        client
          .getMessages()[0]
          ?.parts.some(
            (part) =>
              part.type === 'tool-call' &&
              part.name === 'weather' &&
              part.output !== undefined,
          ) ?? false,
    )

    const message = client.getMessages()[0]
    const toolCall = message?.parts.find((part) => part.type === 'tool-call')
    const toolResult = message?.parts.find(
      (part) => part.type === 'tool-result',
    )

    expect(execute).toHaveBeenCalledWith({ city: 'Berlin' })
    expect(toolCall).toEqual(
      expect.objectContaining({
        type: 'tool-call',
        name: 'weather',
        input: { city: 'Berlin' },
        output: { city: 'Berlin', temperature: 23 },
      }),
    )
    expect(toolResult).toEqual(
      expect.objectContaining({
        type: 'tool-result',
        content: '{"city":"Berlin","temperature":23}',
      }),
    )

    client.dispose()
  })

  it('routes hook-scoped fixture events to the latest bridge for a hook id', async () => {
    const staleClient = createClient({ threadId: 'thread-stale' })
    const activeClient = createClient({ threadId: 'thread-active' })
    vi.clearAllMocks()

    eventClientMock.dispatch('devtools:tool-fixture:apply', {
      hookId: 'chat-1',
      threadId: 'thread-stale',
      toolName: 'weather',
      input: { city: 'Paris' },
      output: { temperature: 21 },
      toolCallId: 'fixture-call',
      messageId: 'fixture-message',
    } satisfies AIDevtoolsToolFixture)

    await waitForCondition(() => activeClient.getMessages().length === 1)

    expect(staleClient.getMessages()).toEqual([])
    expect(activeClient.getMessages()).toEqual([
      expect.objectContaining({
        id: 'fixture-message',
        parts: [
          expect.objectContaining({
            type: 'tool-call',
            name: 'weather',
            output: { temperature: 21 },
          }),
          expect.objectContaining({
            type: 'tool-result',
            content: '{"temperature":21}',
          }),
        ],
      }),
    ])

    staleClient.dispose()
    activeClient.dispose()
  })

  it('keeps superseded duplicate hook bridges silent when they emit later', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const firstClient = createClient({
      threadId: 'thread-first',
      connection: createRunTrackingAdapter(
        [createTextChunks('from first', 'msg-first')],
        runContexts,
      ),
    })
    const duplicateClient = createClient({ threadId: 'thread-duplicate' })
    vi.clearAllMocks()

    await firstClient.sendMessage('start')

    expect(runContexts[0]).toBeDefined()
    expect(eventClientMock.emitted('run:created')).toEqual([])
    expect(eventClientMock.emitted('hook:updated')).toEqual([])
    expect(eventClientMock.emitted('hook:state-snapshot')).toEqual([])

    firstClient.dispose()
    expect(eventClientMock.emitted('hook:unregistered')).toEqual([])

    duplicateClient.dispose()
    expect(eventClientMock.emitted('hook:unregistered')).toEqual([
      [
        'hook:unregistered',
        expect.objectContaining({
          hookId: 'chat-1',
          threadId: 'thread-duplicate',
        }),
      ],
    ])
  })

  it('includes thread and tool call context when applying a fixture without a run id', async () => {
    const client = createClient()
    vi.clearAllMocks()

    const fixture: AIDevtoolsToolFixture = {
      hookId: 'chat-1',
      threadId: 'thread-1',
      toolName: 'weather',
      input: { city: 'Rome' },
      output: { temperature: 24 },
      toolCallId: 'thread-only-call',
      messageId: 'thread-only-message',
    }
    eventClientMock.dispatch('devtools:tool-fixture:apply', fixture)

    await waitForCondition(() => client.getMessages().length === 1)

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'text:message:created',
      expect.objectContaining({
        threadId: 'thread-1',
        toolCallId: 'thread-only-call',
        messageId: 'thread-only-message',
        visibility: 'user-visible',
      }),
    )

    client.dispose()
  })

  it('marks fixture tool results as errored when devtools provides error text', async () => {
    const client = createClient()
    vi.clearAllMocks()

    dispatchToolFixture({
      output: null,
      errorText: 'Tool failed',
    })

    await waitForCondition(() => client.getMessages().length === 1)

    expect(client.getMessages()).toEqual([
      expect.objectContaining({
        parts: [
          expect.objectContaining({
            type: 'tool-call',
            output: null,
          }),
          {
            type: 'tool-result',
            toolCallId: 'fixture-call',
            content: 'null',
            state: 'error',
            error: 'Tool failed',
          },
        ],
      }),
    ])
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'devtools:tool-fixture:applied',
      expect.objectContaining({
        errorText: 'Tool failed',
      }),
    )

    client.dispose()
  })

  it('ignores devtools tool fixtures for another thread', async () => {
    const client = createClient()
    vi.clearAllMocks()

    const fixture: AIDevtoolsToolFixture = {
      threadId: 'other-thread',
      toolName: 'weather',
      input: { city: 'Paris' },
      output: { temperature: 21 },
      toolCallId: 'fixture-call',
      messageId: 'fixture-message',
    }
    eventClientMock.dispatch('devtools:tool-fixture:apply', fixture)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(client.getMessages()).toEqual([])
    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'devtools:tool-fixture:applied',
      expect.anything(),
    )

    client.dispose()
  })

  it('ignores unscoped devtools tool fixtures', async () => {
    const client = createClient()
    vi.clearAllMocks()

    const fixture: AIDevtoolsToolFixture = {
      toolName: 'weather',
      input: { city: 'Paris' },
      output: { temperature: 21 },
      toolCallId: 'fixture-call',
      messageId: 'fixture-message',
    }
    eventClientMock.dispatch('devtools:tool-fixture:apply', fixture)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(client.getMessages()).toEqual([])
    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'devtools:tool-fixture:applied',
      expect.anything(),
    )

    client.dispose()
  })

  it('ignores devtools tool fixtures for another hook', async () => {
    const client = createClient()
    vi.clearAllMocks()

    dispatchToolFixture({ hookId: 'other-hook' })
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(client.getMessages()).toEqual([])
    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'devtools:tool-fixture:applied',
      expect.anything(),
    )

    client.dispose()
  })

  it('disposes the hook bridge idempotently', () => {
    const client = createClient()
    vi.clearAllMocks()

    client.dispose()
    client.dispose()

    expect(eventClientMock.emitted('hook:unregistered')).toHaveLength(1)
    expect(eventClientMock.unsubscribe).toHaveBeenCalledTimes(2)
  })

  it('emits a snapshot when messages are set manually', () => {
    const client = createClient()
    vi.clearAllMocks()

    client.setMessagesManually([userMessage])

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        state: expect.objectContaining({
          messages: [userMessage],
        }),
      }),
    )

    client.dispose()
  })

  it('emits a snapshot when messages are cleared', () => {
    const client = createClient()
    client.setMessagesManually([userMessage])
    vi.clearAllMocks()

    client.clear()

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        state: expect.objectContaining({
          messages: [],
        }),
      }),
    )

    client.dispose()
  })

  it('emits a snapshot after reload removes messages after the last user message', async () => {
    const client = createClient({
      connection: createMockConnectionAdapter({
        chunks: createTextChunks('regenerated', 'msg-reload'),
      }),
    })
    client.setMessagesManually([userMessage, assistantMessage])
    vi.clearAllMocks()

    await client.reload()

    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'hook:state-snapshot',
      expect.objectContaining({
        state: expect.objectContaining({
          messages: [userMessage],
        }),
      }),
    )

    client.dispose()
  })

  it('emits chat run lifecycle events for hook run tracking', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const client = createClient({
      connection: createRunTrackingAdapter(
        [createTextChunks('tracked', 'msg-run')],
        runContexts,
      ),
    })
    vi.clearAllMocks()

    await client.sendMessage('start')

    const runContext = runContexts[0]
    expect(runContext).toBeDefined()
    expect(eventClientMock.emitted('run:created')).toEqual([
      [
        'run:created',
        expect.objectContaining({
          hookId: 'chat-1',
          threadId: 'thread-1',
          runId: runContext?.runId,
          status: 'created',
        }),
      ],
    ])
    expect(eventClientMock.emitted('run:started')).toEqual([
      [
        'run:started',
        expect.objectContaining({
          hookId: 'chat-1',
          threadId: 'thread-1',
          runId: runContext?.runId,
          status: 'started',
        }),
      ],
    ])
    expect(eventClientMock.emitted('run:completed')).toEqual([
      [
        'run:completed',
        expect.objectContaining({
          hookId: 'chat-1',
          threadId: 'thread-1',
          runId: runContext?.runId,
          status: 'completed',
        }),
      ],
    ])

    client.dispose()
  })

  it('links streamed text and tool events to the current run context', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const adapter = createRunTrackingAdapter(
      [
        [
          textContentChunk({
            messageId: 'msg-text',
            delta: 'h',
            content: 'h',
          }),
          textContentChunk({
            messageId: 'msg-text',
            delta: 'i',
            content: 'hi',
          }),
          ...createToolCallChunks(
            [{ id: 'call-1', name: 'weather', arguments: '{"city":"Paris"}' }],
            'msg-tool',
            'test',
            false,
          ),
        ],
      ],
      runContexts,
    )
    const client = createClient({ connection: adapter })
    vi.clearAllMocks()

    await client.sendMessage('start')

    const runContext = runContexts[0]
    expect(runContext).toBeDefined()
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'text:chunk:content',
      expect.objectContaining({
        threadId: runContext?.threadId,
        runId: runContext?.runId,
      }),
    )
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'tools:call:updated',
      expect.objectContaining({
        threadId: runContext?.threadId,
        runId: runContext?.runId,
        toolCallId: 'call-1',
      }),
    )

    client.dispose()
  })

  it('uses stream lifecycle run ids when the server emits them', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const adapter = createRunTrackingAdapter(
      [
        [
          runStartedChunk({
            threadId: 'server-thread',
            runId: 'server-run',
          }),
          textContentChunk({
            messageId: 'msg-server',
            delta: 's',
            content: 's',
          }),
          runFinishedChunk({
            threadId: 'server-thread',
            runId: 'server-run',
          }),
        ],
      ],
      runContexts,
    )
    const client = createClient({ connection: adapter })
    vi.clearAllMocks()

    await client.sendMessage('start')

    expect(runContexts[0]?.runId).not.toBe('server-run')
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'text:chunk:content',
      expect.objectContaining({
        threadId: 'server-thread',
        runId: 'server-run',
        messageId: 'msg-server',
      }),
    )

    client.dispose()
  })

  it('emits structured output updates and snapshots streamed structured parts', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const finalObject = { title: 'Pasta', servings: 2 }
    const chunks: Array<StreamChunk> = [
      {
        type: EventType.CUSTOM,
        model: 'test',
        timestamp: Date.now(),
        name: 'structured-output.start',
        value: { messageId: 'msg-structured' },
      },
      textContentChunk({
        messageId: 'msg-structured',
        delta: '{"title":"Pasta"',
        content: '{"title":"Pasta"',
      }),
      textContentChunk({
        messageId: 'msg-structured',
        delta: ',"servings":2}',
        content: '{"title":"Pasta","servings":2}',
      }),
      {
        type: EventType.CUSTOM,
        model: 'test',
        timestamp: Date.now(),
        name: 'structured-output.complete',
        value: {
          object: finalObject,
          raw: '{"title":"Pasta","servings":2}',
          messageId: 'msg-structured',
        },
      },
    ]
    const client = createClient({
      connection: createRunTrackingAdapter([chunks], runContexts),
    })
    vi.clearAllMocks()

    await client.sendMessage('make recipe')

    expect(eventClientMock.emitted('structured-output:started')).toEqual([
      [
        'structured-output:started',
        expect.objectContaining({
          hookId: 'chat-1',
          clientId: 'chat-1',
          threadId: runContexts[0]?.threadId,
          runId: runContexts[0]?.runId,
          messageId: 'msg-structured',
          status: 'streaming',
        }),
      ],
    ])
    expect(eventClientMock.emitted('structured-output:updated')).toEqual(
      expect.arrayContaining([
        [
          'structured-output:updated',
          expect.objectContaining({
            hookId: 'chat-1',
            clientId: 'chat-1',
            threadId: runContexts[0]?.threadId,
            runId: runContexts[0]?.runId,
            messageId: 'msg-structured',
            status: 'streaming',
            raw: '{"title":"Pasta","servings":2}',
            partial: finalObject,
          }),
        ],
      ]),
    )
    expect(eventClientMock.emitted('structured-output:completed')).toEqual([
      [
        'structured-output:completed',
        expect.objectContaining({
          hookId: 'chat-1',
          clientId: 'chat-1',
          threadId: runContexts[0]?.threadId,
          runId: runContexts[0]?.runId,
          messageId: 'msg-structured',
          status: 'complete',
          raw: '{"title":"Pasta","servings":2}',
          data: finalObject,
        }),
      ],
    ])

    const structuredPart = findStructuredOutputPart(
      latestSnapshotMessages(),
      'msg-structured',
    )
    expect(structuredPart).toEqual(
      expect.objectContaining({
        type: 'structured-output',
        status: 'complete',
        raw: '{"title":"Pasta","servings":2}',
        data: finalObject,
        partial: finalObject,
      }),
    )

    client.dispose()
  })

  it('batches structured output update events while preserving final state', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const finalObject = { title: 'Pasta', servings: 2 }
    const raw = JSON.stringify(finalObject)
    const chunks: Array<StreamChunk> = [
      {
        type: EventType.CUSTOM,
        model: 'test',
        timestamp: Date.now(),
        name: 'structured-output.start',
        value: { messageId: 'msg-structured-batched' },
      },
      ...Array.from(raw).map((character, index) =>
        textContentChunk({
          messageId: 'msg-structured-batched',
          delta: character,
          content: raw.slice(0, index + 1),
        }),
      ),
      {
        type: EventType.CUSTOM,
        model: 'test',
        timestamp: Date.now(),
        name: 'structured-output.complete',
        value: {
          object: finalObject,
          raw,
          messageId: 'msg-structured-batched',
        },
      },
    ]
    const client = createClient({
      connection: createRunTrackingAdapter([chunks], runContexts),
    })
    vi.clearAllMocks()

    await client.sendMessage('make recipe')

    const updateEvents = eventClientMock.emitted('structured-output:updated')
    expect(updateEvents).toHaveLength(3)
    expect(updateEvents.map(([, payload]) => payload)).toEqual([
      expect.objectContaining({
        messageId: 'msg-structured-batched',
        raw: raw.slice(0, 12),
        delta: raw.slice(0, 12),
      }),
      expect.objectContaining({
        messageId: 'msg-structured-batched',
        raw: raw.slice(0, 24),
        delta: raw.slice(12, 24),
      }),
      expect.objectContaining({
        messageId: 'msg-structured-batched',
        raw,
        delta: raw.slice(24),
        partial: finalObject,
      }),
    ])
    expect(eventClientMock.emitted('structured-output:completed')).toEqual([
      [
        'structured-output:completed',
        expect.objectContaining({
          messageId: 'msg-structured-batched',
          status: 'complete',
          raw,
          data: finalObject,
        }),
      ],
    ])

    const structuredPart = findStructuredOutputPart(
      latestSnapshotMessages(),
      'msg-structured-batched',
    )
    expect(structuredPart).toEqual(
      expect.objectContaining({
        type: 'structured-output',
        status: 'complete',
        raw,
        data: finalObject,
        partial: finalObject,
      }),
    )

    client.dispose()
  })

  it('emits structured output completion without streamed deltas', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const finalObject = { title: 'Risotto', servings: 4 }
    const chunks: Array<StreamChunk> = [
      {
        type: EventType.CUSTOM,
        model: 'test',
        timestamp: Date.now(),
        name: 'structured-output.start',
        value: { messageId: 'msg-structured-terminal' },
      },
      {
        type: EventType.CUSTOM,
        model: 'test',
        timestamp: Date.now(),
        name: 'structured-output.complete',
        value: {
          object: finalObject,
          messageId: 'msg-structured-terminal',
        },
      },
    ]
    const client = createClient({
      connection: createRunTrackingAdapter([chunks], runContexts),
    })
    vi.clearAllMocks()

    await client.sendMessage('make risotto')

    expect(eventClientMock.emitted('structured-output:completed')).toEqual([
      [
        'structured-output:completed',
        expect.objectContaining({
          hookId: 'chat-1',
          clientId: 'chat-1',
          threadId: runContexts[0]?.threadId,
          runId: runContexts[0]?.runId,
          messageId: 'msg-structured-terminal',
          status: 'complete',
          raw: JSON.stringify(finalObject),
          data: finalObject,
        }),
      ],
    ])

    const structuredPart = findStructuredOutputPart(
      latestSnapshotMessages(),
      'msg-structured-terminal',
    )
    expect(structuredPart).toEqual(
      expect.objectContaining({
        type: 'structured-output',
        status: 'complete',
        raw: JSON.stringify(finalObject),
        data: finalObject,
        partial: finalObject,
      }),
    )

    client.dispose()
  })

  it('preserves structured output parts across multiple chat turns', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const firstObject = { title: 'Pasta', servings: 2 }
    const secondObject = { title: 'Soup', servings: 3 }
    const client = createClient({
      connection: createRunTrackingAdapter(
        [
          [
            {
              type: EventType.CUSTOM,
              model: 'test',
              timestamp: Date.now(),
              name: 'structured-output.start',
              value: { messageId: 'msg-structured-first' },
            },
            {
              type: EventType.CUSTOM,
              model: 'test',
              timestamp: Date.now(),
              name: 'structured-output.complete',
              value: {
                object: firstObject,
                messageId: 'msg-structured-first',
              },
            },
          ],
          [
            {
              type: EventType.CUSTOM,
              model: 'test',
              timestamp: Date.now(),
              name: 'structured-output.start',
              value: { messageId: 'msg-structured-second' },
            },
            textContentChunk({
              messageId: 'msg-structured-second',
              delta: '{"title":"Soup","servings":3}',
              content: '{"title":"Soup","servings":3}',
            }),
            {
              type: EventType.CUSTOM,
              model: 'test',
              timestamp: Date.now(),
              name: 'structured-output.complete',
              value: {
                object: secondObject,
                raw: JSON.stringify(secondObject),
                messageId: 'msg-structured-second',
              },
            },
          ],
        ],
        runContexts,
      ),
    })
    vi.clearAllMocks()

    await client.sendMessage('make pasta')
    await client.sendMessage('make soup')

    const messages = latestSnapshotMessages()
    expect(findStructuredOutputPart(messages, 'msg-structured-first')).toEqual(
      expect.objectContaining({
        type: 'structured-output',
        status: 'complete',
        data: firstObject,
      }),
    )
    expect(findStructuredOutputPart(messages, 'msg-structured-second')).toEqual(
      expect.objectContaining({
        type: 'structured-output',
        status: 'complete',
        data: secondObject,
      }),
    )
    expect(eventClientMock.emitted('structured-output:completed')).toHaveLength(
      2,
    )

    client.dispose()
  })

  it('emits approval requests that arrive after run finish', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const chunks: Array<StreamChunk> = [
      ...createToolCallChunks(
        [
          {
            id: 'approval-call-1',
            name: 'addToCart',
            arguments: '{"guitarId":"6","quantity":1}',
          },
        ],
        'msg-approval',
        'test',
        false,
      ),
      {
        type: EventType.CUSTOM,
        model: 'test',
        timestamp: Date.now(),
        name: 'approval-requested',
        value: {
          toolCallId: 'approval-call-1',
          toolName: 'addToCart',
          input: { guitarId: '6', quantity: 1 },
          approval: { id: 'approval-approval-call-1', needsApproval: true },
        },
      },
    ]
    const client = createClient({
      connection: createRunTrackingAdapter([chunks], runContexts),
    })
    vi.clearAllMocks()

    await client.sendMessage('add it to cart')

    await waitForCondition(
      () => eventClientMock.emitted('tools:approval:requested').length > 0,
    )
    expect(eventClientMock.emitted('tools:approval:requested')).toEqual([
      [
        'tools:approval:requested',
        expect.objectContaining({
          hookId: 'chat-1',
          clientId: 'chat-1',
          threadId: runContexts[0]?.threadId,
          runId: runContexts[0]?.runId,
          streamId: expect.any(String),
          messageId: expect.any(String),
          toolCallId: 'approval-call-1',
          toolName: 'addToCart',
          input: { guitarId: '6', quantity: 1 },
          approvalId: 'approval-approval-call-1',
        }),
      ],
    ])

    await waitForCondition(() => {
      const toolCall = findToolCallPart(
        latestSnapshotMessages(),
        'approval-call-1',
      )
      return (
        toolCall?.state === 'approval-requested' &&
        toolCall.approval?.id === 'approval-approval-call-1'
      )
    })

    client.dispose()
  })

  it('emits approval responses and snapshots the approval decision', async () => {
    const runContexts: Array<RunAgentInputContext> = []
    const client = createClient({
      connection: createRunTrackingAdapter(
        [createTextChunks('approved', 'msg-after-approval')],
        runContexts,
      ),
      initialMessages: [
        userMessage,
        {
          id: 'msg-approval',
          role: 'assistant',
          parts: [
            {
              type: 'tool-call',
              id: 'approval-call-1',
              name: 'addToCart',
              arguments: '{"guitarId":"6","quantity":1}',
              input: { guitarId: '6', quantity: 1 },
              state: 'approval-requested',
              approval: {
                id: 'approval-approval-call-1',
                needsApproval: true,
              },
            },
          ],
        },
      ],
    })
    vi.clearAllMocks()

    await client.addToolApprovalResponse({
      id: 'approval-approval-call-1',
      approved: true,
    })

    expect(eventClientMock.emitted('tools:approval:responded')).toEqual([
      [
        'tools:approval:responded',
        expect.objectContaining({
          hookId: 'chat-1',
          clientId: 'chat-1',
          toolCallId: 'approval-call-1',
          approvalId: 'approval-approval-call-1',
          approved: true,
        }),
      ],
    ])
    await waitForCondition(() => {
      const toolCall = findToolCallPart(
        latestSnapshotMessages(),
        'approval-call-1',
      )
      return (
        toolCall?.state === 'approval-responded' &&
        toolCall.approval?.approved === true
      )
    })

    client.dispose()
  })

  it('keeps delayed client tool results linked to their original run context', async () => {
    let resolveTool!: (output: unknown) => void
    let markToolStarted!: () => void
    const toolStarted = new Promise<void>((resolve) => {
      markToolStarted = resolve
    })
    const toolOutput = new Promise<unknown>((resolve) => {
      resolveTool = resolve
    })
    const runContexts: Array<RunAgentInputContext> = []
    const adapter = createRunTrackingAdapter(
      [
        createToolCallChunks([
          { id: 'call-1', name: 'delayed_tool', arguments: '{}' },
        ]),
        createTextChunks('new run', 'msg-2'),
      ],
      runContexts,
    )
    const delayedTool = toolDefinition({
      name: 'delayed_tool',
      description: 'Delayed tool',
    }).client(async () => {
      markToolStarted()
      return toolOutput
    })
    const client = createClient({
      connection: adapter,
      tools: [delayedTool],
    })
    vi.clearAllMocks()

    const firstRun = client.sendMessage('first')
    await toolStarted
    client.stop()
    const secondRun = client.sendMessage('second')
    await waitForCondition(() => runContexts.length === 2)

    resolveTool({ ok: true })
    await Promise.allSettled([firstRun, secondRun])

    expect(runContexts[0]?.runId).not.toBe(runContexts[1]?.runId)
    expect(aiEventClient.emit).toHaveBeenCalledWith(
      'tools:result:added',
      expect.objectContaining({
        threadId: runContexts[0]?.threadId,
        runId: runContexts[0]?.runId,
        toolCallId: 'call-1',
        toolName: 'delayed_tool',
      }),
    )
    expect(aiEventClient.emit).not.toHaveBeenCalledWith(
      'tools:result:added',
      expect.objectContaining({
        runId: runContexts[1]?.runId,
        toolCallId: 'call-1',
      }),
    )

    client.dispose()
  })
})
