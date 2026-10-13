import { describe, expect, it } from 'vitest'
import {
  CapabilityRegistry,
  chat,
  createSubagentId,
  createSubagentSink,
  defineAgent,
  getMetadata,
  provideMetadata,
  runAgentStream,
} from '../src'
import { collectChunks, createMockAdapter, ev, serverTool } from './test-utils'
import type { MetadataStore, SubagentsBag } from '../src'

describe('host exports from the package root', () => {
  it('runAgentStream runs an agent outside a parent chat turn', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('child-run', 'thread-1'),
          ev.textStart('child-msg'),
          ev.textContent('Squids have three hearts.', 'child-msg'),
          ev.textEnd('child-msg'),
          ev.runFinished('stop', 'child-run', undefined, 'thread-1'),
        ],
      ],
    })
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: (ctx) =>
        chat({
          adapter,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
        }),
    })
    const subagents: SubagentsBag = { agents: [researcher] }
    const subagentRunId = createSubagentId()

    const chunks = await collectChunks(
      runAgentStream(subagents.agents[0]!, {
        input: undefined,
        messages: [{ role: 'user', content: 'Squid facts' }],
        threadId: 'thread-1',
        runId: 'child-run',
        parentRunId: 'host-run',
        subagentRunId,
      }),
    )

    expect(subagentRunId).not.toBe(createSubagentId())
    expect(chunks[0]).toMatchObject({
      type: 'SUBAGENT_STARTED',
      subagentRunId,
      name: 'researcher',
    })
    expect(chunks.at(-1)).toMatchObject({
      type: 'SUBAGENT_FINISHED',
      subagentRunId,
    })
    const text = chunks
      .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
      .map((chunk) => chunk.delta)
      .join('')
    expect(text).toBe('Squids have three hearts.')
    expect(
      chunks.some(
        (chunk) =>
          chunk.type === 'RUN_STARTED' ||
          chunk.type === 'RUN_FINISHED' ||
          chunk.type === 'MESSAGES_SNAPSHOT',
      ),
    ).toBe(false)
  })

  it('keeps interrupt objects and usage on the sink', async () => {
    const usage = { promptTokens: 3, completionTokens: 1, totalTokens: 4 }
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('child-run', 'thread-1'),
          ev.toolStart('call_1', 'ask'),
          ev.toolArgs('call_1', '{}'),
          ev.runFinished('tool_calls', 'child-run', usage, 'thread-1'),
        ],
      ],
    })
    const ask = serverTool('ask', () => {
      throw {
        name: 'MCPInputRequiredError',
        kind: 'form',
        request: { message: 'Sign in' },
        reason: 'auth_required',
      }
    })
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: (ctx) =>
        chat({
          adapter,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
          tools: [ask],
        }),
    })
    const sink = createSubagentSink()
    const chunks = await collectChunks(
      runAgentStream(
        researcher,
        {
          input: undefined,
          messages: [{ role: 'user', content: 'Squid facts' }],
          threadId: 'thread-1',
          runId: 'child-run',
          parentRunId: 'host-run',
          subagentRunId: createSubagentId(),
        },
        sink,
      ),
    )
    const finished = chunks.at(-1)

    expect(finished).toMatchObject({
      type: 'SUBAGENT_FINISHED',
      outcome: { type: 'suspended' },
    })
    expect(finished && 'usage' in finished).toBe(false)
    expect(sink.interrupts).toMatchObject([
      { id: 'mcp_input_call_1', reason: 'auth_required' },
    ])
    if (finished?.type !== 'SUBAGENT_FINISHED') return
    expect(finished.outcome).toMatchObject({
      type: 'suspended',
      interruptIds: ['mcp_input_call_1'],
    })
    expect(sink.usage).toEqual([
      { inputTokens: 3, outputTokens: 1, totalTokens: 4 },
    ])
  })

  it('CapabilityRegistry lets a host provide a capability without chat()', () => {
    const store: MetadataStore = {
      get: () => Promise.resolve(null),
      set: () => Promise.resolve(),
      delete: () => Promise.resolve(),
    }
    const ctx = { capabilities: new CapabilityRegistry() }

    provideMetadata(ctx, store)

    expect(getMetadata(ctx)).toBe(store)
  })
})
