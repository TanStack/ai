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
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { afterEach, describe, expect, it } from 'vitest'
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
  setup: (ctx) => ({
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
        run: async () => {
          const sure = await ctx.session.ask({
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
  const server = await createHarnessMcpServer({ host, harness, ...options })
  return { server, host }
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
 */
async function connect(
  server: { fetch: (request: Request) => Promise<Response> },
  options: { reply?: ElicitReply } = {},
) {
  const reply = options.reply
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
  })
  await client.connect(transport)
  cleanups.push(() => client.close())
  return { client, asked }
}

describe('createHarnessMcpServer', () => {
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
          kind: 'generic',
          message: 'Review the plan',
          responseSchema: reviewSchema,
        },
      ],
      questions: [],
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
      interrupts: [{ kind: 'generic', message: 'Review the plan' }],
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
      interrupts: [{ kind: 'approval', tool: 'remove' }, { kind: 'generic' }],
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
        interrupts: [{ kind: 'approval' }, { kind: 'generic' }],
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
    })
    const [question] = pendingShape.parse(waiting.structuredContent).questions
    if (question === undefined) throw new Error('The command asked nothing')

    const answered = await client.callTool({
      name: 'answer',
      arguments: { questionId: question.id, value: true },
    })
    expect(answered.content).toEqual([{ type: 'text', text: 'Confirmed.' }])
  })

  it('answer returns answered for a question that no tool call waits on', async () => {
    const { server, session } = await harnessServer([])
    const { client } = await connect(server)
    const live = await session()
    const confirm = live.command('confirm')
    const questionId = await nextQuestionId(live)

    const answered = await client.callTool({
      name: 'answer',
      arguments: { questionId, value: true },
    })
    expect(answered.structuredContent).toEqual({
      status: 'answered',
      interrupts: [],
      questions: [],
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
    await (await session()).followUp('then this')
    const agent = client.callTool({ name: 'agent_waiter', arguments: {} })
    await agentHold.reached

    const status = await client.callTool({ name: 'status', arguments: {} })
    expect(status.structuredContent).toEqual({
      status: 'running',
      interrupts: [],
      questions: [],
      agents: [{ id: expect.any(String), agent: 'waiter' }],
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
