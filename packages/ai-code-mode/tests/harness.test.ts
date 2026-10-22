import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { EventType, toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  PermissionRules,
  createHarnessHost,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { PermissionResources, permissions } from '@tanstack/ai-harness/plugins'
import { workspaceTools } from '@tanstack/ai-harness/plugins/coding'
import { codeMode } from '../src/harness'
import type {
  AnyTextAdapter,
  AnyTool,
  Logger,
  MetadataStore,
  StreamChunk,
  TextOptions,
  ToolExecutionContext,
} from '@tanstack/ai'
import type {
  HarnessPersistence,
  HarnessPlugin,
  HarnessSession,
} from '@tanstack/ai-harness'
import type { ExecutionResult, IsolateDriver } from '../src/types'

// Polled checks wait up to 5 s: coverage runs in CI are slow.
const waitFor = (check: () => void) => vi.waitFor(check, { timeout: 5_000 })

const now = () => Date.now()

/** A model whose turns are scripted. Records the options of every call. */
function scripted(turns: Array<Array<StreamChunk>>) {
  const calls: Array<TextOptions> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    // Type-only fields have no value, so each cast gives one its type.
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
    chatStream: (options) => {
      calls.push(options)
      const chunks = turns[calls.length - 1] ?? []
      return (async function* () {
        yield* chunks
      })()
    },
  }
  return { adapter, calls }
}

/** The tool names of a model call. */
const toolNames = (call: TextOptions | undefined) =>
  call?.tools?.map((tool) => tool.name)

/** The system prompts of a model call, as one text. */
const promptsOf = (call: TextOptions | undefined) =>
  JSON.stringify(call?.systemPrompts ?? [])

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

/** A model turn that calls one tool with `args`. */
const callTurn = (
  toolName: string,
  args: unknown,
  toolCallId = `call-${toolName}`,
): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName: toolName,
    timestamp: now(),
  },
  {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta: JSON.stringify(args),
    timestamp: now(),
  },
  { type: EventType.TOOL_CALL_END, toolCallId, timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'tool_calls' } },
  },
]

/**
 * A model turn that runs a program. The log keeps the calls of a program
 * under its tool call id, so each program of a session needs its own id.
 */
const codeTurn = (code: string, toolCallId?: string) =>
  callTurn('execute_typescript', { typescriptCode: code }, toolCallId)

/** Calls a binding of the isolate, as a program calls `external_*`. */
type CallBinding = (name: string, args: unknown) => Promise<unknown>

/** The program of `fakeDriver` by default: two calls, and both results. */
async function lookupBoth(call: CallBinding) {
  return {
    lookup: await call('external_lookup', { q: 'x' }),
    notion: await call('external_notion_search', { query: 'y' }),
  }
}

/**
 * A stand-in isolate: it records the bindings and the timeout it got, and
 * runs `program` for any code. A call that throws fails the program, as in
 * a real isolate. Real drivers run the code itself.
 */
function fakeDriver(
  program: (call: CallBinding) => Promise<unknown> = lookupBoth,
) {
  const seen: Array<Array<string>> = []
  const timeouts: Array<number | undefined> = []
  const driver: IsolateDriver = {
    createContext: async ({ bindings, timeout }) => {
      seen.push(Object.keys(bindings).sort())
      timeouts.push(timeout)
      const call: CallBinding = async (name, args) => {
        const binding = bindings[name]
        if (!binding) throw new Error(`No binding ${name}.`)
        return binding.execute(args)
      }
      return {
        execute: async <T>(): Promise<ExecutionResult<T>> => {
          try {
            const value = await program(call)
            // The caller picks T. This stand-in returns what the program returns.
            return { success: true, value: value as T, logs: [] }
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error)
            return {
              success: false,
              error: { name: 'Error', message },
              logs: [],
            }
          }
        },
        dispose: async () => {},
      }
    },
  }
  return { driver, seen, timeouts }
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

/** A server tool marked for code mode, like the tools of `mcp({ codeMode })`. */
function markedTool(name: string, needsApproval = false) {
  return toolDefinition({
    name,
    description: 'A marked tool',
    inputSchema: z.object({}),
    needsApproval,
    metadata: { codeMode: true },
  }).server(async () => name)
}

/** The path that a call of a file tool touches. */
const pathOf = (input: unknown) =>
  typeof input === 'object' &&
  input !== null &&
  'path' in input &&
  typeof input.path === 'string'
    ? [input.path]
    : []

/**
 * File tools with the permissions of the tools of `workspaceTools()`:
 * `read_file` is allowed and safe to run again, and `write_file` asks and
 * is not safe to run again. Both say which path a call touches. Each tool
 * counts its calls.
 */
