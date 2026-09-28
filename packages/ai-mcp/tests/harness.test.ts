import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createHarnessMcpServer } from '../src/harness'
import type { AnyTextAdapter, ModelMessage, StreamChunk } from '@tanstack/ai'

const serverUrl = new URL('https://harness.example.com/mcp')
const now = () => Date.now()

const pendingShape = z.object({
  approvals: z.array(z.object({ id: z.string() })),
  questions: z.array(z.object({ id: z.string() })),
})

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

/** One model call that asks to remove each path, one tool call per path. */
function removeTurn(...paths: Array<string>): Array<StreamChunk> {
  const calls = paths.flatMap(
    (path, index): Array<StreamChunk> => [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: `call-${index}`,
        toolCallName: 'remove',
        timestamp: now(),
      },
      {
        type: EventType.TOOL_CALL_ARGS,
        toolCallId: `call-${index}`,
        delta: JSON.stringify({ path }),
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

/** A model that plays `turns` in order and keeps the messages of each call. */
function scripted(turns: Array<Array<StreamChunk>>) {
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
      const chunks = turns[calls.length] ?? textTurn('')
      calls.push(options.messages)
      return (async function* () {
        yield* chunks
      })()
    },
  }
  return { adapter, calls }
}

function userTexts(messages: Array<ModelMessage> | undefined) {
  return (messages ?? [])
    .filter((message) => message.role === 'user')
    .map((message) => message.content)
}

const pricer = defineAgent({
  name: 'pricer',
  description: 'Prices a vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => `${ctx.input.vendor}: twelve dollars`,
})

const commands = definePlugin({
  name: 'test/commands',
  setup: (ctx) => ({
    commands: {
      'connect:notion': defineCommand({
        description: 'Sign in to Notion',
        run: () => 'Connected to Notion.',
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
    },
  }),
})

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

async function harnessServer(
  turns: Array<Array<StreamChunk>>,
  options: { approvals?: 'ask' | 'auto' } = {},
) {
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
  const harness = defineHarness({
    name: 'test/mcp-harness',
    adapter: model.adapter,
    tools: [remove],
    agents: [pricer],
    expose: { agents: ['pricer'] },
    plugins: () => [commands],
  })
  const host = createHarnessHost({ persistence: memoryPersistence() })
  cleanups.push(() => host.close())
  const server = await createHarnessMcpServer({ host, harness, ...options })
  return { server, removed, calls: model.calls }
}

/**
 * A real MCP client on `server.fetch`. With `answer`, the client supports
 * elicitation and answers every question with it (spec 2025 sessions only).
 */
async function connect(
  server: { fetch: (request: Request) => Promise<Response> },
  options: { answer?: string } = {},
) {
  const answer = options.answer
  const client = new Client(
    { name: 'tester', version: '1.0.0' },
    answer === undefined
      ? { versionNegotiation: { mode: { pin: '2026-07-28' } } }
      : { capabilities: { elicitation: { form: {} } } },
  )
  const asked: Array<string> = []
  if (answer !== undefined) {
    client.setRequestHandler('elicitation/create', async (request) => {
      asked.push(request.params.message)
      return { action: 'accept', content: { value: answer } }
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
  it('lists the control tools, one tool per exposed agent, and one per command', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const listed = await client.listTools()
    expect(listed.tools.map((tool) => tool.name).sort()).toEqual([
      'agent_pricer',
      'answer',
      'approve',
      'cancel',
      'chat',
      'command_confirm',
      'command_connect_notion',
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
  })

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
      approvals: [],
      questions: [],
    })
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
      approvals: [
        {
          id: expect.any(String),
          tool: 'remove',
          args: { path: 'a.txt' },
          message: 'Approval required to run remove',
        },
      ],
      questions: [],
    })
    expect(removed).toEqual([])

    const status = await client.callTool({ name: 'status', arguments: {} })
    expect(status.structuredContent).toMatchObject({
      status: 'requires_action',
      approvals: [{ tool: 'remove' }],
      agents: [],
      queuedTurns: 0,
    })

    const approved = await client.callTool({ name: 'approve', arguments: {} })
    expect(approved.structuredContent).toEqual({
      status: 'completed',
      text: 'Removed a.txt.',
      approvals: [],
      questions: [],
    })
    expect(removed).toEqual(['a.txt'])
  })

  it('refuses a resolve that does not answer every open approval', async () => {
    const { server, removed } = await harnessServer([
      removeTurn('a.txt', 'b.txt'),
      textTurn('Removed one file.'),
    ])
    const { client } = await connect(server)

    const pending = await client.callTool({
      name: 'chat',
      arguments: { message: 'remove both files' },
    })
    const [first, second] = pendingShape.parse(
      pending.structuredContent,
    ).approvals
    if (first === undefined || second === undefined) {
      throw new Error('The turn did not stop for two approvals')
    }

    const partial = await client.callTool({
      name: 'resolve',
      arguments: { decisions: [{ interruptId: first.id, approved: true }] },
    })
    expect(partial.isError).toBe(true)
    expect(partial.content).toEqual([
      {
        type: 'text',
        text: `resolve must answer every open approval. Missing: ${second.id}.`,
      },
    ])
    expect(removed).toEqual([])

    const mixed = await client.callTool({
      name: 'resolve',
      arguments: {
        decisions: [
          { interruptId: first.id, approved: true },
          { interruptId: second.id, approved: false },
        ],
      },
    })
    expect(mixed.structuredContent).toMatchObject({
      status: 'completed',
      text: 'Removed one file.',
    })
    expect(removed).toEqual(['a.txt'])
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
      approvals: [],
      questions: [],
    })
    expect(removed).toEqual(['a.txt'])
  })

  it('asks the user about an approval when the client supports elicitation', async () => {
    const { server, removed } = await harnessServer([
      removeTurn('a.txt'),
      textTurn('Removed a.txt.'),
    ])
    const { client, asked } = await connect(server, { answer: 'yes' })

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

  it('answer resolves the question of a command and returns its result', async () => {
    const { server } = await harnessServer([])
    const { client } = await connect(server)

    const waiting = await client.callTool({
      name: 'command_confirm',
      arguments: {},
    })
    expect(waiting.structuredContent).toEqual({
      status: 'waiting',
      approvals: [],
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
})
