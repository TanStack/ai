import { describe, expect, it } from 'vitest'
import {
  defineAgent,
  type DefinedAgent,
} from '../src/activities/chat/agents/define-agent'
import { chat } from '../src/activities/chat'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { StreamChunk } from '../src/types'

function parentAdapter() {
  return createMockAdapter({
    iterations: [[ev.runStarted(), ev.runFinished('stop')]],
  })
}

function childTextAdapter(text: string) {
  return createMockAdapter({
    iterations: [
      [
        ev.runStarted('child-run', 'child-thread'),
        ev.textStart('child-msg'),
        ev.textContent(text, 'child-msg'),
        ev.textEnd('child-msg'),
        ev.runFinished('stop', 'child-run', undefined, 'child-thread'),
      ],
    ],
  }).adapter
}

function researcherAgent(text: string) {
  const adapter = childTextAdapter(text)
  return defineAgent({
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
}

function namedAgent(name: string, run?: DefinedAgent['run']) {
  return defineAgent({
    name,
    description: `${name} agent`,
    run: run ?? (async function* () {}),
  })
}

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
    const researcher = researcherAgent('Paris')
    const stream = chat({
      adapter: parentAdapter().adapter,
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
      (chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT' && chunk.subagentRunId,
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
    const { adapter, calls } = parentAdapter()
    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Go' }],
        subagents: {
          agents: [researcherAgent('ok')],
          router: () => 'researcher',
          strategy: 'exclusive',
        },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(calls).toHaveLength(0)
  })

  it('emits SUBAGENT_ERROR when abortController aborts a hanging child', async () => {
    const abortController = new AbortController()
    const researcher = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: async function* () {
        await new Promise<void>(() => {})
      },
    })
    const chunks: Array<StreamChunk> = []
    const stream = chat({
      adapter: parentAdapter().adapter,
      messages: [{ role: 'user', content: 'Go' }],
      abortController,
      subagents: {
        agents: [researcher],
        strategy: 'exclusive',
        router: () => 'researcher',
      },
    })

    for await (const chunk of stream as AsyncIterable<StreamChunk>) {
      chunks.push(chunk)
      if (chunk.type === 'SUBAGENT_STARTED') {
        queueMicrotask(() => abortController.abort())
      }
    }

    expect(chunks.some((chunk) => chunk.type === 'SUBAGENT_ERROR')).toBe(true)
    expect(chunks.some((chunk) => chunk.type === 'SUBAGENT_FINISHED')).toBe(
      false,
    )
    expect(chunks.find((chunk) => chunk.type === 'SUBAGENT_ERROR')).toMatchObject(
      { type: 'SUBAGENT_ERROR', message: 'Stopped' },
    )
  })

  it('gives each parallel routed child its own threadId', async () => {
    const threadIds: Array<string> = []

    await collectChunks(
      chat({
        adapter: parentAdapter().adapter,
        threadId: 'parent-thread',
        messages: [{ role: 'user', content: 'Go' }],
        subagents: {
          agents: [
            namedAgent('alpha', async function* (ctx) {
              threadIds.push(ctx.threadId)
            }),
            namedAgent('beta', async function* (ctx) {
              threadIds.push(ctx.threadId)
            }),
          ],
          strategy: 'exclusive',
          router: () => ['alpha', 'beta'],
        },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(new Set(threadIds)).toEqual(
      new Set(['parent-thread:alpha', 'parent-thread:beta']),
    )
  })

  it("throws when sandbox inherit starts two children", async () => {
    await expect(
      collectChunks(
        chat({
          adapter: parentAdapter().adapter,
          messages: [{ role: 'user', content: 'Go' }],
          subagents: {
            agents: [namedAgent('alpha'), namedAgent('beta')],
            sandbox: 'inherit',
            router: () => ['alpha', 'beta'],
          },
        }) as AsyncIterable<StreamChunk>,
      ),
    ).rejects.toThrow(
      "subagents.sandbox 'inherit' cannot start two children in one turn",
    )
  })
})

describe('chat({ subagents }) synthetic tools', () => {
  it('adds a synthetic tool named after the agent when router is omitted', async () => {
    const researcher = researcherAgent('done')
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
    expect(chunks.some((chunk) => chunk.type === 'SUBAGENT_STARTED')).toBe(true)
    expect(chunks.some((chunk) => chunk.type === 'SUBAGENT_FINISHED')).toBe(
      true,
    )
  })
})