function fileTools() {
  const counted = (verb: string) =>
    vi.fn(
      async ({ path }: { path: string }, _context?: ToolExecutionContext) =>
        `${verb} ${path}`,
    )
  const read = counted('text of')
  const write = counted('wrote')
  const input = z.object({ path: z.string() })
  const plugin = definePlugin({
    name: 'test/files',
    setup: () => ({
      tools: [
        toolDefinition({
          name: 'read_file',
          description: 'Read a file',
          inputSchema: input,
          replay: 'safe',
        }).server(read),
        toolDefinition({
          name: 'write_file',
          description: 'Write a file',
          inputSchema: input,
        }).server(write),
      ],
      contribute: [
        PermissionRules.item({
          tool: 'read_file',
          decision: 'allow',
          kind: 'read',
        }),
        PermissionRules.item({
          tool: 'write_file',
          decision: 'ask',
          kind: 'edit',
        }),
        PermissionResources.item({
          read_file: { paths: pathOf },
          write_file: { paths: pathOf },
        }),
      ],
    }),
  })
  return { plugin, read, write }
}

/** A program that reads `a.txt`, then writes `b.txt`. */
const readThenWrite = async (call: CallBinding) => ({
  read: await call('external_read_file', { path: 'a.txt' }),
  write: await call('external_write_file', { path: 'b.txt' }),
})

/** A program that writes `b.txt`. */
const writeOnly = (call: CallBinding) =>
  call('external_write_file', { path: 'b.txt' })

/** Opens a session of a harness with `tools` and `plugins`, on a new host. */
async function openSession(options: {
  adapter: AnyTextAdapter
  tools?: ReadonlyArray<AnyTool>
  plugins: ReadonlyArray<HarnessPlugin>
  persistence?: HarnessPersistence
  /** The logger of the host. Default: the console. */
  logger?: Logger
}) {
  const host = createHarnessHost({
    persistence: options.persistence ?? memoryPersistence(),
    logger: options.logger,
  })
  const session = await host.open(
    defineHarness({
      name: 'test/code-mode',
      adapter: options.adapter,
      tools: options.tools ?? [],
      plugins: () => options.plugins,
    }),
    { threadId: 't' },
  )
  return { host, session }
}

/**
 * Opens a session with `fileTools()`, `guard`, and code mode with
 * `include: () => true`. Each program runs `program`.
 */
async function openFiles(options: {
  program: (call: CallBinding) => Promise<unknown>
  turns: Array<Array<StreamChunk>>
  /** The permission plugins. Default: `permissions({ default: 'ask' })`. */
  guard?: ReadonlyArray<HarnessPlugin>
  persistence?: HarnessPersistence
}) {
  const files = fileTools()
  const { adapter } = scripted(options.turns)
  const code = codeMode({
    driver: fakeDriver(options.program).driver,
    include: () => true,
  })
  const guard = options.guard ?? [permissions({ default: 'ask' })]
  const opened = await openSession({
    adapter,
    plugins: [files.plugin, ...guard, code],
    persistence: options.persistence,
  })
  return { ...opened, files }
}

/**
 * `store`, with `setIf` writes that wait until `open` resolves.
 * `permissions()` saves an `always` answer with `setIf`.
 */
function heldWrites(store: MetadataStore, open: Promise<void>) {
  const held: MetadataStore = {
    get: (namespace, key) => store.get(namespace, key),
    set: (namespace, key, value) => store.set(namespace, key, value),
    delete: (namespace, key) => store.delete(namespace, key),
    getVersioned: async (namespace, key) =>
      (await store.getVersioned?.(namespace, key)) ?? null,
    setIf: async (namespace, key, value, revision) => {
      await open
      const written = await store.setIf?.(namespace, key, value, revision)
      return written ?? { ok: false, reason: 'conflict' }
    },
  }
  return held
}

/** Opens a code mode session, sends one message, and returns the first model call. */
async function firstCall(options: {
  tools?: ReadonlyArray<AnyTool>
  plugins: ReadonlyArray<HarnessPlugin>
}) {
  const { adapter, calls } = scripted([textTurn('ok')])
  const { host, session } = await openSession({ adapter, ...options })
  await session.send('hi')
  await host.close()
  return calls[0]
}

/** Opens a code mode session and returns the tool names of the first model call. */
const firstToolNames = async (options: {
  tools?: ReadonlyArray<AnyTool>
  plugins: ReadonlyArray<HarnessPlugin>
}) => toolNames(await firstCall(options))

/** The one open wait of `session`, once it opened. */
async function openWait(session: HarnessSession) {
  await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
  const [wait] = session.snapshot().pendingWaits
  if (!wait) throw new Error('No wait.')
  return wait
}

