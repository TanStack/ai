import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import {
  defineAgent,
  type DefinedAgent,
} from '../src/activities/chat/agents/define-agent'
import { subagentRoute } from '../src/activities/chat/agents/route'
import { chat } from '../src/activities/chat'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import { EventType } from '../src/types'
import type { StreamChunk } from '../src/types'
import type { SubagentRouterPick } from '../src/activities/chat/agents/spawn'

function parentAdapter() {
  return createMockAdapter({
    iterations: [[ev.runStarted(), ev.runFinished('stop')]],
  })
}

/** Run one routed turn whose router returns `pick`. */
function routeTo(
  agents: ReadonlyArray<DefinedAgent>,
  pick: SubagentRouterPick,
) {
  return collectChunks(
    chat({
      adapter: parentAdapter().adapter,
      messages: [{ role: 'user', content: 'Go' }],
      subagents: { agents, router: () => pick },
    }),
  )
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
    run: run ?? async function* () {},
  })
}

describe('subagentRoute', () => {
  const agents = [
    defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: async function* () {},
    }),
    defineAgent({
      name: 'writer',
      description: 'Writes the post',
      run: async function* () {},
    }),
  ] as const

  it('maps yes/no answers onto names and order', () => {
    const route = subagentRoute(agents, {
      when: {
        researcher: 'Does this turn need facts?',
        writer: 'Does this turn need a draft?',
      },
    })

    expect(route.questions.researcher.instructions).toBe(
      'Does this turn need facts?',
    )
    expect(subagentRoute(agents).questions.researcher.instructions).toBe(
      'Looks up facts',
    )
    expect(subagentRoute(agents).questions.writer.instructions).toBe(
      'Writes the post',
    )
    subagentRoute(agents, {
      // @ts-expect-error writer is required when `when` is set
      when: {
        researcher: 'Does this turn need facts?',
      },
    })
    expect(
      route.pick({
        researcher: { value: true },
        writer: { value: true },
        order: { value: 'sequence' },
      }),
    ).toEqual({
      names: ['researcher', 'writer'],
      order: 'sequence',
    })
    expect(
      route.pick({
        researcher: { value: true },
        writer: { value: false },
        order: { value: 'parallel' },
      }),
    ).toBe('researcher')
    expect(
      route.pick({
        researcher: { value: false },
        writer: { value: false },
        order: { value: 'parallel' },
      }),
    ).toBe('main')
  })

  it('builds a later step for agents named in then', () => {
    const desk = [
      ...agents,
      defineAgent({
        name: 'seo',
        description: 'Suggests titles',
        run: async function* () {},
      }),
    ] as const
    const route = subagentRoute(desk, { then: ['writer'] })
    expect(
      route.pick({
        researcher: { value: true },
        writer: { value: true },
        seo: { value: true },
        order: { value: 'sequence' },
      }),
    ).toEqual({
      steps: [
        { names: ['researcher', 'seo'], order: 'parallel' },
        { names: ['writer'] },
      ],
    })
    expect(
      route.pick({
        researcher: { value: true },
        writer: { value: false },
        seo: { value: true },
        order: { value: 'parallel' },
      }),
    ).toEqual({
      names: ['researcher', 'seo'],
      order: 'parallel',
    })
  })

  it('rejects an agent named order', () => {
    expect(() =>
      subagentRoute([
        defineAgent({
          name: 'order',
          description: 'Bad name',
          run: async function* () {},
        }),
      ]),
    ).toThrow('subagentRoute cannot use an agent named "order"')
  })

  const skuSchema = z.object({ sku: z.string() })
  const topicSchema = z.object({ topic: z.string() })
  const inputDesk = [
    defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: async function* () {},
    }),
    defineAgent({
      name: 'pricer',
      description: 'Prices one product',
      inputSchema: skuSchema,
      run: async function* () {},
    }),
    defineAgent({
      name: 'writer',
      description: 'Writes the post',
      inputSchema: topicSchema,
      run: async function* () {},
    }),
    defineAgent({
      name: 'seo',
      description: 'Suggests titles',
      run: async function* () {},
    }),
  ] as const
  const inputs = { pricer: { sku: 'A-1' }, writer: { topic: 'Pricing' } }

  /** `decide()` answers where only the given agents say yes. */
  function yesTo(...names: Array<(typeof inputDesk)[number]['name']>) {
    return {
      researcher: { value: names.includes('researcher') },
      pricer: { value: names.includes('pricer') },
      writer: { value: names.includes('writer') },
      seo: { value: names.includes('seo') },
      order: { value: 'parallel' as const },
    }
  }

  it('lists the picked agents that need input, in agent-list order', () => {
    const route = subagentRoute(inputDesk)

    expect(route.needsInput(yesTo('researcher', 'pricer', 'seo'))).toEqual([
      { name: 'pricer', inputSchema: skuSchema },
    ])
    expect(route.needsInput(yesTo('writer', 'pricer'))).toEqual([
      { name: 'pricer', inputSchema: skuSchema },
      { name: 'writer', inputSchema: topicSchema },
    ])
    expect(route.needsInput(yesTo('researcher', 'seo'))).toEqual([])
  })

  it('puts each input on its name in a single pick and in names', () => {
    const route = subagentRoute(inputDesk)

    expect(route.pick(yesTo('pricer'), { inputs })).toEqual({
      name: 'pricer',
      input: { sku: 'A-1' },
    })
    expect(
      route.pick(yesTo('researcher', 'pricer', 'writer'), { inputs }),
    ).toEqual({
      names: [
        'researcher',
        { name: 'pricer', input: { sku: 'A-1' } },
        { name: 'writer', input: { topic: 'Pricing' } },
      ],
      order: 'parallel',
    })
  })

  it('puts each input on its name in each step', () => {
    const route = subagentRoute(inputDesk, { then: ['writer'] })

    expect(
      route.pick(yesTo('researcher', 'pricer', 'writer'), { inputs }),
    ).toEqual({
      steps: [
        {
          names: ['researcher', { name: 'pricer', input: { sku: 'A-1' } }],
          order: 'parallel',
        },
        { names: [{ name: 'writer', input: { topic: 'Pricing' } }] },
      ],
    })
  })

  it('throws when a picked agent with a schema has no input', () => {
    const route = subagentRoute(inputDesk)

    expect(() => route.pick(yesTo('researcher', 'pricer'))).toThrow(
      'Agent "pricer" needs input. Pass it in inputs.',
    )
  })
})

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
      (
        chunk,
      ): chunk is Extract<StreamChunk, { type: 'TEXT_MESSAGE_CONTENT' }> =>
        chunk.type === 'TEXT_MESSAGE_CONTENT' &&
        'subagentRunId' in chunk &&
        chunk.subagentRunId !== undefined,
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
    expect(
      chunks.find((chunk) => chunk.type === 'SUBAGENT_ERROR'),
    ).toMatchObject({ type: 'SUBAGENT_ERROR', message: 'Stopped' })
  })

  it('lets the router override bag order with a sequence plan', async () => {
    let writerSaw = ''
    const chunks = await collectChunks(
      chat({
        adapter: parentAdapter().adapter,
        messages: [
          { role: 'user', content: 'Research squids and write an article' },
        ],
        subagents: {
          agents: [
            researcherAgent('Squids have three hearts.'),
            defineAgent({
              name: 'writer',
              description: 'Writes the post',
              run: async function* (ctx) {
                writerSaw = ctx.messages
                  .map((message) =>
                    'content' in message ? String(message.content) : '',
                  )
                  .join('\n')
              },
            }),
          ],
          strategy: 'exclusive',
          order: 'parallel',
          router: () => ({
            names: ['researcher', 'writer'],
            order: 'sequence',
          }),
        },
      }) as AsyncIterable<StreamChunk>,
    )

    const researcherFinished = chunks.findIndex(
      (chunk) => chunk.type === 'SUBAGENT_FINISHED',
    )
    const writerStarted = chunks.findIndex(
      (chunk) => chunk.type === 'SUBAGENT_STARTED' && chunk.name === 'writer',
    )
    expect(writerStarted).toBeGreaterThan(researcherFinished)
    expect(writerSaw).toContain('Squids have three hearts.')
  })

  it('lets the router override bag order with a parallel plan', async () => {
    let writerSaw = ''
    await collectChunks(
      chat({
        adapter: parentAdapter().adapter,
        messages: [{ role: 'user', content: 'Research two animals' }],
        subagents: {
          agents: [
            researcherAgent('Squids have three hearts.'),
            defineAgent({
              name: 'writer',
              description: 'Writes the post',
              run: async function* (ctx) {
                writerSaw = ctx.messages
                  .map((message) =>
                    'content' in message ? String(message.content) : '',
                  )
                  .join('\n')
              },
            }),
          ],
          strategy: 'exclusive',
          order: 'sequence',
          router: () => ({
            names: ['researcher', 'writer'],
            order: 'parallel',
          }),
        },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(writerSaw).not.toContain('Squids have three hearts.')
  })

  it('runs order sequence one child after another and forwards text', async () => {
    let writerSaw = ''
    const chunks = await collectChunks(
      chat({
        adapter: parentAdapter().adapter,
        messages: [
          { role: 'user', content: 'Research squids and write an article' },
        ],
        subagents: {
          agents: [
            researcherAgent('Squids have three hearts.'),
            defineAgent({
              name: 'writer',
              description: 'Writes the post',
              run: async function* (ctx) {
                writerSaw = ctx.messages
                  .map((message) =>
                    'content' in message ? String(message.content) : '',
                  )
                  .join('\n')
              },
            }),
          ],
          strategy: 'exclusive',
          order: 'sequence',
          router: () => ['researcher', 'writer'],
        },
      }) as AsyncIterable<StreamChunk>,
    )

    const researcherFinished = chunks.findIndex(
      (chunk) => chunk.type === 'SUBAGENT_FINISHED',
    )
    const writerStarted = chunks.findIndex(
      (chunk) => chunk.type === 'SUBAGENT_STARTED' && chunk.name === 'writer',
    )
    expect(researcherFinished).toBeGreaterThan(-1)
    expect(writerStarted).toBeGreaterThan(researcherFinished)
    expect(writerSaw).toContain('Squids have three hearts.')
  })

  it('runs a parallel step and then feeds both texts to the writer', async () => {
    let writerSaw = ''
    const chunks = await collectChunks(
      chat({
        adapter: parentAdapter().adapter,
        messages: [
          {
            role: 'user',
            content: 'Research squids, suggest SEO, and write the article',
          },
        ],
        subagents: {
          agents: [
            researcherAgent('Squids have three hearts.'),
            defineAgent({
              name: 'seo',
              description: 'Suggests titles',
              run: () =>
                chat({
                  adapter: childTextAdapter('Title: Three hearts'),
                  messages: [],
                }),
            }),
            defineAgent({
              name: 'writer',
              description: 'Writes the post',
              run: async function* (ctx) {
                writerSaw = ctx.messages
                  .map((message) =>
                    'content' in message ? String(message.content) : '',
                  )
                  .join('\n')
              },
            }),
          ],
          strategy: 'exclusive',
          router: () => ({
            steps: [
              { names: ['researcher', 'seo'], order: 'parallel' },
              { names: ['writer'] },
            ],
          }),
        },
      }) as AsyncIterable<StreamChunk>,
    )

    const writerStarted = chunks.findIndex(
      (chunk) => chunk.type === 'SUBAGENT_STARTED' && chunk.name === 'writer',
    )
    const researcherFinished = chunks.findIndex(
      (chunk) =>
        chunk.type === 'SUBAGENT_FINISHED' &&
        chunks.some(
          (started) =>
            started.type === 'SUBAGENT_STARTED' &&
            started.name === 'researcher' &&
            started.subagentRunId === chunk.subagentRunId,
        ),
    )
    const seoFinished = chunks.findIndex(
      (chunk) =>
        chunk.type === 'SUBAGENT_FINISHED' &&
        chunks.some(
          (started) =>
            started.type === 'SUBAGENT_STARTED' &&
            started.name === 'seo' &&
            started.subagentRunId === chunk.subagentRunId,
        ),
    )
    expect(writerStarted).toBeGreaterThan(researcherFinished)
    expect(writerStarted).toBeGreaterThan(seoFinished)
    expect(writerSaw).toContain('Squids have three hearts.')
    expect(writerSaw).toContain('Title: Three hearts')
  })

  it('does not start the next step after a subagent error', async () => {
    const chunks = await routeTo(
      [
        namedAgent('researcher', async function* () {
          throw new Error('lookup failed')
        }),
        namedAgent('writer'),
      ],
      { steps: [{ names: ['researcher'] }, { names: ['writer'] }] },
    )

    expect(
      chunks.some(
        (chunk) => chunk.type === 'SUBAGENT_STARTED' && chunk.name === 'writer',
      ),
    ).toBe(false)
    expect(chunks.some((chunk) => chunk.type === 'RUN_ERROR')).toBe(true)
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

  it("puts the failing child's own message and code on RUN_ERROR", async () => {
    const chunks = await routeTo(
      [
        namedAgent('researcher', async function* () {
          yield ev.runStarted('child-run', 'child-thread')
          yield {
            type: EventType.RUN_ERROR,
            threadId: 'child-thread',
            runId: 'child-run',
            message: 'provider returned 500',
            code: 'upstream_error',
            timestamp: Date.now(),
          }
        }),
      ],
      ['researcher'],
    )

    const error = chunks.find((chunk) => chunk.type === 'RUN_ERROR')
    expect(error).toMatchObject({
      message: 'provider returned 500',
      code: 'upstream_error',
    })
  })

  it("keeps a finished sibling's usage on the failed turn", async () => {
    const chunks = await routeTo(
      [
        namedAgent('writer', async function* () {
          yield ev.runStarted('writer-run', 'writer-thread')
          yield ev.runFinished(
            'stop',
            'writer-run',
            { promptTokens: 11, completionTokens: 7, totalTokens: 18 },
            'writer-thread',
          )
        }),
        namedAgent('researcher', async function* () {
          throw new Error('lookup failed')
        }),
      ],
      { names: ['writer', 'researcher'] },
    )

    const error = chunks.find((chunk) => chunk.type === 'RUN_ERROR')
    expect(error?.message).toBe('lookup failed')
    // The turn failed, but the writer's tokens were really spent.
    expect(error?.usage).toEqual([
      expect.objectContaining({ inputTokens: 11, outputTokens: 7 }),
    ])
  })

  it('settles the persistence record when the router is aborted', async () => {
    const calls: Array<string> = []
    const controller = new AbortController()

    await collectChunks(
      chat({
        adapter: parentAdapter().adapter,
        messages: [{ role: 'user', content: 'Go' }],
        abortController: controller,
        middleware: [
          {
            name: 'spy',
            routedSubagentPersistence: {
              start: async () => void calls.push('start'),
              chunk: async () => {},
              finish: async () => void calls.push('finish'),
              abort: async () => void calls.push('abort'),
            },
          },
        ],
        subagents: {
          agents: [namedAgent('writer')],
          strategy: 'exclusive',
          router: async () => {
            // Stop lands while the router is still deciding.
            controller.abort()
            return ['writer']
          },
        },
      }) as AsyncIterable<StreamChunk>,
    )

    // A record that opened must close, or reconstructChat hands the client a
    // run to tail that never emits.
    expect(calls).toEqual(['start', 'abort'])
  })

  it('throws when sandbox inherit starts two children', async () => {
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

  it('lists the agents the router can pick when it picks an unknown one', async () => {
    await expect(
      routeTo([researcherAgent('ok'), namedAgent('writer')], 'pricer'),
    ).rejects.toThrow(
      'Unknown subagent: pricer. The router can pick: researcher, writer.',
    )
  })

  const emptyPicks: Array<[string, SubagentRouterPick]> = [
    ['an empty list', []],
    ['empty steps', { steps: [] }],
  ]
  it.each(emptyPicks)('fails on %s', async (_label, pick) => {
    await expect(routeTo([namedAgent('writer')], pick)).rejects.toThrow(
      'subagents.router must return main, a name, a list of names, { names, order }, or { steps }.',
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

describe('defineAgent inputSchema', () => {
  const briefSchema = z.object({
    task: z.string({ error: 'task must be text' }),
  })
  const brief = { task: 'Price Vendor A' }

  /** A parent model that calls `researcher` once per args string, then stops. */
  function parentCalling(...args: Array<string>) {
    return createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ...args.flatMap((json, index) => [
            ev.toolStart(`call_${index}`, 'researcher'),
            ev.toolArgs(`call_${index}`, json),
          ]),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.runFinished('stop')],
      ],
    })
  }

  /** A researcher that records every `ctx.input` it gets. */
  function briefResearcher() {
    const inputs: Array<{ task: string }> = []
    const agent = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      inputSchema: briefSchema,
      run: async function* (ctx) {
        expectTypeOf(ctx.input).toEqualTypeOf<{ task: string }>()
        inputs.push(ctx.input)
      },
    })
    return { agent, inputs }
  }

  it('shows the schema to the model and passes the input to run', async () => {
    const { agent, inputs } = briefResearcher()
    const { adapter, calls } = parentCalling('{"task":"Price Vendor A"}')

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Compare pricing' }],
        subagents: { agents: [agent] },
      }) as AsyncIterable<StreamChunk>,
    )

    const tool = calls[0]?.tools?.find((entry) => entry.name === 'researcher')
    expect(tool?.inputSchema).toMatchObject({
      type: 'object',
      properties: { task: { type: 'string' } },
    })
    expect(inputs).toEqual([{ task: 'Price Vendor A' }])
  })

  it('gives each call to the same agent its own input', async () => {
    const { agent, inputs } = briefResearcher()
    const { adapter } = parentCalling(
      '{"task":"Price Vendor A"}',
      '{"task":"Price Vendor B"}',
    )

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Compare pricing' }],
        subagents: { agents: [agent] },
      }) as AsyncIterable<StreamChunk>,
    )

    expect(inputs).toHaveLength(2)
    expect(inputs).toEqual(
      expect.arrayContaining([
        { task: 'Price Vendor A' },
        { task: 'Price Vendor B' },
      ]),
    )
  })

  it('returns a bad input to the model and does not start the child', async () => {
    const { agent, inputs } = briefResearcher()
    const { adapter } = parentCalling('{}')

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Compare pricing' }],
        subagents: { agents: [agent] },
      }) as AsyncIterable<StreamChunk>,
    )

    const result = chunks.find(
      (chunk) =>
        chunk.type === EventType.TOOL_CALL_RESULT &&
        chunk.toolCallId === 'call_0',
    )
    expect(result).toMatchObject({
      content: expect.stringContaining(
        'Input validation failed for tool researcher',
      ),
    })
    expect(chunks.some((chunk) => chunk.type === 'SUBAGENT_STARTED')).toBe(
      false,
    )
    expect(inputs).toEqual([])
  })

  it('passes the parsed args through a plain JSON Schema', async () => {
    const inputs: Array<unknown> = []
    const agent = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      inputSchema: {
        type: 'object',
        properties: { task: { type: 'string' } },
        required: ['task'],
      },
      run: async function* (ctx) {
        inputs.push(ctx.input)
      },
    })
    const { adapter, calls } = parentCalling('{"task":"Price Vendor A"}')

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Compare pricing' }],
        subagents: { agents: [agent] },
      }) as AsyncIterable<StreamChunk>,
    )

    const tool = calls[0]?.tools?.find((entry) => entry.name === 'researcher')
    expect(tool?.inputSchema).toMatchObject({
      properties: { task: { type: 'string' } },
    })
    expect(inputs).toEqual([{ task: 'Price Vendor A' }])
  })

  it('keeps ctx.input undefined for an agent without inputSchema', async () => {
    const inputs: Array<unknown> = []
    const agent = defineAgent({
      name: 'researcher',
      description: 'Looks up facts',
      run: async function* (ctx) {
        expectTypeOf(ctx.input).toEqualTypeOf<undefined>()
        inputs.push(ctx.input)
      },
    })
    const { adapter, calls } = parentCalling('{}')

    await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Research this' }],
        subagents: { agents: [agent] },
      }) as AsyncIterable<StreamChunk>,
    )

    const tool = calls[0]?.tools?.find((entry) => entry.name === 'researcher')
    // The engine gives a tool with no schema an empty object schema.
    expect(tool?.inputSchema?.properties ?? {}).toEqual({})
    expect(inputs).toEqual([undefined])
  })

  const routedPicks: Array<[string, SubagentRouterPick]> = [
    ['a single pick', { name: 'researcher', input: brief }],
    ['a list', ['writer', { name: 'researcher', input: brief }]],
    [
      'a names plan',
      { names: [{ name: 'researcher', input: brief }], order: 'sequence' },
    ],
    [
      'a later step',
      {
        steps: [
          { names: ['writer'] },
          { names: [{ name: 'researcher', input: brief }] },
        ],
      },
    ],
  ]
  it.each(routedPicks)(
    'passes the router input to run as ctx.input for %s',
    async (_label, pick) => {
      const { agent, inputs } = briefResearcher()
      await routeTo([agent, namedAgent('writer')], pick)
      expect(inputs).toEqual([{ task: 'Price Vendor A' }])
    },
  )

  it('fails before any child starts when a picked agent has no input', async () => {
    const { agent, inputs } = briefResearcher()
    let writerRuns = 0
    const writer = namedAgent('writer', async function* () {
      writerRuns += 1
    })

    await expect(
      routeTo([agent, writer], {
        steps: [{ names: ['writer'] }, { names: ['researcher'] }],
      }),
    ).rejects.toThrow(
      `Agent "researcher" needs input. Return { name: 'researcher', input } from the router.`,
    )
    expect(writerRuns).toBe(0)
    expect(inputs).toEqual([])
  })

  it('fails when the router input does not match the schema', async () => {
    const { agent, inputs } = briefResearcher()

    await expect(
      routeTo([agent], { name: 'researcher', input: { task: 42 } }),
    ).rejects.toThrow(
      'Input validation failed for agent researcher: task must be text',
    )
    expect(inputs).toEqual([])
  })
})

describe('subagent guards', () => {
  it('rejects the reserved name main', () => {
    expect(() => namedAgent('main')).toThrow("cannot use the name 'main'")
  })

  it('rejects subagents together with outputSchema', () => {
    const { adapter } = parentAdapter()
    expect(() =>
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        outputSchema: {
          type: 'object',
          properties: { title: { type: 'string' } },
        },
        subagents: { agents: [namedAgent('researcher')] },
      }),
    ).toThrow('does not support subagents together with outputSchema')
  })
})
