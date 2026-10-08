import { describe, expect, it, vi } from 'vitest'
import { EventType, toolDefinition } from '@tanstack/ai'
import { client } from '@agentclientprotocol/sdk/experimental/v2'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { createAcpAgent } from '../src/agent'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'
import type { SessionUpdate } from '@agentclientprotocol/sdk/experimental/v2'

const now = () => Date.now()

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
    const permissions: Array<string> = []
    const editor = client()
      .onNotification('session/update', ({ params }) => {
        updates.push(params.update)
      })
      .onRequest('session/request_permission', ({ params }) => {
        permissions.push(params.title)
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
      expect(prompted.messageId).toMatch(/^op-chat-/)

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

    expect(permissions).toHaveLength(1)
    expect(remove).toHaveBeenCalledTimes(1)
    const states = updates
      .filter((update) => update.sessionUpdate === 'state_update')
      .map((update) => ('state' in update ? update.state : ''))
    expect(states).toEqual(['running', 'requires_action', 'idle'])
    const text = updates
      .map((update) =>
        update.sessionUpdate === 'agent_message_chunk'
          ? JSON.stringify(update)
          : '',
      )
      .join('')
    expect(text).toContain('Removed a.txt.')
    expect(
      updates.some((update) => update.sessionUpdate === 'tool_call_update'),
    ).toBe(true)
    await host.close()
  })
})
