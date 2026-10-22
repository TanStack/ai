import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import {
  EventType,
  defineAgent,
  defineChatMiddleware,
  defineInterrupt,
  toolDefinition,
} from '@tanstack/ai'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  logIdOf,
  membersOnly,
} from '@tanstack/ai-harness'
import { memoryLogStore, memoryPersistence } from '@tanstack/ai-persistence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createHarnessMcpServer } from '../src/harness'
import type {
  AnyTextAdapter,
  InterruptBoundaryPhase,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type { AnyHarness, HarnessSession } from '@tanstack/ai-harness'
import type { HarnessMcpServerOptions } from '../src/harness'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const serverUrl = new URL('https://harness.example.com/mcp')
const now = () => Date.now()

const pendingShape = z.object({
  interrupts: z.array(z.object({ id: z.string() })),
  questions: z.array(z.object({ id: z.string() })),
})

/** The response schema of an approval for `remove`, which takes `{ path }`. */
const removeApprovalSchema = {
  oneOf: [
    {
      type: 'object',
      properties: {
        approved: { const: true },
        // zod writes the input schema, so extra keys stay allowed.
        editedArgs: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          properties: { path: { type: 'string' } },
          required: ['path'],
        },
      },
      required: ['approved'],
      additionalProperties: false,
    },
    {
      type: 'object',
      properties: { approved: { const: false } },
      required: ['approved'],
      additionalProperties: false,
    },
  ],
}

/** A generic interrupt that asks for a review note. */
const review = defineInterrupt({
  id: 'review-plan',
  responseSchema: z.object({ note: z.string() }),
})

const reviewSchema = {
  type: 'object',
  properties: { note: { type: 'string' } },
  required: ['note'],
}

const questionShape = z.object({ questionId: z.string() })

const controlTools = [
  'answer',
  'approve',
  'cancel',
  'chat',
  'reject',
  'resolve',
  'status',
  'steer',
]

function textTurn(text: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: `m-${text}`,
      role: 'assistant',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: `m-${text}`,
      delta: text,
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: `m-${text}`,
      timestamp: now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason: 'stop' } },
    },
  ]
}

/** One model call that fails with `message`. */
function errorTurn(message: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    { type: EventType.RUN_ERROR, message, timestamp: now() },
  ]
}

/** One model call that asks to remove each path, one tool call per path. */
function removeTurn(...paths: Array<string>) {
  return toolCallTurn(
    paths.map((path) => ({ name: 'remove', input: { path } })),
  )
}

/** One model call that makes each tool call. */
function toolCallTurn(
  toolCalls: Array<{ name: string; input: unknown }>,
): Array<StreamChunk> {
  const calls = toolCalls.flatMap(
    ({ name, input }, index): Array<StreamChunk> => [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: `call-${index}`,
        toolCallName: name,
        timestamp: now(),
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: `call-${index}`,
        delta: JSON.stringify(input),
        timestamp: now(),
      },
      {
        type: EventType.TOOL_CALL_END,
        toolCallId: `call-${index}`,
        timestamp: now(),
      },
    ],
  )
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    ...calls,
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason: 'tool_calls' } },
    },
  ]
}

function deferred() {
  let resolve: (value: void) => void = () => {}
  const promise = new Promise<void>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

/**
 * A point that work reaches and then waits at. `reached` resolves when the
 * work arrives. The work continues after `release()`.
 */
function hold() {
  const reached = deferred()
  const released = deferred()
  return {
    reached: reached.promise,
    release: () => released.resolve(),
    async wait() {
      reached.resolve()
      await released.promise
    },
  }
}

/** A model call that waits at its `hold`, then streams `chunks`. */
function heldTurn(chunks: Array<StreamChunk>) {
  return { hold: hold(), chunks }
}

type ScriptedTurn = Array<StreamChunk> | ReturnType<typeof heldTurn>

async function* play(turn: ScriptedTurn) {
  if (Array.isArray(turn)) {
    yield* turn
    return
  }
  await turn.hold.wait()
  yield* turn.chunks
}

/** A model that plays `turns` in order and keeps the messages of each call. */
function scripted(turns: Array<ScriptedTurn>) {
  const calls: Array<Array<ModelMessage>> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'mock',
    // `~types` holds types only. Its values are never read, so they are casts.
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
      const turn = turns[calls.length] ?? textTurn('')
      calls.push(options.messages)
      return play(turn)
    },
  }
  return { adapter, calls }
}

function userTexts(messages: Array<ModelMessage> | undefined) {
  return (messages ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
}

/** The MCP result of a tool call that threw an error with `message`. */
function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

/** The ids of the interrupts that wait, from a tool result. */
function interruptIds(result: { structuredContent?: unknown }) {
  return pendingShape
    .parse(result.structuredContent)
    .interrupts.map(({ id }) => id)
}

/**
 * A middleware that stops the first run of a turn at `phase` with a
 * `review` interrupt. `notes` keeps each answer that it gets.
 */
function reviewAt(phase: InterruptBoundaryPhase) {
  const notes: Array<unknown> = []
  const middleware = defineChatMiddleware({
    onInterruptBoundary(ctx) {
      if (ctx.parentRunId || ctx.phase !== phase) return
      return {
        interrupts: [
          review.interrupt({
            key: 'plan',
            reason: 'review',
            message: 'Review the plan',
          }),
        ],
      }
    },
    onInterruptResolution(_ctx, resolutions) {
      for (const resolution of resolutions.for(review)) {
        if (resolution.status === 'resolved') notes.push(resolution.response)
      }
      return { toolResume: 'continue' }
    },
  })
  return { middleware, notes }
}

/** Waits until `session` asks a question, then returns its id. */
async function nextQuestionId(session: HarnessSession) {
  for await (const { event } of session.events()) {
    const isQuestion =
      event.type === EventType.CUSTOM && event.name === HARNESS_EVENTS.question
    if (isQuestion) return questionShape.parse(event.value).questionId
  }
  throw new Error('The session closed before it asked a question')
}

const pricer = defineAgent({
  name: 'pricer',
  description: 'Prices a vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => `${ctx.input.vendor}: twelve dollars`,
})

const broken = defineAgent({
  name: 'broken',
  description: 'Always fails',
  run: async () => {
    throw new Error('The price list is gone.')
  },
})

const commands = definePlugin({
  name: 'test/commands',
  setup: () => ({
    commands: {
      'connect:notion': defineCommand({
        description: 'Sign in to Notion',
        run: () => 'Connected to Notion.',
      }),
      'release/v2.1-beta': defineCommand({
        description: 'Release the beta',
        run: () => 'Released.',
      }),
      confirm: defineCommand({
        description: 'Ask first',
        run: async (_input, { step }) => {
          const sure = await step.ask({
            name: 'sure',
            message: 'Really?',
            schema: { type: 'boolean' },
          })
          return sure === true ? 'Confirmed.' : 'Stopped.'
        },
      }),
      greet: defineCommand({
        description: 'Greet a person',
        input: z.object({ name: z.string() }),
        run: (input) => `Hello, ${input.name}.`,
      }),
      fail: defineCommand({
        description: 'Always fails',
        run: () => {
          throw new Error('Notion is down.')
        },
      }),
    },
  }),
})

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

type ServerOptions = Omit<HarnessMcpServerOptions, 'host' | 'harness'>

async function serve(harness: AnyHarness, options: ServerOptions = {}) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  cleanups.push(() => host.close())
  const server = await createHarnessMcpServer({
    host,
    harness,
    openAccess: true,
    ...options,
  })
  return { server, host }
}

