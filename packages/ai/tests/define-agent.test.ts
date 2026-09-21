import { describe, expect, it } from 'vitest'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { chat } from '../src/activities/chat'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { StreamChunk } from '../src/types'

describe('defineAgent', () => {
  it('stores name, description, and run', () => {
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: async function* () {},
    })
    expect(researcher.name).toBe('researcher')
    expect(researcher.description).toBe('Looks up facts')
    expect(typeof researcher.run).toBe('function')
  })

  it('throws when name is empty', () => {
    expect(() =>
      defineAgent({
        name: '  ',
        description: 'Looks up facts',
        run: async function* () {},
      }),
    ).toThrow('defineAgent requires a non-empty name')
  })

  it('throws when description is empty', () => {
    expect(() =>
      defineAgent({
        name: 'researcher',
        description: '',
        run: async function* () {},
      }),
    ).toThrow('defineAgent requires a non-empty description')
  })
})

describe('chat({ subagents }) router spawn', () => {
  it('emits SUBAGENT_STARTED and SUBAGENT_FINISHED with subagentRunId', async () => {
    const { adapter: childAdapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('child-run', 'child-thread'),
          ev.textStart('child-msg'),
          ev.textContent('Paris', 'child-msg'),
          ev.textEnd('child-msg'),
          ev.runFinished('stop', 'child-run', undefined, 'child-thread'),
        ],
      ],
    })

    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: (ctx) =>
        chat({
          adapter: childAdapter,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
        }),
    })

    const { adapter: parentAdapter } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished('stop')]],
    })

    const stream = chat({
      adapter: parentAdapter,
      messages: [{ role: 'user', content: 'Capital of France?' }],
      subagents: {
        agents: [researcher],
        strategy: 'exclusive',
        router: () => 'researcher',
      },
    })

    const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
    const started = chunks.find((chunk) => chunk.type === 'SUBAGENT_STARTED')
    const finished = chunks.find((chunk) => chunk.type === 'SUBAGENT_FINISHED')
    const text = chunks.find(
      (chunk) =>
        chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.subagentRunId,
    )

    expect(started).toMatchObject({
      type: 'SUBAGENT_STARTED',
      name: 'researcher',
    })
    expect(started && 'subagentRunId' in started).toBe(true)
    expect(finished).toMatchObject({ type: 'SUBAGENT_FINISHED' })
    expect(text).toMatchObject({
      type: 'TEXT_MESSAGE_CONTENT',
      delta: 'Paris',
    })
    expect(text?.subagentRunId).toBe(
      started && 'subagentRunId' in started ? started.subagentRunId : undefined,
    )
    expect(chunks.some((chunk) => chunk.type === 'RUN_STARTED')).toBe(true)
    expect(chunks.some((chunk) => chunk.type === 'RUN_FINISHED')).toBe(true)
  })

  it('does not send the parent adapter tools when a router picks a child', async () => {
    const { adapter: childAdapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('child-run', 'child-thread'),
          ev.textStart('child-msg'),
          ev.textContent('ok', 'child-msg'),
          ev.textEnd('child-msg'),
          ev.runFinished('stop', 'child-run', undefined, 'child-thread'),
        ],
      ],
    })
    const { adapter: parentAdapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished('stop')]],
    })
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: (ctx) =>
        chat({
          adapter: childAdapter,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
        }),
    })

    await collectChunks(
      chat({
        adapter: parentAdapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: {
          agents: [researcher],
          router: () => 'researcher',
          strategy: 'exclusive',
        },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(calls).toHaveLength(0)
  })
})

describe('chat({ subagents }) synthetic tools', () => {
  it('adds a synthetic tool named after the agent when router is omitted', async () => {
    const { adapter: childAdapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted('child-run', 'child-thread'),
          ev.textStart('child-msg'),
          ev.textContent('done', 'child-msg'),
          ev.textEnd('child-msg'),
          ev.runFinished('stop', 'child-run', undefined, 'child-thread'),
        ],
      ],
    })
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: (ctx) =>
        chat({
          adapter: childAdapter,
          messages: ctx.messages,
          threadId: ctx.threadId,
          runId: ctx.runId,
        }),
    })
    const { adapter, calls } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call_1', 'researcher'),
          ev.toolArgs('call_1', '{}'),
          ev.runFinished('tool_calls'),
        ],
        [
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('All set'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ],
      ],
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Research this' }],
        subagents: { agents: [researcher] },
      }) as AsyncIterable<StreamChunk>,
    )

    const toolNames = (calls[0]?.tools ?? []).map((tool) => tool.name)
    expect(toolNames).toContain('researcher')
    expect(chunks.some((chunk) => chunk.type === 'SUBAGENT_STARTED')).toBe(
      true,
    )
    expect(chunks.some((chunk) => chunk.type === 'SUBAGENT_FINISHED')).toBe(
      true,
    )
  })
})
