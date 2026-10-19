import { describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { client } from '@agentclientprotocol/sdk/experimental/v2'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  durableTool,
} from '@tanstack/ai-harness'
import {
  PermissionResources,
  PermissionRules,
  permissions,
} from '@tanstack/ai-harness/plugins'
import { createAcpAgent } from '../src/agent'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SessionUpdate } from '@agentclientprotocol/sdk/experimental/v2'

const now = () => Date.now()

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

/** True once `updates` has an idle state. */
const isIdle = (updates: Array<SessionUpdate>) =>
  updates.some(
    (update) =>
      update.sessionUpdate === 'state_update' && update.state === 'idle',
  )

/** The text that the agent sent in `updates`. */
const agentText = (updates: Array<SessionUpdate>) =>
  updates
    .map((update) =>
      update.sessionUpdate === 'agent_message_chunk'
        ? JSON.stringify(update)
        : '',
    )
    .join('')

function scripted(turns: Array<Array<StreamChunk>>) {
  let call = 0
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
    chatStream: () => {
      const chunks = turns[call] ?? []
      call += 1
      return (async function* () {
        yield* chunks
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
  return adapter
}

const textTurn = (text: string): Array<StreamChunk> => [
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
    delta: text,
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

const toolTurn = (name: string, args: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call_1',
    toolCallName: name,
    timestamp: now(),
  },
  {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'call_1',
    delta: args,
    timestamp: now(),
  },
  { type: EventType.TOOL_CALL_END, toolCallId: 'call_1', timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'tool_calls' } },
  },
]

describe('ACP v2 agent', () => {
  it('streams a prompt, asks for approval, and reports idle', async () => {
    const remove = vi.fn(async () => ({ removed: true }))
    const harness = defineHarness({
      name: 'test/acp',
      adapter: scripted([
        toolTurn('remove', '{"path":"a.txt"}'),
        textTurn('Removed a.txt.'),
      ]),
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
    const agentApp = createAcpAgent({ host, harness, version: '1.0.0' })

    const updates: Array<SessionUpdate> = []
    const titles: Array<string> = []
    const editor = client()
      .onNotification('session/update', ({ params }) => {
        updates.push(params.update)
      })
      .onRequest('session/request_permission', ({ params }) => {
        titles.push(params.title)
        return { outcome: { outcome: 'selected', optionId: 'allow' } }
      })

    await editor.connectWith(agentApp, async (ctx) => {
      const init = await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'test-editor', version: '1.0.0' },
      })
      expect(init.info.name).toBe('test/acp')

      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      const prompted = await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'remove a.txt' }],
      })
      expect(prompted.messageId).toMatch(/^user-/)

      await vi.waitFor(() =>
        expect(
          updates.some(
            (update) =>
              update.sessionUpdate === 'state_update' &&
              update.state === 'idle',
          ),
        ).toBe(true),
      )
    })

    expect(titles).toHaveLength(1)
    expect(remove).toHaveBeenCalledTimes(1)
    const states = updates
      .filter((update) => update.sessionUpdate === 'state_update')
      .map((update) => ('state' in update ? update.state : ''))
    expect(states).toEqual(['running', 'requires_action', 'running', 'idle'])
    const text = updates
      .map((update) =>
        update.sessionUpdate === 'agent_message_chunk'
          ? JSON.stringify(update)
          : '',
      )
      .join('')
    expect(text).toContain('Removed a.txt.')
    expect(
      updates.some(
        (update) =>
          update.sessionUpdate === 'tool_call_update' &&
          'rawInput' in update &&
          update.rawInput !== undefined,
      ),
    ).toBe(true)
    await host.close()
  })

  it('offers allow_always for an approval of permissions(), and keeps the answer', async () => {
    const ran: Array<string> = []
    const shell = definePlugin({
      name: 'test/shell',
      setup: () => ({
        tools: [
          toolDefinition({
            name: 'bash',
            description: 'Run a command',
            inputSchema: {
              type: 'object',
              properties: { command: { type: 'string' } },
              required: ['command'],
            },
          }).server(async () => {
            ran.push('bash')
            return 'ok'
          }),
        ],
        contribute: [
          PermissionRules.item({
            tool: 'bash',
            decision: 'ask',
            kind: 'execute',
          }),
          PermissionResources.item({ bash: { commands: () => ['ls'] } }),
        ],
      }),
    })
    const harness = defineHarness({
      name: 'test/acp-permissions',
      adapter: scripted([
        toolTurn('bash', '{"command":"ls"}'),
        textTurn('Listed.'),
      ]),
      plugins: () => [permissions({ root: '/work' }), shell],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const updates: Array<SessionUpdate> = []
    const offered: Array<Array<string>> = []
    const subjects: Array<unknown> = []
    const editor = client()
      .onNotification('session/update', ({ params }) => {
        updates.push(params.update)
      })
      .onRequest('session/request_permission', ({ params }) => {
        offered.push(params.options.map((option) => option.kind))
        subjects.push(params.subject)
        return { outcome: { outcome: 'selected', optionId: 'always' } }
      })

    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'test-editor', version: '1.0.0' },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'list the files' }],
      })
      await waitFor(() => expect(isIdle(updates)).toBe(true))
    })

    expect(offered).toEqual([['allow_once', 'allow_always', 'reject_once']])
    // The request names the tool call that the editor already shows.
    expect(subjects).toEqual([
      { type: 'tool_call', toolCall: { toolCallId: 'call_1' } },
    ])
    expect(ran).toEqual(['bash'])
    expect(agentText(updates)).toContain('Listed.')
    await host.close()
  })

  it('asks a question of a durable tool with a form elicitation', async () => {
    const greet = durableTool(
      toolDefinition({
        name: 'greet',
        description: 'Ask the user for a name',
        inputSchema: { type: 'object', properties: {} },
      }),
      async (_args, { step }) => {
        const answer = await step.ask({
          name: 'name',
          message: 'Name?',
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        })
        return { greeted: answer }
      },
    )
    const harness = defineHarness({
      name: 'test/acp-questions',
      adapter: scripted([toolTurn('greet', '{}'), textTurn('Greeted.')]),
      tools: [greet],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const updates: Array<SessionUpdate> = []
    const asked: Array<unknown> = []
    const editor = client()
      .onNotification('session/update', ({ params }) => {
        updates.push(params.update)
      })
      .onRequest('elicitation/create', ({ params }) => {
        asked.push(params)
        return { action: 'accept', content: { name: 'Ada' } }
      })

    let sessionId = ''
    await editor.connectWith(createAcpAgent({ host, harness }), async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'test-editor', version: '1.0.0' },
        capabilities: { elicitation: { form: {} } },
      })
      sessionId = (
        await ctx.request('session/new', { cwd: '/tmp', mcpServers: [] })
      ).sessionId
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'greet me' }],
      })
      await waitFor(() => expect(isIdle(updates)).toBe(true))
    })

    expect(asked).toMatchObject([
      {
        sessionId,
        mode: 'form',
        message: 'Name?',
        requestedSchema: { type: 'object', required: ['name'] },
      },
    ])
    expect(agentText(updates)).toContain('Greeted.')
    const session = await host.open(harness, { threadId: sessionId })
    const result = (await session.transcript()).find(
      (message) => message.role === 'tool',
    )
    expect(result?.content).toContain('Ada')
    await host.close()
  })

  it('refuses a second connection to one app, and keeps the first', async () => {
    const greet = durableTool(
      toolDefinition({
        name: 'greet',
        description: 'Ask the user for a name',
        inputSchema: { type: 'object', properties: {} },
      }),
      async (_args, { step }) => {
        const answer = await step.ask({
          name: 'name',
          message: 'Name?',
          schema: {
            type: 'object',
            properties: { name: { type: 'string' } },
            required: ['name'],
          },
        })
        return { greeted: answer }
      },
    )
    const harness = defineHarness({
      name: 'test/acp-connections',
      adapter: scripted([toolTurn('greet', '{}'), textTurn('Greeted.')]),
      tools: [greet],
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const app = createAcpAgent({ host, harness })
    const updates: Array<SessionUpdate> = []
    const asked: Array<unknown> = []
    const first = client()
      .onNotification('session/update', ({ params }) => {
        updates.push(params.update)
      })
      .onRequest('elicitation/create', ({ params }) => {
        asked.push(params)
        return { action: 'accept', content: { name: 'Ada' } }
      })
    // An editor that shows no elicitation, on its own connection.
    const second = client()

    await first.connectWith(app, async (ctx) => {
      await ctx.request('initialize', {
        protocolVersion: 2,
        info: { name: 'editor-a', version: '1.0.0' },
        capabilities: { elicitation: { form: {} } },
      })
      const { sessionId } = await ctx.request('session/new', {
        cwd: '/tmp',
        mcpServers: [],
      })
      // A second editor on the same app would share its sessions, so the
      // connection fails at once.
      expect(() =>
        second.connectWith(app, async (other) => {
          await other.request('initialize', {
            protocolVersion: 2,
            info: { name: 'editor-b', version: '1.0.0' },
          })
        }),
      ).toThrow(
        'An ACP agent app serves one connection. Call createAcpAgent once for each connection.',
      )
      await ctx.request('session/prompt', {
        sessionId,
        prompt: [{ type: 'text', text: 'greet me' }],
      })
      await waitFor(() => expect(isIdle(updates)).toBe(true))
    })

    // The first editor still gets its question: the second one did not
    // change what the first one can show.
    expect(asked).toHaveLength(1)
    expect(agentText(updates)).toContain('Greeted.')
    await host.close()
  })
})