const olga = { id: 'olga', tenantId: 'acme' }
const bea = { id: 'bea', tenantId: 'acme' }
const cid = { id: 'cid', tenantId: 'acme' }
const users = new Map([olga, bea, cid].map((user) => [user.id, user]))

/** A membersOnly() host whose users come from the `x-user` header. */
function accessHost() {
  const host = createHarnessHost({
    persistence: memoryPersistence(),
    access: {
      getUser: ({ request }) =>
        users.get(request.headers.get('x-user') ?? '') ?? null,
      rules: membersOnly(),
    },
  })
  cleanups.push(() => host.close())
  return host
}

/**
 * A harness on an MCP server. With `reviewAt`, a middleware stops the turn at
 * that phase with a `review` interrupt.
 */
async function harnessServer(
  turns: Array<ScriptedTurn>,
  options: ServerOptions & { reviewAt?: InterruptBoundaryPhase } = {},
) {
  const { reviewAt: phase, ...serverOptions } = options
  const model = scripted(turns)
  const removed: Array<string> = []
  const remove = toolDefinition({
    name: 'remove',
    description: 'Remove a file',
    needsApproval: true,
    inputSchema: z.object({ path: z.string() }),
  }).server(async ({ path }) => {
    removed.push(path)
    return `removed ${path}`
  })
  // No `.server()`: the client runs it and sends the output.
  const pickColor = toolDefinition({
    name: 'pick_color',
    description: 'Ask the user for a color',
    inputSchema: z.object({ hint: z.string() }),
    outputSchema: z.object({ color: z.string() }),
  })
  const reviewer = phase === undefined ? undefined : reviewAt(phase)
  const agentHold = hold()
  const waiter = defineAgent({
    name: 'waiter',
    description: 'Waits until the test releases it',
    run: async () => {
      await agentHold.wait()
      return 'Done waiting.'
    },
  })
  const harness = defineHarness({
    name: 'test/mcp-harness',
    adapter: model.adapter,
    tools: [remove, pickColor],
    agents: [pricer, broken, waiter],
    expose: {
      agents: ['pricer', 'broken', 'waiter'],
      commands: [
        'confirm',
        'connect:notion',
        'fail',
        'greet',
        'release/v2.1-beta',
      ],
    },
    plugins: () => [commands],
    ...(reviewer === undefined
      ? {}
      : { middleware: [reviewer.middleware], interrupts: [review] }),
  })
  const { server, host } = await serve(harness, serverOptions)
  const session = () => host.open(harness, { threadId: 'main' })
  return {
    server,
    session,
    removed,
    notes: reviewer?.notes ?? [],
    calls: model.calls,
    agentHold,
  }
}

type ElicitReply =
  | { action: 'accept'; content: { value: string } }
  | { action: 'decline' }

function accepted(value: string): ElicitReply {
  return { action: 'accept', content: { value } }
}

/**
 * A real MCP client on `server.fetch`. With `reply`, the client supports
 * elicitation and gives that reply to every question (spec 2025 sessions
 * only). Without it, the client speaks spec 2026 and has no elicitation.
 * `user` goes in the `x-user` header of each request.
 */
async function connect(
  server: { fetch: (request: Request) => Promise<Response> },
  options: { reply?: ElicitReply; user?: string } = {},
) {
  const { reply, user } = options
  const client = new Client(
    { name: 'tester', version: '1.0.0' },
    reply === undefined
      ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      : { capabilities: { elicitation: { form: {} } } },
  )
  const asked: Array<string> = []
  if (reply !== undefined) {
    client.setRequestHandler('elicitation/create', async (request) => {
      asked.push(request.params.message)
      return reply
    })
  }
  const transport = new StreamableHTTPClientTransport(serverUrl, {
    fetch: async (input, init) => server.fetch(new Request(input, init)),
    ...(user === undefined
      ? {}
      : { requestInit: { headers: { 'x-user': user } } }),
  })
  await client.connect(transport)
  cleanups.push(() => client.close())
  return { client, asked }
}

