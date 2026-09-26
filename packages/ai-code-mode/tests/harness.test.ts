import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  PermissionRules,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { codeMode } from '../src/harness'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { ExecutionResult, IsolateDriver, ToolBinding } from '../src/types'

const now = () => Date.now()

/** A model whose turns are scripted. Records the options of every call. */
function scripted(turns: Array<Array<StreamChunk>>) {
  const calls: Array<any> = []
  const adapter: AnyTextAdapter = {
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
    chatStream: (options: any) => {
      calls.push(options)
      const chunks = turns[calls.length - 1] ?? []
      return (async function* () {
        yield* chunks
      })()
    },
  }
  return { adapter, calls }
}

const textTurn = (content: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'm',
    role: 'assistant',
    timestamp: now(),
  },
  {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    delta: content,
    timestamp: now(),
  },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'm', timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'stop' } },
  },
]

const codeTurn = (code: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call-code',
    toolCallName: 'execute_typescript',
    timestamp: now(),
  },
  {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'call-code',
    delta: JSON.stringify({ typescriptCode: code }),
    timestamp: now(),
  },
  { type: EventType.TOOL_CALL_END, toolCallId: 'call-code', timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'tool_calls' } },
  },
]

/**
 * A stand-in isolate: it records the bindings it got and, for any program,
 * calls `external_lookup` and `external_notion_search` and returns both
 * results. Real drivers run the program itself.
 */
function fakeDriver() {
  const seen: Array<Array<string>> = []
  const driver: IsolateDriver = {
    createContext: async ({ bindings }) => {
      seen.push(Object.keys(bindings).sort())
      const call = (name: string, args: unknown) =>
        (bindings[name] as ToolBinding).execute(args)
      return {
        execute: async <T>(): Promise<ExecutionResult<T>> => {
          const value = {
            lookup: await call('external_lookup', { q: 'x' }),
            notion: await call('external_notion_search', { query: 'y' }),
          }
          // The caller picks T. This stand-in always returns the two results.
          return { success: true, value: value as T, logs: [] }
        },
        dispose: async () => {},
      }
    },
  }
  return { driver, seen }
}

const lookup = vi.fn(async () => 'fact')
const notionSearch = vi.fn(async () => ({ results: ['page'] }))
const tools = {
  lookup: toolDefinition({
    name: 'lookup',
    description: 'Look up a fact',
    inputSchema: z.object({ q: z.string() }),
  }).server(lookup),
  remove: toolDefinition({
    name: 'remove',
    description: 'Remove a file',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(async () => 'removed'),
  writeFile: toolDefinition({
    name: 'write_file',
    description: 'Write a file',
    inputSchema: z.object({ path: z.string() }),
  }).server(async () => 'written'),
  notionSearch: toolDefinition({
    name: 'notion_search',
    description: 'Search Notion',
    inputSchema: z.object({ query: z.string() }),
  }).server(notionSearch),
  askUser: toolDefinition({
    name: 'ask_user',
    description: 'Ask the user in the browser',
    inputSchema: z.object({}),
  }).client(),
}

// A tool plugin that marks write_file as an edit, like workspaceTools does.
const writes = definePlugin({
  name: 'test/writes',
  setup: () => ({
    tools: [tools.writeFile],
    contribute: [
      PermissionRules.item({
        tool: 'write_file',
        decision: 'ask',
        kind: 'edit',
      }),
    ],
  }),
})
// A connector whose tool appears at run time.
const notion = definePlugin({
  name: 'test/notion',
  setup: () => ({ discoverTools: () => [tools.notionSearch] }),
})

describe('codeMode', () => {
  it('moves safe tools, including discovered ones, behind execute_typescript', async () => {
    const { driver, seen } = fakeDriver()
    const { adapter, calls } = scripted([
      codeTurn('return { a: await external_lookup({ q: "x" }) }'),
      textTurn('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/code-mode',
        adapter,
        tools: [tools.lookup, tools.remove, tools.askUser],
        plugins: () => [writes, notion, codeMode({ driver })],
      }),
      { threadId: 't' },
    )
    const turn = await session.prompt('look it up')
    expect(turn.text).toBe('done')

    const names = calls[0].tools.map((tool: { name: string }) => tool.name)
    expect(names).toEqual([
      'remove',
      'ask_user',
      'write_file',
      'execute_typescript',
    ])
    const prompts = JSON.stringify(calls[0].systemPrompts)
    expect(prompts).toContain('external_lookup')
    expect(prompts).toContain('external_notion_search')
    expect(prompts).not.toContain('external_write_file')

    expect(seen[0]).toEqual(['external_lookup', 'external_notion_search'])
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(notionSearch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(calls[1].messages)).toContain('page')
    await host.close()
  })

  it('uses include to pick the tools, and leaves the list alone when none match', async () => {
    const { driver } = fakeDriver()
    const { adapter, calls } = scripted([textTurn('one'), textTurn('two')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const picked = await host.open(
      defineHarness({
        name: 'test/code-mode-include',
        adapter,
        tools: [tools.lookup, tools.remove],
        plugins: () => [
          codeMode({ driver, include: (tool) => tool.name === 'remove' }),
        ],
      }),
      { threadId: 'picked' },
    )
    await picked.prompt('hi')
    expect(calls[0].tools.map((tool: { name: string }) => tool.name)).toEqual([
      'lookup',
      'execute_typescript',
    ])

    const none = await host.open(
      defineHarness({
        name: 'test/code-mode-none',
        adapter,
        tools: [tools.remove],
        plugins: () => [codeMode({ driver })],
      }),
      { threadId: 'none' },
    )
    await none.prompt('hi')
    expect(calls[1].tools.map((tool: { name: string }) => tool.name)).toEqual([
      'remove',
    ])
    expect(JSON.stringify(calls[1].systemPrompts ?? [])).not.toContain(
      'execute_typescript',
    )
    await host.close()
  })

  it('gives tools with names that are not identifiers a safe name', async () => {
    const seen: Array<Array<string>> = []
    const driver: IsolateDriver = {
      createContext: async ({ bindings }) => {
        seen.push(Object.keys(bindings).sort())
        return {
          execute: async <T>(): Promise<ExecutionResult<T>> => {
            const binding = bindings['external_web_search'] as ToolBinding
            const value: unknown = await binding.execute({})
            // The caller picks T. This stand-in returns the one result.
            return { success: true, value: value as T, logs: [] }
          },
          dispose: async () => {},
        }
      },
    }
    const named = (name: string, reply: string) =>
      toolDefinition({
        name,
        description: 'A tool',
        inputSchema: z.object({}),
      }).server(async () => reply)
    const { adapter, calls } = scripted([codeTurn('return 1'), textTurn('ok')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/code-mode-names',
        adapter,
        tools: [
          named('web-search', 'from web-search'),
          named('web_search', 'from web_search'),
          named('2fa', 'code'),
        ],
        plugins: () => [codeMode({ driver })],
      }),
      { threadId: 't' },
    )
    await session.prompt('search')
    // web_search clashes with web-search after the rename, so it stays direct.
    expect(calls[0].tools.map((tool: { name: string }) => tool.name)).toEqual([
      'web_search',
      'execute_typescript',
    ])
    expect(seen[0]).toEqual(['external__2fa', 'external_web_search'])
    expect(JSON.stringify(calls[1].messages)).toContain('from web-search')
    await host.close()
  })
})
