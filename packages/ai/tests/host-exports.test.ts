import { describe, expect, it } from 'vitest'
import {
  CapabilityRegistry,
  chat,
  createSubagentId,
  defineAgent,
  getMetadata,
  provideMetadata,
  runAgentStream,
} from '../src'
import { collectChunks, createMockAdapter, ev } from './test-utils'
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