/** The result of the program of `toolCallId`, as the model got it. */
async function programResult(
  session: HarnessSession,
  toolCallId = 'call-execute_typescript',
) {
  const message = (await session.transcript()).find(
    (each) => each.role === 'tool' && each.toolCallId === toolCallId,
  )
  const content = message?.content
  const result: unknown =
    typeof content === 'string' ? JSON.parse(content) : content
  return result
}

/**
 * Runs `program` on a first host until a call waits for the approval of
 * the user. Then `beforeStop` runs, and the first host stops, as for a
 * deploy. A second host opens the session on the same stores, and the turn
 * goes on there.
 */
async function stopAndReopen(options: {
  files: ReturnType<typeof fileTools>
  program: (call: CallBinding) => Promise<unknown>
  beforeStop?: (session: HarnessSession, waitId: string) => Promise<void>
  /** The permission plugin. Default: `permissions()`. */
  guard?: HarnessPlugin
}) {
  const persistence = memoryPersistence()
  const plugins = [
    options.files.plugin,
    options.guard ?? permissions(),
    codeMode({
      driver: fakeDriver(options.program).driver,
      include: () => true,
    }),
  ]
  const first = await openSession({
    adapter: scripted([codeTurn('return await read_then_write()')]).adapter,
    plugins,
    persistence,
  })
  void first.session.send('go', { inputId: 'in-1' }).then(
    () => {},
    () => {},
  )
  const wait = await openWait(first.session)
  await options.beforeStop?.(first.session, wait.waitId)
  await first.host.close({ recoverable: true })
  const next = await openSession({
    adapter: scripted([textTurn('done')]).adapter,
    plugins,
    persistence,
  })
  return { ...next, waitId: wait.waitId }
}

/**
 * The first call of `tool` runs until the run stops. Resolves when it
 * started.
 */