describe('createHarnessMcpServer', () => {
  it('holds no session after the start or after a tool call', async () => {
    // A session that no handle holds closes at once when it is idle.
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      lifecycle: { closeIdleSessionsAfterMs: 0 },
    })
    cleanups.push(() => host.close())
    const harness = defineHarness({
      name: 'test/mcp-handles',
      adapter: scripted([]).adapter,
    })
    const isOpen = () => host.isOpen(harness, { threadId: 'main' })
    const server = await createHarnessMcpServer({
      host,
      harness,
      openAccess: true,
    })
    // The server read the agents and the commands of the session.
    expect(isOpen()).toBe(false)
    const { client } = await connect(server)

    const status = await client.callTool({ name: 'status', arguments: {} })

    expect(status.isError).not.toBe(true)
    expect(isOpen()).toBe(false)
  })

  it('lists the control tools, one tool per exposed agent, and one per exposed command', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      'agent_broken',
      'agent_pricer',
      'agent_waiter',
      'answer',
      'approve',
      'cancel',
      'chat',
      'command_confirm',
      'command_connect_notion',
      'command_fail',
      'command_greet',
      'command_release_v2_1_beta',
      'reject',
      'resolve',
      'status',
      'steer',
    ])
    const agentTool = listed.tools.find((tool) => tool.name === 'agent_pricer')
    expect(agentTool?.description).toBe('Prices a vendor')
    expect(Object.keys(agentTool?.inputSchema.properties ?? {})).toEqual([
      'vendor',
      'threadId',
    ])
    const commandTool = listed.tools.find(
      (tool) => tool.name === 'command_connect_notion',
    )
    expect(commandTool?.description).toBe('Sign in to Notion')
    const inputTool = listed.tools.find((tool) => tool.name === 'command_greet')
    expect(Object.keys(inputTool?.inputSchema.properties ?? {})).toEqual([
      'name',
      'threadId',
    ])
  })

  it('lists only the control tools for a harness that exposes no agents', async () => {
    const { server } = await serve(
      defineHarness({ name: 'test/bare', adapter: scripted([]).adapter }),
    )
    const { client } = await connect(server)

    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual(controlTools)
  })

  it('runs an exposed harness tool with no model call', async () => {
    const stats = toolDefinition({
      name: 'fetch_stats',
      description: 'Fetch the stats of a queue',
      inputSchema: z.object({ queue: z.string() }),
    }).server(async ({ queue }) => ({ queue, open: 7 }))
    const hidden = toolDefinition({
      name: 'hidden',
      description: 'Not exposed',
      inputSchema: z.object({}),
    }).server(async () => 'no')
    const model = scripted([])
    const { server } = await serve(
      defineHarness({
        name: 'test/tools',
        adapter: model.adapter,
        tools: [stats, hidden],
        expose: { tools: ['fetch_stats'] },
      }),
    )
    const { client } = await connect(server)

    const listed = await client.listTools()
    const names = listed.tools.map((tool) => tool.name)
    expect(names).toContain('tool_fetch_stats')
    expect(names).not.toContain('tool_hidden')
    const result = await client.callTool({
      name: 'tool_fetch_stats',
      arguments: { queue: 'billing' },
    })
    expect(result.isError).toBeFalsy()
    expect(model.calls).toHaveLength(0)
  })

  it('adds the exposed record types to the session log with append', async () => {
    const model = scripted([])
    const harness = defineHarness({
      name: 'test/append',
      adapter: model.adapter,
      expose: { records: ['app.signal'] },
    })
    const { metadata } = memoryPersistence().stores
    const log = memoryLogStore()
    const host = createHarnessHost({
      persistence: { stores: { log, metadata } },
    })
    cleanups.push(() => host.close())
    const server = await createHarnessMcpServer({
      host,
      harness,
      openAccess: true,
    })
    const { client } = await connect(server)

    const ok = await client.callTool({
      name: 'append',
      arguments: { threadId: 't-sig', records: [{ type: 'app.signal', n: 1 }] },
    })
    expect(ok.isError).toBeFalsy()
    const stored = await log.read({ logId: logIdOf({ logId: 't-sig' }) })
    expect(JSON.stringify(stored)).toContain('"type":"app.signal"')
    const refused = await client.callTool({
      name: 'append',
      arguments: { records: [{ type: 'app.other' }] },
    })
    expect(refused.isError).toBe(true)
  })

  it('refuses a tool input that has its own threadId field', async () => {
    const lookup = toolDefinition({
      name: 'lookup',
      description: 'Looks up a thread',
      inputSchema: z.object({ threadId: z.string() }),
    }).server(async () => 'found')
    const model = scripted([])
    await expect(
      serve(
        defineHarness({
          name: 'test/clash',
          adapter: model.adapter,
          tools: [lookup],
          expose: { tools: ['lookup'] },
        }),
      ),
    ).rejects.toThrow(/cannot have a threadId field/)
  })

  it('gives command names that clash as tool names distinct tool names, in name order', async () => {
    const clashing = definePlugin({
      name: 'test/clashing',
      setup: () => ({
        commands: {
          // Added first, but `connect:notion` comes first in name order.
          connect_notion: defineCommand({
            description: 'Sign in with the new flow',
            run: () => 'New flow.',
          }),
          'connect:notion': defineCommand({
            description: 'Sign in to Notion',
            run: () => 'Connected to Notion.',
          }),
        },
      }),
    })
    const { server } = await serve(
      defineHarness({
        name: 'test/clash',
        adapter: scripted([]).adapter,
        plugins: () => [clashing],
        expose: { commands: ['connect_notion', 'connect:notion'] },
      }),
    )
    const { client } = await connect(server)

    const listed = await client.listTools()
    const commandTools = listed.tools
      .filter((tool) => tool.name.startsWith('command_'))
      .map(({ name, description }) => ({ name, description }))
      .sort((left, right) => left.name.localeCompare(right.name))
    expect(commandTools).toEqual([
      {
        name: 'command_connect_notion',
        description: 'Sign in to Notion (command connect:notion)',
      },
      {
        name: 'command_connect_notion_2',
        description: 'Sign in with the new flow (command connect_notion)',
      },
    ])
    const plain = await client.callTool({
      name: 'command_connect_notion',
      arguments: {},
    })
    expect(plain.content).toEqual([
      { type: 'text', text: 'Connected to Notion.' },
    ])
    const suffixed = await client.callTool({
      name: 'command_connect_notion_2',
      arguments: {},
    })
    expect(suffixed.content).toEqual([{ type: 'text', text: 'New flow.' }])
  })

  it('lists and runs only the commands in expose.commands', async () => {
    const modes: Array<string> = []
    const permissions = definePlugin({
      name: 'test/permissions',
      setup: () => ({
        commands: {
          mode: defineCommand({
            description: 'Set the permission mode',
            input: z.object({ mode: z.string() }),
            run: (input) => {
              modes.push(input.mode)
              return `Mode: ${input.mode}.`
            },
          }),
          undo: defineCommand({
            description: 'Undo the last change',
            run: () => 'Undone.',
          }),
        },
      }),
    })
    const { server } = await serve(
      defineHarness({
        name: 'test/expose-commands',
        adapter: scripted([]).adapter,
        plugins: () => [permissions],
        expose: { commands: ['undo'] },
      }),
    )
    const { client } = await connect(server)

    const listed = await client.listTools()
    const commandTools = listed.tools
      .map((tool) => tool.name)
      .filter((name) => name.startsWith('command_'))
    expect(commandTools).toEqual(['command_undo'])

    await expect(
      client.callTool({ name: 'command_mode', arguments: { mode: 'bypass' } }),
    ).rejects.toThrow('Tool command_mode not found')
    expect(modes).toEqual([])

    const undone = await client.callTool({
      name: 'command_undo',
      arguments: {},
    })
    expect(undone.content).toEqual([{ type: 'text', text: 'Undone.' }])
  })

  it.each([
    {
      options: {},
      expected: { name: 'test/mcp-harness', version: '1.0.0' },
    },
    {
      options: { name: 'desk', version: '2.1.0' },
      expected: { name: 'desk', version: '2.1.0' },
    },
  ])(
    'names the server $expected.name $expected.version',
    async ({ options, expected }) => {
      const { server } = await harnessServer([], options)
      const { client } = await connect(server)

      expect(client.getServerVersion()).toMatchObject(expected)
    },
  )

  it('chat returns the answer of the turn', async () => {
    const { server } = await harnessServer([
      textTurn('Hello from the harness.'),
    ])
    const { client } = await connect(server)

    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'hi' },
    })
    expect(reply.structuredContent).toEqual({
      status: 'completed',
      text: 'Hello from the harness.',
      interrupts: [],
      questions: [],
      waits: [],
    })
  })

  it('returns a failed model call as a tool error', async () => {
    const { server } = await harnessServer([errorTurn('The model is down.')])
    const { client } = await connect(server)

    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'hi' },
    })
    expect(reply).toMatchObject(toolError('The model is down.'))
  })

  it('returns a tool that needs approval as pending, and approve runs it', async () => {
    const { server, removed } = await harnessServer([
      removeTurn('a.txt'),
      textTurn('Removed a.txt.'),
    ])
    const { client } = await connect(server)

    const pending = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    expect(pending.structuredContent).toEqual({
      status: 'interrupted',
      text: '',
      interrupts: [
        {
          id: expect.any(String),
          kind: 'approval',
          tool: 'remove',
          args: { path: 'a.txt' },
          message: 'Approval required to run remove',
          responseSchema: removeApprovalSchema,
        },
      ],
      questions: [],
      waits: [expect.objectContaining({ kind: 'approval' })],
    })
    expect(removed).toEqual([])

    const status = await client.callTool({ name: 'status', arguments: {} })
    expect(status.structuredContent).toMatchObject({
      status: 'requires_action',
      interrupts: [{ kind: 'approval', tool: 'remove' }],
      agents: [],
      queuedTurns: 0,
    })

    const approved = await client.callTool({ name: 'approve', arguments: {} })
    expect(approved.structuredContent).toEqual({
      status: 'completed',
      text: 'Removed a.txt.',
      interrupts: [],
      questions: [],
      waits: [],
    })
    expect(removed).toEqual(['a.txt'])
  })

  it('reject continues the turn without running the tool', async () => {
    const { server, removed } = await harnessServer([
      removeTurn('a.txt'),
      textTurn('Kept a.txt.'),
    ])
    const { client } = await connect(server)

    await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    const rejected = await client.callTool({ name: 'reject', arguments: {} })
    expect(rejected.structuredContent).toEqual({
      status: 'completed',
      text: 'Kept a.txt.',
      interrupts: [],
      questions: [],
      waits: [],
    })
    expect(removed).toEqual([])
  })

  it('refuses approve when no approval waits', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const refused = await client.callTool({ name: 'approve', arguments: {} })
    expect(refused).toMatchObject(toolError('No approvals are waiting.'))
  })

  it('refuses a resolve that does not answer every open interrupt', async () => {
    const { server, removed } = await harnessServer([
      removeTurn('a.txt', 'b.txt'),
      textTurn('Removed one file.'),
    ])
    const { client } = await connect(server)

    const pending = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove both files' },
    })
    const ids = interruptIds(pending)
    expect(ids).toHaveLength(2)
    const [first, second] = ids

    const partial = await client.callTool({
      name: 'resolve',
      arguments: { decisions: [{ interruptId: first, approved: true }] },
    })
    expect(partial).toMatchObject(
      toolError(
        `resolve must answer every open interrupt. Missing: ${second}.`,
      ),
    )
    expect(removed).toEqual([])

    const mixed = await client.callTool({
      name: 'resolve',
      arguments: {
        decisions: [
          { interruptId: first, approved: true },
          { interruptId: second, approved: false },
        ],
      },
    })
    expect(mixed.structuredContent).toMatchObject({
      status: 'completed',
      text: 'Removed one file.',
    })
    expect(removed).toEqual(['a.txt'])
  })

  it('refuses a resolve that names an interrupt that is not open', async () => {
    const { server, removed } = await harnessServer([removeTurn('a.txt')])
    const { client } = await connect(server)

    const pending = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    const [open] = interruptIds(pending)

    const refused = await client.callTool({
      name: 'resolve',
      arguments: {
        decisions: [
          { interruptId: open, approved: true },
          { interruptId: 'ghost', approved: true },
        ],
      },
    })
    expect(refused).toMatchObject(
      toolError('These interrupts are not open: ghost.'),
    )
    expect(removed).toEqual([])
  })

  it('returns the harness refusal of a resolve as a tool error', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const refused = await client.callTool({
      name: 'resolve',
      arguments: { decisions: [] },
    })
    expect(refused).toMatchObject(
      toolError('The harness refused the decisions: no_pending_interrupts.'),
    )
  })

  it("approves every tool call on its own with approvals 'auto'", async () => {
    const { server, removed } = await harnessServer(
      [removeTurn('a.txt'), textTurn('Removed a.txt.')],
      { approvals: 'auto' },
    )
    const { client } = await connect(server)

    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    expect(reply.structuredContent).toEqual({
      status: 'completed',
      text: 'Removed a.txt.',
      interrupts: [],
      questions: [],
      waits: [],
    })
    expect(removed).toEqual(['a.txt'])
  })

  it('asks the user about an approval when the client supports elicitation', async () => {
    const { server, removed } = await harnessServer([
      removeTurn('a.txt'),
      textTurn('Removed a.txt.'),
    ])
    const { client, asked } = await connect(server, { reply: accepted('yes') })

    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    expect(reply.structuredContent).toMatchObject({
      status: 'completed',
      text: 'Removed a.txt.',
    })
    expect(removed).toEqual(['a.txt'])
    expect(asked).toEqual([
      'Approval required to run remove. Arguments: {"path":"a.txt"}. Approve? Answer yes or no.',
    ])
  })

  it('rejects the tool call when the user answers no', async () => {
    const { server, removed } = await harnessServer([
      removeTurn('a.txt'),
      textTurn('Kept a.txt.'),
    ])
    const { client } = await connect(server, { reply: accepted('no') })

    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    expect(reply.structuredContent).toEqual({
      status: 'completed',
      text: 'Kept a.txt.',
      interrupts: [],
      questions: [],
      waits: [],
    })
    expect(removed).toEqual([])
  })

  it('returns the approval as pending when the user declines the question', async () => {
    const { server, removed } = await harnessServer([removeTurn('a.txt')])
    const { client, asked } = await connect(server, {
      reply: { action: 'decline' },
    })

    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    expect(reply.structuredContent).toMatchObject({
      status: 'interrupted',
      interrupts: [
        { kind: 'approval', tool: 'remove', args: { path: 'a.txt' } },
      ],
    })
    expect(asked).toHaveLength(1)
    expect(removed).toEqual([])
  })

  it('returns a generic interrupt with its kind and schema, and resolve answers it with a payload', async () => {
    const { server, notes } = await harnessServer(
      [textTurn('Here is the plan.'), textTurn('Plan approved.')],
      { reviewAt: 'afterModel' },
    )
    const { client } = await connect(server)

    const pending = await client.callTool({
      name: 'chat',
      arguments: { message: 'make a plan' },
    })
    expect(pending.structuredContent).toEqual({
      status: 'interrupted',
      text: 'Here is the plan.',
      interrupts: [
        {
          id: expect.any(String),
          kind: 'human',
          message: 'Review the plan',
          responseSchema: reviewSchema,
        },
      ],
      questions: [],
      waits: [expect.objectContaining({ kind: 'human' })],
    })
    const [id] = interruptIds(pending)

    const refused = await client.callTool({ name: 'approve', arguments: {} })
    expect(refused).toMatchObject(
      toolError(`Use resolve: interrupt ${id} needs a payload.`),
    )

    const resolved = await client.callTool({
      name: 'resolve',
      arguments: {
        decisions: [{ interruptId: id, payload: { note: 'Ship it.' } }],
      },
    })
    expect(resolved.structuredContent).toEqual({
      status: 'completed',
      text: 'Plan approved.',
      interrupts: [],
      questions: [],
      waits: [],
    })
    expect(notes).toEqual([{ note: 'Ship it.' }])
  })

  it("approvals 'auto' leaves a generic interrupt pending", async () => {
    const { server, notes } = await harnessServer(
      [textTurn('Here is the plan.')],
      { approvals: 'auto', reviewAt: 'afterModel' },
    )
    const { client } = await connect(server)

    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'make a plan' },
    })
    expect(reply.structuredContent).toMatchObject({
      status: 'interrupted',
      interrupts: [{ kind: 'human', message: 'Review the plan' }],
    })
    expect(notes).toEqual([])
  })

  it('resolves an approval and a generic interrupt of one turn in one call', async () => {
    const { server, removed, notes } = await harnessServer(
      [removeTurn('a.txt'), textTurn('Removed a.txt.')],
      { approvals: 'auto', reviewAt: 'beforeTools' },
    )
    const { client } = await connect(server)

    const pending = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove a.txt' },
    })
    // 'auto' answers approvals only. The review is open, so both wait.
    expect(pending.structuredContent).toMatchObject({
      status: 'interrupted',
      interrupts: [{ kind: 'approval', tool: 'remove' }, { kind: 'human' }],
    })
    expect(removed).toEqual([])
    const [approval, reviewId] = interruptIds(pending)

    const resolved = await client.callTool({
      name: 'resolve',
      arguments: {
        decisions: [
          { interruptId: approval, approved: true },
          { interruptId: reviewId, payload: { note: 'Go ahead.' } },
        ],
      },
    })
    expect(resolved.structuredContent).toEqual({
      status: 'completed',
      text: 'Removed a.txt.',
      interrupts: [],
      questions: [],
      waits: [],
    })
    expect(removed).toEqual(['a.txt'])
    expect(notes).toEqual([{ note: 'Go ahead.' }])
  })

  it.each([
    {
      given: 'no approved and no payload for an approval',
      approval: {},
      reviewDecision: { payload: { note: 'Go ahead.' } },
      refused: 0,
      problem: 'needs approved or payload.',
    },
    {
      given: 'only approved for a generic interrupt',
      approval: { approved: true },
      reviewDecision: { approved: true },
      refused: 1,
      problem: 'needs a payload. It is not an approval.',
    },
  ])(
    'refuses a decision with $given',
    async ({ approval, reviewDecision, refused, problem }) => {
      const { server, removed, notes } = await harnessServer(
        [removeTurn('a.txt')],
        { reviewAt: 'beforeTools' },
      )
      const { client } = await connect(server)

      const pending = await client.callTool({
        name: 'chat',
        arguments: { message: 'remove a.txt' },
      })
      const ids = interruptIds(pending)
      const [approvalId, reviewId] = ids

      const reply = await client.callTool({
        name: 'resolve',
        arguments: {
          decisions: [
            { interruptId: approvalId, ...approval },
            { interruptId: reviewId, ...reviewDecision },
          ],
        },
      })
      expect(reply).toMatchObject(
        toolError(`The decision for ${ids[refused]} ${problem}`),
      )
      const status = await client.callTool({ name: 'status', arguments: {} })
      expect(status.structuredContent).toMatchObject({
        status: 'requires_action',
        interrupts: [{ kind: 'approval' }, { kind: 'human' }],
      })
      expect(removed).toEqual([])
      expect(notes).toEqual([])
    },
  )

  it('returns a client tool call as pending, and resolve sends its output', async () => {
    const { server, calls } = await harnessServer([
      toolCallTurn([{ name: 'pick_color', input: { hint: 'sky' } }]),
      textTurn('Blue it is.'),
    ])
    const { client } = await connect(server)

    const pending = await client.callTool({
      name: 'chat',
      arguments: { message: 'pick a color' },
    })
    expect(pending.structuredContent).toMatchObject({
      status: 'interrupted',
      interrupts: [
        {
          kind: 'client-tool',
          tool: 'pick_color',
          args: { hint: 'sky' },
          message: 'Client tool pick_color is ready to run',
        },
      ],
    })
    const [id] = interruptIds(pending)

    const resolved = await client.callTool({
      name: 'resolve',
      arguments: {
        decisions: [{ interruptId: id, payload: { color: 'blue' } }],
      },
    })
    expect(resolved.structuredContent).toMatchObject({
      status: 'completed',
      text: 'Blue it is.',
    })
    const toolResults = (calls[1] ?? []).filter(
      (message) => message.role === 'tool',
    )
    expect(toolResults).toMatchObject([
      { toolCallId: 'call-0', content: '{"color":"blue"}' },
    ])
  })

  it('answer resolves the question of a command and returns its result', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const waiting = await client.callTool({
      name: 'command_confirm',
      arguments: {},
    })
    expect(waiting.structuredContent).toEqual({
      status: 'waiting',
      interrupts: [],
      questions: [
        {
          id: expect.any(String),
          message: 'Really?',
          schema: { type: 'boolean' },
        },
      ],
      waits: [
        expect.objectContaining({ kind: 'question', message: 'Really?' }),
      ],
    })
    const [question] = pendingShape.parse(waiting.structuredContent).questions
    if (question === undefined) throw new Error('The command asked nothing')

    const answered = await client.callTool({
      name: 'answer',
      arguments: { questionId: question.id, value: true },
    })
    expect(answered.content).toEqual([{ type: 'text', text: 'Confirmed.' }])
  })

  it('forgets a waiting question when another client answers it', async () => {
    // The server keeps the waiting work in a Map that it does not export.
    // Find it: the Map that gets the question id with an operation.
    const sets = vi.spyOn(Map.prototype, 'set')
    const { server, session } = await harnessServer([])
    const { client } = await connect(server)
    const waiting = await client.callTool({
      name: 'command_confirm',
      arguments: {},
    })
    const [question] = pendingShape.parse(waiting.structuredContent).questions
    if (question === undefined) throw new Error('The command asked nothing')
    const index = sets.mock.calls.findIndex(
      ([key, value]) =>
        key === question.id &&
        typeof value === 'object' &&
        value !== null &&
        'stream' in value,
    )
    const map: unknown = sets.mock.contexts[index]
    sets.mockRestore()
    if (!(map instanceof Map)) throw new Error('No waiting map found')
    expect(map.has(question.id)).toBe(true)

    // Another client answers, so the MCP `answer` tool never runs.
    const live = await session()
    await live.answer({ questionId: question.id, value: true })
    await waitFor(() => expect(map.has(question.id)).toBe(false))
  })

  it('returns the result of its own turn when another operation asks a question', async () => {
    const held = heldTurn(textTurn('Done.'))
    const { server, session } = await harnessServer([held])
    const { client } = await connect(server)

    const reply = client.callTool({
      name: 'chat',
      arguments: { message: 'work' },
    })
    await held.hold.reached
    const live = await session()
    const confirm = live.runCommand({ name: 'confirm' })
    await waitFor(() => expect(live.snapshot().pendingWaits).toHaveLength(1))
    held.hold.release()

    // The question of the command is not a wait of the chat turn.
    expect((await reply).structuredContent).toEqual({
      status: 'completed',
      text: 'Done.',
      interrupts: [],
      questions: [],
      waits: [],
    })
    const [question] = live.snapshot().pendingWaits
    await live.answer({ questionId: question!.waitId, value: true })
    expect(await confirm).toBe('Confirmed.')
  })

  it('returns the wait of a background agent run, and resolve continues the run', async () => {
    const removed: Array<string> = []
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(async ({ path }) => {
      removed.push(path)
      return `removed ${path}`
    })
    const model = scripted([removeTurn('old.log'), textTurn('Cleaned.')])
    const cleaner = defineAgent({
      name: 'cleaner',
      description: 'Cleans up',
      run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [remove] }),
    })
    const { server } = await serve(
      defineHarness({
        name: 'test/mcp-run-waits',
        adapter: scripted([]).adapter,
        agents: [cleaner],
        expose: { agents: ['cleaner'] },
      }),
    )
    const { client } = await connect(server)

    const waiting = await client.callTool({
      name: 'agent_cleaner',
      arguments: {},
    })
    expect(waiting.structuredContent).toEqual({
      status: 'waiting',
      interrupts: [],
      questions: [],
      waits: [
        expect.objectContaining({
          kind: 'approval',
          runId: expect.any(String),
        }),
      ],
    })
    const status = await client.callTool({ name: 'status', arguments: {} })
    expect(status.structuredContent).toMatchObject({
      agents: [{ agent: 'cleaner', status: 'waiting' }],
    })
    const [wait] = z
      .object({ waits: z.array(z.object({ waitId: z.string() })) })
      .parse(waiting.structuredContent).waits

    const done = await client.callTool({
      name: 'resolve',
      arguments: { decisions: [{ interruptId: wait!.waitId, approved: true }] },
    })
    expect(done.content).toEqual([{ type: 'text', text: 'Cleaned.' }])
    expect(removed).toEqual(['old.log'])
  })

  it('resolve finds the wait of a background agent run that it did not start, from the log', async () => {
    const remove = toolDefinition({
      name: 'remove',
      description: 'Remove a file',
      needsApproval: true,
      inputSchema: z.object({ path: z.string() }),
    }).server(async ({ path }) => `removed ${path}`)
    const model = scripted([removeTurn('old.log'), textTurn('Cleaned.')])
    const cleaner = defineAgent({
      name: 'cleaner',
      description: 'Cleans up',
      run: (ctx) => ctx.chat({ adapter: model.adapter, tools: [remove] }),
    })
    const harness = defineHarness({
      name: 'test/mcp-log-waits',
      adapter: scripted([]).adapter,
      agents: [cleaner],
    })
    const { server, host } = await serve(harness)
    const { client } = await connect(server)
    // Another client starts the run: this server never saw its wait open.
    const session = await host.open(harness, { threadId: 'main' })
    const run = session.agents.cleaner.start()
    const wait = await waitFor(() => {
      const [open] = session.snapshot().pendingWaits
      expect(open).toBeDefined()
      return open!
    })

    const done = await client.callTool({
      name: 'resolve',
      arguments: { decisions: [{ interruptId: wait.waitId, approved: true }] },
    })
    expect(done.content).toEqual([{ type: 'text', text: 'Cleaned.' }])
    expect(await run).toBe('Cleaned.')
  })

  it('answer returns answered for a question that no tool call waits on', async () => {
    const { server, session } = await harnessServer([])
    const { client } = await connect(server)
    const live = await session()
    const confirm = live.runCommand({ name: 'confirm' })
    const questionId = await nextQuestionId(live)

    const answered = await client.callTool({
      name: 'answer',
      arguments: { questionId, value: true },
    })
    expect(answered.structuredContent).toEqual({
      status: 'answered',
      interrupts: [],
      questions: [],
      waits: [],
    })
    expect(await confirm).toBe('Confirmed.')
  })

  it('returns the harness refusal of an answer as a tool error', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const refused = await client.callTool({
      name: 'answer',
      arguments: { questionId: 'q-unknown', value: true },
    })
    expect(refused).toMatchObject(
      toolError('The harness refused the answer: unknown_question.'),
    )
  })

  it('agent_<name> runs the agent and returns its result', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const result = await client.callTool({
      name: 'agent_pricer',
      arguments: { vendor: 'Acme' },
    })
    expect(result.content).toEqual([
      { type: 'text', text: 'Acme: twelve dollars' },
    ])
  })

  it('returns the error of a failed agent as a tool error', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const result = await client.callTool({
      name: 'agent_broken',
      arguments: {},
    })
    expect(result).toMatchObject(toolError('The price list is gone.'))
  })

  it('command_<name> runs the command under a tool-safe name', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const result = await client.callTool({
      name: 'command_connect_notion',
      arguments: {},
    })
    expect(result.content).toEqual([
      { type: 'text', text: 'Connected to Notion.' },
    ])
  })

  it('command_<name> takes the command input next to threadId', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const result = await client.callTool({
      name: 'command_greet',
      arguments: { name: 'Ada', threadId: 'main' },
    })
    expect(result.content).toEqual([{ type: 'text', text: 'Hello, Ada.' }])
  })

  it('returns the error of a failed command as a tool error', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const result = await client.callTool({
      name: 'command_fail',
      arguments: {},
    })
    expect(result).toMatchObject(toolError('Notion is down.'))
  })

  it('steer starts a turn when no turn runs', async () => {
    const { server, calls } = await harnessServer([
      textTurn('Tabs it is.'),
      textTurn('Formatted.'),
    ])
    const { client } = await connect(server)

    const steered = await client.callTool({
      name: 'steer',
      arguments: { message: 'use tabs' },
    })
    expect(steered.structuredContent).toEqual({
      inputId: expect.any(String),
      status: 'accepted',
      operationId: expect.any(String),
    })
    const reply = await client.callTool({
      name: 'chat',
      arguments: { message: 'format it' },
    })
    expect(reply.structuredContent).toMatchObject({ text: 'Formatted.' })
    expect(userTexts(calls[0])).toEqual(['use tabs'])
    expect(userTexts(calls[1])).toEqual(['use tabs', 'format it'])
  })

  it('cancel stops the running turn, and its chat call ends with an error', async () => {
    const held = heldTurn(textTurn('Too late.'))
    const { server } = await harnessServer([held])
    const { client } = await connect(server)

    const reply = client.callTool({
      name: 'chat',
      arguments: { message: 'write a long story' },
    })
    await held.hold.reached
    const cancelled = await client.callTool({ name: 'cancel', arguments: {} })
    expect(cancelled.structuredContent).toEqual({
      inputId: expect.any(String),
      status: 'accepted',
      operationId: expect.any(String),
    })
    held.hold.release()
    expect(await reply).toMatchObject(toolError('Cancelled.'))
  })

  it('returns the refusal of cancel when no turn runs', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const refused = await client.callTool({ name: 'cancel', arguments: {} })
    expect(refused.structuredContent).toEqual({
      inputId: expect.any(String),
      status: 'rejected',
      reason: 'not_running',
    })
  })

  it('status shows the running agents and the queued turns', async () => {
    const held = heldTurn(textTurn('Busy.'))
    const { server, session, agentHold } = await harnessServer([
      held,
      textTurn('Follow-up done.'),
    ])
    const { client } = await connect(server)

    const turn = client.callTool({
      name: 'chat',
      arguments: { message: 'work' },
    })
    await held.hold.reached
    await (await session()).send('then this', { mode: 'followUp' }).receipt
    const agent = client.callTool({ name: 'agent_waiter', arguments: {} })
    await agentHold.reached

    const status = await client.callTool({ name: 'status', arguments: {} })
    expect(status.structuredContent).toEqual({
      status: 'running',
      interrupts: [],
      questions: [],
      waits: [],
      agents: [{ id: expect.any(String), agent: 'waiter', status: 'running' }],
      queuedTurns: 1,
    })
    held.hold.release()
    agentHold.release()
    await Promise.all([turn, agent])
  })

  it('keeps a separate conversation per threadId', async () => {
    const { server, calls } = await harnessServer([
      textTurn('one'),
      textTurn('two'),
      textTurn('three'),
    ])
    const { client } = await connect(server)

    const threads = [
      { message: 'first', threadId: 'a' },
      { message: 'second', threadId: 'b' },
      { message: 'third', threadId: 'a' },
    ]
    for (const input of threads) {
      await client.callTool({ name: 'chat', arguments: input })
    }
    expect(userTexts(calls[1])).toEqual(['second'])
    expect(userTexts(calls[2])).toEqual(['first', 'third'])
  })

  it.each([
    { options: {}, thread: 'main' },
    { options: { threadId: 'desk' }, thread: 'desk' },
  ])(
    'uses thread $thread for a call without threadId',
    async ({ options, thread }) => {
      const { server, calls } = await harnessServer(
        [textTurn('one'), textTurn('two')],
        options,
      )
      const { client } = await connect(server)

      await client.callTool({ name: 'chat', arguments: { message: 'first' } })
      await client.callTool({
        name: 'chat',
        arguments: { message: 'second', threadId: thread },
      })
      expect(userTexts(calls[1])).toEqual(['first', 'second'])
    },
  )
})

