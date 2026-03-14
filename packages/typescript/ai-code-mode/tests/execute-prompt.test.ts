import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai'
import { executePrompt } from '../src/execute-prompt'
import { InMemoryAgentStore } from '../src/agent-store'
import type { IsolateDriver, IsolateContext } from '../src/types'

vi.mock('@tanstack/ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/ai')>()
  return {
    ...actual,
    chat: vi.fn(),
  }
})

import { chat } from '@tanstack/ai'
const mockChat = vi.mocked(chat)

beforeEach(() => {
  mockChat.mockClear()
})

function createMockDriver(): IsolateDriver {
  const mockContext: IsolateContext = {
    execute: vi.fn().mockResolvedValue({ success: true, value: 42, logs: [] }),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
  return {
    createContext: vi.fn().mockResolvedValue(mockContext),
  }
}

function createMockTool(name: string) {
  return toolDefinition({
    name: name as any,
    description: `The ${name} tool`,
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ result: z.string() }),
  }).server(async (input: any) => ({ result: input.query }))
}

describe('executePrompt', () => {
  it('returns { data, agentName } with parsed JSON when agent produces valid JSON', async () => {
    mockChat.mockResolvedValue('{"users": [{"id": 1, "name": "Alice"}]}' as any)

    const result = await executePrompt({
      adapter: {} as any,
      prompt: 'Get all users',
      tools: [createMockTool('getUsers')],
      driver: createMockDriver(),
    })

    expect(result.data).toEqual({ users: [{ id: 1, name: 'Alice' }] })
    expect(result.agentName).toMatch(/^agent_/)
  })

  it('returns { raw, parseError: true } in data when agent produces non-JSON', async () => {
    mockChat.mockResolvedValue('Here is the data you wanted...' as any)

    const result = await executePrompt({
      adapter: {} as any,
      prompt: 'Get all users',
      tools: [createMockTool('getUsers')],
      driver: createMockDriver(),
    })

    expect(result.data).toEqual({
      raw: 'Here is the data you wanted...',
      parseError: true,
    })
  })

  it('passes custom system prompt to chat', async () => {
    mockChat.mockResolvedValue('{}' as any)

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      system: 'You are a custom agent.',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    expect(callArgs.systemPrompts[0]).toBe('You are a custom agent.')
  })

  it('uses default system prompt when none provided', async () => {
    mockChat.mockResolvedValue('{}' as any)

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    expect(callArgs.systemPrompts[0]).toContain('data agent')
  })

  it('passes prompt as user message', async () => {
    mockChat.mockResolvedValue('{}' as any)

    await executePrompt({
      adapter: {} as any,
      prompt: 'Find all active subscriptions',
      tools: [createMockTool('db')],
      driver: createMockDriver(),
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    expect(callArgs.messages).toEqual([
      { role: 'user', content: 'Find all active subscriptions' },
    ])
  })

  it('passes maxTokens through to chat', async () => {
    mockChat.mockResolvedValue('{}' as any)

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      maxTokens: 4096,
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    expect(callArgs.maxTokens).toBe(4096)
  })

  it('calls chat with stream: false', async () => {
    mockChat.mockResolvedValue('{}' as any)

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    expect(callArgs.stream).toBe(false)
  })

  it('includes the code mode tool in chat tools', async () => {
    mockChat.mockResolvedValue('{}' as any)

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    expect(callArgs.tools[0].name).toBe('execute_typescript')
  })

  it('includes code mode system prompt from createCodeModeToolAndPrompt', async () => {
    mockChat.mockResolvedValue('{}' as any)

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    // Second system prompt should be the code mode prompt with execute_typescript instructions
    expect(callArgs.systemPrompts[1]).toContain('execute_typescript')
  })

  // Agent memory tests

  it('creates new session when no agentName provided with agentStore', async () => {
    mockChat.mockResolvedValue('{"result": true}' as any)
    const store = new InMemoryAgentStore()

    const result = await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      agentStore: store,
    })

    expect(result.agentName).toMatch(/^agent_/)
    const session = await store.get(result.agentName)
    expect(session).not.toBeNull()
    expect(session!.name).toBe(result.agentName)
  })

  it('loads existing session when agentName provided', async () => {
    mockChat.mockResolvedValue('{"result": true}' as any)
    const store = new InMemoryAgentStore()

    // Create a session first
    await store.set('my-agent', {
      name: 'my-agent',
      systemPrompt: 'test',
      memory: { 'sales.schema': { columns: ['id', 'revenue'] } },
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    })

    const result = await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      agentStore: store,
      agentName: 'my-agent',
    })

    expect(result.agentName).toBe('my-agent')
  })

  it('injects memory K:V pairs into system prompt', async () => {
    mockChat.mockResolvedValue('{}' as any)
    const store = new InMemoryAgentStore()

    await store.set('mem-agent', {
      name: 'mem-agent',
      systemPrompt: 'test',
      memory: {
        'sales.schema': { columns: ['id', 'revenue'] },
        'regions.codes': ['APAC', 'EMEA'],
      },
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    })

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      agentStore: store,
      agentName: 'mem-agent',
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    expect(callArgs.systemPrompts[0]).toContain('Agent Memory')
    expect(callArgs.systemPrompts[0]).toContain('sales.schema')
    expect(callArgs.systemPrompts[0]).toContain('regions.codes')
  })

  it('includes memory tools in chat tools array when agentStore provided', async () => {
    mockChat.mockResolvedValue('{}' as any)
    const store = new InMemoryAgentStore()

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      agentStore: store,
    })

    const callArgs = mockChat.mock.calls[0]![0] as any
    const toolNames = callArgs.tools.map((t: any) => t.name)
    expect(toolNames).toContain('execute_typescript')
    expect(toolNames).toContain('memory_get')
    expect(toolNames).toContain('memory_set')
  })

  it('gracefully creates new session when agentName not found in store', async () => {
    mockChat.mockResolvedValue('{"result": true}' as any)
    const store = new InMemoryAgentStore()

    const result = await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      agentStore: store,
      agentName: 'nonexistent-agent',
    })

    // Should use the provided name, not generate a new one
    expect(result.agentName).toBe('nonexistent-agent')
    const session = await store.get('nonexistent-agent')
    expect(session).not.toBeNull()
  })

  it('result.data matches what old result was (backward compat)', async () => {
    mockChat.mockResolvedValue('{"users": [1, 2, 3]}' as any)

    const result = await executePrompt({
      adapter: {} as any,
      prompt: 'Get users',
      tools: [createMockTool('getUsers')],
      driver: createMockDriver(),
    })

    expect(result.data).toEqual({ users: [1, 2, 3] })
  })

  // Event tests

  it('emits events when onEvent provided', async () => {
    mockChat.mockResolvedValue('{}' as any)
    const store = new InMemoryAgentStore()
    const events: Array<any> = []

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      agentStore: store,
      onEvent: (event) => events.push(event),
    })

    const types = events.map((e) => e.type)
    expect(types).toContain('agent:start')
    expect(types).toContain('code:generated')
    expect(types).toContain('agent:complete')
  })

  it('emits warm start event for existing session', async () => {
    mockChat.mockResolvedValue('{}' as any)
    const store = new InMemoryAgentStore()
    const events: Array<any> = []

    await store.set('warm-agent', {
      name: 'warm-agent',
      systemPrompt: 'test',
      memory: {},
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    })

    await executePrompt({
      adapter: {} as any,
      prompt: 'Get data',
      tools: [createMockTool('getData')],
      driver: createMockDriver(),
      agentStore: store,
      agentName: 'warm-agent',
      onEvent: (event) => events.push(event),
    })

    const startEvent = events.find((e) => e.type === 'agent:start')
    expect(startEvent.message).toContain('warm')
  })
})