function hangFirst(tool: ReturnType<typeof fileTools>['write']) {
  return new Promise<void>((started) => {
    tool.mockImplementationOnce(
      (_args, context) =>
        new Promise<string>((_resolve, reject) => {
          started()
          context?.abortSignal?.addEventListener(
            'abort',
            () => reject(new Error('stopped')),
            { once: true },
          )
        }),
    )
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('codeMode', () => {
  it('moves safe tools, including discovered ones, behind execute_typescript', async () => {
    const { driver, seen } = fakeDriver()
    const { adapter, calls } = scripted([
      codeTurn('return { a: await external_lookup({ q: "x" }) }'),
      textTurn('done'),
    ])
    const { host, session } = await openSession({
      adapter,
      tools: [tools.lookup, tools.remove, tools.askUser],
      plugins: [writes, notion, codeMode({ driver })],
    })
    const turn = await session.send('look it up')
    expect(turn.text).toBe('done')

    expect(toolNames(calls[0])).toEqual([
      'remove',
      'ask_user',
      'write_file',
      'execute_typescript',
    ])
    const prompts = promptsOf(calls[0])
    expect(prompts).toContain('external_lookup')
    expect(prompts).toContain('external_notion_search')
    expect(prompts).not.toContain('external_write_file')
    // Only safe tools moved, so no call in a program checks the rules.
    expect(prompts).not.toContain('Permission checks')

    expect(seen[0]).toEqual(['external_lookup', 'external_notion_search'])
    expect(lookup).toHaveBeenCalledTimes(1)
    expect(notionSearch).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(calls[1]?.messages)).toContain('page')
    await host.close()
  })

  it('uses include to pick the tools, and leaves the list alone when none match', async () => {
    const { driver } = fakeDriver()
    const picked = await firstCall({
      tools: [tools.lookup, tools.notionSearch],
      plugins: [
        codeMode({ driver, include: (tool) => tool.name === 'lookup' }),
      ],
    })
    expect(toolNames(picked)).toEqual(['notion_search', 'execute_typescript'])

    const none = await firstCall({
      tools: [tools.remove],
      plugins: [codeMode({ driver })],
    })
    expect(toolNames(none)).toEqual(['remove'])
    expect(promptsOf(none)).not.toContain('execute_typescript')
  })

  it('with lazy, lists only the tool names and gives signatures on discover_tools', async () => {
    const { driver } = fakeDriver()
    const { adapter, calls } = scripted([
      callTurn('discover_tools', { toolNames: ['external_lookup'] }),
      textTurn('found it'),
    ])
    const { host, session } = await openSession({
      adapter,
      tools: [tools.lookup, tools.remove],
      plugins: [codeMode({ driver, lazy: true })],
    })
    expect((await session.send('what can you call?')).text).toBe('found it')

    expect(toolNames(calls[0])).toEqual([
      'remove',
      'execute_typescript',
      'discover_tools',
    ])
    // The prompt names the tool, but its input shape comes from discovery.
    const prompts = promptsOf(calls[0])
    expect(prompts).toContain('Discoverable APIs')
    expect(prompts).toContain('external_lookup')
    expect(prompts).not.toContain('q: string')
    expect(JSON.stringify(calls[1]?.messages)).toContain('q: string')
    await host.close()
  })

  it('gives tools with names that are not identifiers a safe name', async () => {
    const { driver, seen } = fakeDriver((call) =>
      call('external_web_search', {}),
    )
    const named = (name: string, reply: string) =>
      toolDefinition({
        name,
        description: 'A tool',
        inputSchema: z.object({}),
      }).server(async () => reply)
    const { adapter, calls } = scripted([codeTurn('return 1'), textTurn('ok')])
    const { host, session } = await openSession({
      adapter,
      tools: [
        named('web-search', 'from web-search'),
        named('web_search', 'from web_search'),
        named('2fa', 'code'),
      ],
      plugins: [codeMode({ driver })],
    })
    await session.send('search')
    // web_search clashes with web-search after the rename, so it stays direct.
    expect(toolNames(calls[0])).toEqual(['web_search', 'execute_typescript'])
    expect(seen[0]).toEqual(['external__2fa', 'external_web_search'])
    expect(JSON.stringify(calls[1]?.messages)).toContain('from web-search')
    await host.close()
  })

  it('moves a tool that a rule asks for when include picks it, keeps a tool that needs approval or that a rule denies, and warns once to the host logger', async () => {
    const consoleWarn = vi.spyOn(console, 'warn')
    const warn = vi.fn<Logger['warn']>()
    const denyDocs = definePlugin({
      name: 'test/deny-docs',
      setup: () => ({
        contribute: [
          PermissionRules.item({ tool: 'docs_deny', decision: 'deny' }),
          PermissionRules.item({ tool: 'docs_ask', decision: 'ask' }),
        ],
      }),
    })
    const { adapter, calls } = scripted([textTurn('one'), textTurn('two')])
    const { host, session } = await openSession({
      adapter,
      tools: [
        tools.lookup,
        tools.remove,
        toolDefinition({
          name: 'docs_deny',
          description: 'A tool that a rule denies',
          inputSchema: z.object({}),
        }).server(async () => 'denied'),
        toolDefinition({
          name: 'docs_ask',
          description: 'A tool that a rule asks for',
          inputSchema: z.object({}),
        }).server(async () => 'asked'),
      ],
      plugins: [
        denyDocs,
        codeMode({ driver: fakeDriver().driver, include: () => true }),
      ],
      logger: { debug: () => {}, info: () => {}, warn, error: () => {} },
    })
    await session.send('first')
    await session.send('second')
    await host.close()

    for (const call of calls) {
      expect(toolNames(call)).toEqual([
        'remove',
        'docs_deny',
        'execute_typescript',
      ])
    }
    // Each call of docs_ask in a program gets the decision of a direct call.
    expect(promptsOf(calls[0])).toContain(
      'These functions check the permission rules before they run, as a direct tool call does: `external_docs_ask`.',
    )
    // One warning for each kept tool, not one for each turn.
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      '[@tanstack/ai-code-mode] include picked the tool "remove", but it needs approval, or the rules deny it. Such a tool stays a normal tool call.',
      '[@tanstack/ai-code-mode] include picked the tool "docs_deny", but it needs approval, or the rules deny it. Such a tool stays a normal tool call.',
    ])
    expect(consoleWarn).not.toHaveBeenCalled()
  })

  it('moves a marked tool that include does not pick, unless a rule or an approval stops it', async () => {
    const rules = definePlugin({
      name: 'test/marked-rules',
      setup: () => ({
        contribute: [
          PermissionRules.item({ tool: 'docs_allowed', decision: 'allow' }),
          PermissionRules.item({ tool: 'docs_ask', decision: 'ask' }),
          PermissionRules.item({ tool: 'docs_deny', decision: 'deny' }),
        ],
      }),
    })
    const names = await firstToolNames({
      tools: [
        markedTool('docs_allowed'),
        markedTool('docs_ask'),
        markedTool('docs_deny'),
        markedTool('docs_write', true),
      ],
      plugins: [
        rules,
        codeMode({ driver: fakeDriver().driver, include: () => false }),
      ],
    })
    expect(names).toEqual([
      'docs_ask',
      'docs_deny',
      'docs_write',
      'execute_typescript',
    ])
  })

  it('keeps a tool that a rule of permissions() asks for as a tool call', async () => {
    const names = await firstToolNames({
      tools: [
        markedTool('docs_search'),
        markedTool('notes_search'),
        tools.lookup,
      ],
      plugins: [
        permissions({
          rules: [
            { tool: 'docs_*', decision: 'ask' },
            { tool: 'lookup', decision: 'ask' },
          ],
        }),
        codeMode({ driver: fakeDriver().driver }),
      ],
    })
    // The default pick moves no tool that asks, so both tools stay.
    expect(names).toEqual(['docs_search', 'lookup', 'execute_typescript'])
  })

  it.each(['before', 'after'])(
    'keeps a tool with no rule as a tool call when permissions() asks by default, mounted %s code mode',
    async (order) => {
      const guard = permissions({
        default: 'ask',
        rules: [{ tool: 'lookup', decision: 'allow' }],
      })
      const code = codeMode({ driver: fakeDriver().driver })
      const names = await firstToolNames({
        tools: [markedTool('docs_search'), tools.lookup],
        plugins: order === 'before' ? [guard, code] : [code, guard],
      })
      expect(names).toEqual(['docs_search', 'execute_typescript'])
    },
  )

  it('keeps a tool that a rule of permissions() asks for, when a later plugin allows it', async () => {
    const later = definePlugin({
      name: 'test/later-allow',
      setup: () => ({
        contribute: [
          PermissionRules.item({ tool: 'docs_search', decision: 'allow' }),
        ],
      }),
    })
    const names = await firstToolNames({
      tools: [markedTool('docs_search'), tools.lookup],
      plugins: [
        permissions({ rules: [{ tool: 'docs_search', decision: 'ask' }] }),
        later,
        codeMode({ driver: fakeDriver().driver }),
      ],
    })
    // permissions() checks its own rules last, so the call would ask.
    expect(names).toEqual(['docs_search', 'execute_typescript'])
  })

  it('keeps a tool that declares permission resources as a tool call', async () => {
    const resources = definePlugin({
      name: 'test/resources',
      setup: () => ({
        contribute: [
          PermissionResources.item({ read_file: { paths: () => ['a.txt'] } }),
        ],
      }),
    })
    const names = await firstToolNames({
      tools: [tools.lookup, markedTool('read_file')],
      plugins: [resources, codeMode({ driver: fakeDriver().driver })],
    })
    expect(names).toEqual(['read_file', 'execute_typescript'])
  })

  it.each(['default', 'plan'])(
    'runs a program with no question when permissions() asks by default, in %s mode',
    async (mode) => {
      const { driver, seen } = fakeDriver()
      const { adapter } = scripted([codeTurn('return 1'), textTurn('done')])
      const { host, session } = await openSession({
        adapter,
        tools: [tools.lookup],
        plugins: [
          permissions({
            default: 'ask',
            rules: [
              { tool: 'lookup', decision: 'allow' },
              { tool: 'notion_search', decision: 'allow' },
            ],
          }),
          notion,
          codeMode({ driver }),
        ],
      })
      if (mode === 'plan')
        await session.runCommand({ name: 'mode', input: 'plan' })
      expect((await session.send('look it up')).text).toBe('done')
      // The program ran: a question would wait, and plan mode would deny it.
      expect(seen).toHaveLength(1)
      await host.close()
    },
  )

  it('asks before a program when a rule of the user asks for execute_typescript', async () => {
    const { driver, seen } = fakeDriver()
    const { adapter } = scripted([codeTurn('return 1'), textTurn('done')])
    const { host, session } = await openSession({
      adapter,
      tools: [tools.lookup],
      plugins: [
        permissions({
          rules: [{ tool: 'execute_typescript', decision: 'ask' }],
        }),
        notion,
        codeMode({ driver }),
      ],
    })
    // The approval is a turn wait at the boundary: the turn stops, and a
    // `resolve` answers it.
    void session.send('look it up')
    const wait = await openWait(session)
    expect(wait.kind).toBe('approval')
    expect(wait.message).toContain('execute_typescript')
    const inputId = `answer:${wait.waitId}`
    await session.resolve({
      resume: [
        { interruptId: wait.waitId, status: 'resolved', payload: 'reject' },
      ],
      inputId,
    })
    await session.settled({ inputId })
    const messages = await session.transcript()
    expect(messages.at(-1)).toMatchObject({
      role: 'assistant',
      content: 'done',
    })
    expect(seen).toEqual([])
    await host.close()
  })

  it('drops the prompt of the last turn when the pick fails', async () => {
    const { driver } = fakeDriver()
    const { adapter, calls } = scripted([textTurn('one'), textTurn('two')])
    let isBroken = false
    const { host, session } = await openSession({
      adapter,
      tools: [tools.lookup],
      plugins: [
        codeMode({
          driver,
          include: () => {
            if (isBroken) throw new Error('The pick failed.')
            return true
          },
        }),
      ],
    })
    await session.send('first')
    expect(promptsOf(calls[0])).toContain('external_lookup')

    isBroken = true
    await session.send('second')
    // The harness keeps the tool list as it was, without the old prompt.
    expect(toolNames(calls[1])).toEqual(['lookup'])
    expect(promptsOf(calls[1])).not.toContain('external_lookup')
    await host.close()
  })
})