describe('createHarnessMcpServer access', () => {
  /** A harness whose model answers the first call with "Hello.". */
  const greeter = () =>
    defineHarness({
      name: 'test/access',
      adapter: scripted([textTurn('Hello.')]).adapter,
    })

  it('throws at the start for a host without access and without openAccess', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    cleanups.push(() => host.close())

    await expect(
      createHarnessMcpServer({ host, harness: greeter() }),
    ).rejects.toThrow(
      'createHarnessMcpServer needs host access ({ getUser, rules }) or openAccess: true or { user }.',
    )
  })

  it('throws at the start for openAccess on a host with access', async () => {
    const server = createHarnessMcpServer({
      host: accessHost(),
      harness: greeter(),
      openAccess: { user: olga },
    })

    await expect(server).rejects.toThrow(
      'createHarnessMcpServer: the host has access, so access.getUser reads the user of each request. Remove openAccess.',
    )
  })

  it('runs every call as the openAccess user', async () => {
    const ana = { id: 'ana', tenantId: 'globex' }
    const { server, host } = await serve(greeter(), {
      openAccess: { user: ana },
    })
    const { client } = await connect(server)

    await client.callTool({
      name: 'chat',
      arguments: { threadId: 't-ana', message: 'Hi' },
    })
    expect(
      await host.sessions.get({ threadId: 't-ana', user: ana }),
    ).toMatchObject({
      tenantId: 'globex',
      members: [{ userId: 'ana', role: 'owner' }],
    })
    expect(await host.sessions.get({ threadId: 't-ana' })).toBeUndefined()
  })

  it('answers a request that getUser refuses with a 401 bearer challenge', async () => {
    const server = await createHarnessMcpServer({
      host: accessHost(),
      harness: greeter(),
    })

    const response = await server.fetch(
      new Request(serverUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'x-user': 'nobody',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      }),
    )
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toMatch(/^Bearer /)
  })

  it('runs each request as its user, and returns a refused action as a tool error', async () => {
    const host = accessHost()
    const server = await createHarnessMcpServer({ host, harness: greeter() })
    const { client: asOlga } = await connect(server, { user: 'olga' })
    const { client: asBea } = await connect(server, { user: 'bea' })
    const { client: asCid } = await connect(server, { user: 'cid' })

    const reply = await asOlga.callTool({
      name: 'chat',
      arguments: { threadId: 't1', message: 'Hi' },
    })
    expect(reply.structuredContent).toMatchObject({
      status: 'completed',
      text: 'Hello.',
    })
    expect(
      await host.sessions.get({ threadId: 't1', user: olga }),
    ).toMatchObject({ members: [{ userId: 'olga', role: 'owner' }] })
    await host.sessions.share({
      threadId: 't1',
      userId: 'bea',
      role: 'viewer',
      user: olga,
    })

    const stranger = await asCid.callTool({
      name: 'status',
      arguments: { threadId: 't1' },
    })
    expect(stranger).toMatchObject(
      toolError(
        'Access denied: the user of this call may not read on thread "t1".',
      ),
    )
    const viewer = await asBea.callTool({
      name: 'chat',
      arguments: { threadId: 't1', message: 'Hi' },
    })
    expect(viewer).toMatchObject(
      toolError(
        'Access denied: the user of this call may not send on thread "t1".',
      ),
    )
  })

  it('lists the agents of the harness definition on a host with access, and no plugin commands', async () => {
    const harness = defineHarness({
      name: 'test/access-tools',
      adapter: scripted([]).adapter,
      agents: [pricer],
      expose: { agents: ['pricer'], commands: ['greet'] },
      plugins: () => [commands],
    })
    const server = await createHarnessMcpServer({ host: accessHost(), harness })
    const { client } = await connect(server, { user: 'olga' })

    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      'agent_pricer',
      ...controlTools,
    ])
  })
})