describe('codeMode with tools that have permission checks', () => {
  /** The coding tools of `workspaceTools()` for the model of `scripted`. */
  const CODING_TOOLS = [
    'read_file',
    'write_file',
    'edit_file',
    'list_files',
    'grep',
    'bash',
    'webfetch',
  ]

  it('moves the coding tools that include picks, and the prompt says that a call can throw', async () => {
    const call = await firstCall({
      plugins: [
        workspaceTools({ root: tmpdir() }),
        permissions(),
        codeMode({ driver: fakeDriver().driver, include: () => true }),
      ],
    })
    expect(toolNames(call)).toEqual(['execute_typescript'])
    const prompts = promptsOf(call)
    for (const name of CODING_TOOLS) {
      expect(prompts).toContain(`external_${name}`)
    }
    expect(prompts).toContain(
      'When the user refuses the call or a rule denies it, the call throws an error that says why.',
    )
  })

  it('keeps the coding tools that edit or run a command as tool calls in plan mode', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { adapter, calls } = scripted([textTurn('ok')])
    const { host, session } = await openSession({
      adapter,
      plugins: [
        workspaceTools({ root: tmpdir() }),
        permissions(),
        codeMode({ driver: fakeDriver().driver, include: () => true }),
      ],
    })
    await session.runCommand({ name: 'mode', input: 'plan' })
    await session.send('plan it')
    // Plan mode denies edits, commands, and every call that would ask.
    expect(toolNames(calls[0])).toEqual([
      'write_file',
      'edit_file',
      'bash',
      'webfetch',
      'execute_typescript',
    ])
    expect(promptsOf(calls[0])).toContain('external_read_file')
    expect(promptsOf(calls[0])).not.toContain('external_write_file')
    await host.close()
  })

  it('runs a call that the rules allow, with no question', async () => {
    const { host, session, files } = await openFiles({
      program: (call) => call('external_read_file', { path: 'a.txt' }),
      turns: [
        codeTurn('return await external_read_file({ path: "a.txt" })'),
        textTurn('done'),
      ],
    })
    expect((await session.send('read it')).text).toBe('done')
    expect(await programResult(session)).toEqual({
      success: true,
      result: 'text of a.txt',
      logs: [],
    })
    expect(files.read).toHaveBeenCalledTimes(1)
    await host.close()
  })

  it('runs a call with no question when permissions() is not mounted, as a direct call does', async () => {
    const { host, session, files } = await openFiles({
      program: writeOnly,
      turns: [codeTurn('return await write_it()'), textTurn('done')],
      guard: [],
    })
    expect((await session.send('write it')).text).toBe('done')
    expect(await programResult(session)).toEqual({
      success: true,
      result: 'wrote b.txt',
      logs: [],
    })
    expect(files.write).toHaveBeenCalledTimes(1)
    await host.close()
  })

  it('throws in the program when the rules deny a call', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { host, session, files } = await openFiles({
      program: (call) => call('external_read_file', { path: '.env' }),
      turns: [
        codeTurn('return await external_read_file({ path: ".env" })'),
        textTurn('done'),
      ],
    })
    await session.runCommand({ name: 'mode', input: 'plan' })
    await session.send('read the env file')
    // A .env file asks, and plan mode denies each call that would ask, as
    // for a direct call.
    expect(await programResult(session)).toMatchObject({
      success: false,
      error: { message: 'This tool is not allowed in plan mode.' },
    })
    expect(files.read).not.toHaveBeenCalled()
    await host.close()
  })

  it('waits for the approval of a call as a question, and runs the call on once', async () => {
    const { host, session, files } = await openFiles({
      program: writeOnly,
      turns: [codeTurn('return await write_it()'), textTurn('done')],
    })
    const turn = session.send('write it')
    const wait = await openWait(session)
    // `default: 'ask'` asks for no program: only the call inside asks. The
    // wait is named for the first call and the hash of its arguments.
    expect(wait).toMatchObject({
      waitId: expect.stringMatching(
        /^ask:call-execute_typescript:approve:1:[0-9a-f]+$/,
      ),
      kind: 'question',
      message:
        'Allow write_file {"path":"b.txt"}? Answer once, always, or reject.',
    })
    expect(files.write).not.toHaveBeenCalled()

    expect(
      await session.answer({ questionId: wait.waitId, value: 'once' }),
    ).toMatchObject({ status: 'accepted' })
    expect((await turn).text).toBe('done')
    expect(await programResult(session)).toEqual({
      success: true,
      result: 'wrote b.txt',
      logs: [],
    })
    expect(files.write).toHaveBeenCalledTimes(1)
    await host.close()
  })

  it('saves an always answer, so the same call in the next program runs with no question', async () => {
    const { host, session, files } = await openFiles({
      program: writeOnly,
      turns: [
        codeTurn('return await write_it()', 'call-1'),
        textTurn('one'),
        codeTurn('return await write_it()', 'call-2'),
        textTurn('two'),
      ],
    })
    const first = session.send('write it')
    const wait = await openWait(session)
    await session.answer({ questionId: wait.waitId, value: 'always' })
    await first

    expect((await session.send('write it again')).text).toBe('two')
    expect(await programResult(session, 'call-2')).toEqual({
      success: true,
      result: 'wrote b.txt',
      logs: [],
    })
    expect(files.write).toHaveBeenCalledTimes(2)
    await host.close()
  })

  it('throws the message of a reject in the program, and does not run the call', async () => {
    const { host, session, files } = await openFiles({
      program: writeOnly,
      turns: [codeTurn('return await write_it()'), textTurn('done')],
    })
    const turn = session.send('write it')
    const wait = await openWait(session)
    await session.answer({
      questionId: wait.waitId,
      value: { answer: 'reject', message: 'Write c.txt instead.' },
    })
    await turn
    expect(await programResult(session)).toMatchObject({
      success: false,
      error: { message: 'Write c.txt instead.' },
    })
    expect(files.write).not.toHaveBeenCalled()
    await host.close()
  })

  it('does not run a call whose approval comes after the program ended', async () => {
    let endProgram = () => {}
    const ended = new Promise<void>((resolve) => {
      endProgram = resolve
    })
    const { host, session, files } = await openFiles({
      // The call waits for the approval, and the program ends first, as on
      // a timeout.
      program: async (call) => {
        writeOnly(call).catch(() => {})
        await ended
        throw new Error('Execution timed out')
      },
      turns: [codeTurn('return await write_it()'), textTurn('done')],
    })
    const turn = session.send('write it')
    const wait = await openWait(session)
    endProgram()
    await turn

    // The end of the program ended the wait, so the answer comes too late.
    await waitFor(() => expect(session.snapshot().pendingWaits).toEqual([]))
    expect(
      await session.answer({ questionId: wait.waitId, value: 'once' }),
    ).toMatchObject({ status: 'rejected' })
    expect(files.write).not.toHaveBeenCalled()
    await host.close()
  })

  it('does not run a call when the program ends while its approval is applied', async () => {
    let openWrites = () => {}
    const writesOpen = new Promise<void>((resolve) => {
      openWrites = resolve
    })
    let endProgram = () => {}
    const ended = new Promise<void>((resolve) => {
      endProgram = resolve
    })
    let pending: Promise<unknown> | undefined
    const { log, metadata } = memoryPersistence().stores
    const { host, session, files } = await openFiles({
      program: async (call) => {
        pending = writeOnly(call)
        pending.catch(() => {})
        await ended
        throw new Error('Execution timed out')
      },
      turns: [codeTurn('return await write_it()'), textTurn('done')],
      // An `always` answer saves a rule. The save waits for `openWrites`.
      persistence: {
        stores: { log, metadata: heldWrites(metadata, writesOpen) },
      },
    })
    const turn = session.send('write it')
    const wait = await openWait(session)
    await session.answer({ questionId: wait.waitId, value: 'always' })
    // The program ends while the answer is applied.
    endProgram()
    await turn
    openWrites()

    await expect(pending).rejects.toThrow(
      'The program ended, so this call of write_file did not run.',
    )
    expect(files.write).not.toHaveBeenCalled()
    await host.close()
  })

  it('keeps the moved tools in the tool list with directCalls keep, until the setting changes', async () => {
    const files = fileTools()
    const { adapter, calls } = scripted([textTurn('one'), textTurn('two')])
    const { host, session } = await openSession({
      adapter,
      plugins: [
        files.plugin,
        permissions(),
        codeMode({
          driver: fakeDriver().driver,
          include: () => true,
          directCalls: 'keep',
        }),
      ],
    })
    await session.send('first')
    expect(toolNames(calls[0])).toEqual([
      'read_file',
      'write_file',
      'execute_typescript',
    ])
    expect(promptsOf(calls[0])).toContain('external_write_file')

    expect(
      await session.setPluginSetting({ key: 'directCalls', value: 'remove' }),
    ).toMatchObject({ status: 'accepted' })
    await session.send('second')
    expect(toolNames(calls[1])).toEqual(['execute_typescript'])
    await host.close()
  })

  it.each([
    {
      when: 'a tool with checks moved',
      options: { include: () => true },
      timeout: 600_000,
    },
    {
      when: 'the user set it',
      options: { include: () => true, timeout: 5_000 },
      timeout: 5_000,
    },
    { when: 'only safe tools moved', options: {}, timeout: 30_000 },
  ])(
    'gives a program the timeout $timeout when $when',
    async ({ options, timeout }) => {
      const files = fileTools()
      const { driver, timeouts } = fakeDriver(async () => 'ran')
      const { adapter } = scripted([codeTurn('return "ran"'), textTurn('done')])
      const { host, session } = await openSession({
        adapter,
        tools: [tools.lookup],
        plugins: [
          files.plugin,
          permissions(),
          codeMode({ driver, ...options }),
        ],
      })
      await session.send('run it')
      expect(timeouts).toEqual([timeout])
      await host.close()
    },
  )

  it('runs a program again on the next host after a stop, and a call that ended before does not run again', async () => {
    const files = fileTools()
    const { host, session, waitId } = await stopAndReopen({
      files,
      program: readThenWrite,
    })
    expect(files.read).toHaveBeenCalledTimes(1)

    // The program runs again, and waits for the same approval.
    const wait = await openWait(session)
    expect(wait.waitId).toBe(waitId)
    await session.answer({ questionId: wait.waitId, value: 'once' })
    expect(await session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(await programResult(session)).toEqual({
      success: true,
      result: { read: 'text of a.txt', write: 'wrote b.txt' },
      logs: [],
    })
    expect(files.read).toHaveBeenCalledTimes(1)
    expect(files.write).toHaveBeenCalledTimes(1)
    await host.close()
  })

  it('does not run a call again that a stop cut while it ran', async () => {
    const files = fileTools()
    const writing = hangFirst(files.write)
    const { host, session } = await stopAndReopen({
      files,
      program: readThenWrite,
      beforeStop: async (first, waitId) => {
        await first.answer({ questionId: waitId, value: 'once' })
        await writing
      },
    })
    expect(await session.settled({ inputId: 'in-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(await programResult(session)).toMatchObject({
      success: false,
      error: {
        message:
          'This call was cut by a stop and does not run again. The tool may or may not have run. Check before you retry.',
      },
    })
    expect(files.write).toHaveBeenCalledTimes(1)
    await host.close()
  })

  it('does not give a call the kept result of another call when the program changed after a stop', async () => {
    const files = fileTools()
    const writing = hangFirst(files.write)
    let runs = 0
    const { host, session } = await stopAndReopen({
      files,
      // The second run of the program reads another file.
      program: async (call) => {
        runs += 1
        const path = runs === 1 ? 'a.txt' : 'z.txt'
        return {
          read: await call('external_read_file', { path }),
          write: await call('external_write_file', { path: 'b.txt' }),
        }
      },
      beforeStop: async (first, waitId) => {
        await first.answer({ questionId: waitId, value: 'once' })
        await writing
      },
    })
    await session.settled({ inputId: 'in-1' })
    expect(await programResult(session)).toMatchObject({
      success: false,
      error: {
        message:
          'The program changed after a stop: call 1 of read_file has other arguments now, so it did not run.',
      },
    })
    expect(files.read).toHaveBeenCalledTimes(1)
    await host.close()
  })

  it('asks again when the program changed after a stop, so an answer never approves another call', async () => {
    const files = fileTools()
    // read_file is safe to run again, so the log keeps no start of it.
    const reading = hangFirst(files.read)
    let runs = 0
    const { host, session, waitId } = await stopAndReopen({
      files,
      guard: permissions({ rules: [{ tool: 'read_file', decision: 'ask' }] }),
      // The second run of the program reads another file.
      program: (call) => {
        runs += 1
        const path = runs === 1 ? 'a.txt' : 'z.txt'
        return call('external_read_file', { path })
      },
      beforeStop: async (first, firstWaitId) => {
        await first.answer({ questionId: firstWaitId, value: 'once' })
        await reading
      },
    })
    // The answer of the first run was for a.txt. The call of z.txt asks.
    const wait = await openWait(session)
    expect(wait.waitId).not.toBe(waitId)
    expect(wait.message).toBe(
      'Allow read_file {"path":"z.txt"}? Answer once, always, or reject.',
    )
    expect(files.read).toHaveBeenCalledTimes(1)
    await host.close()
  })
})
