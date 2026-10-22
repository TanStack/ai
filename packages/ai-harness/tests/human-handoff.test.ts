import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import {
  AccessDeniedError,
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  definePlugin,
  logIdOf,
  membersOnly,
} from '../src'
import { mediaPart } from '../src/media-entry'
import { applyInput, parseHarnessInput } from '../src/protocol'
import {
  applyEvent,
  emptyState,
  messagesFromTranscript,
} from '../src/view/reduce'
import { createHarnessHandler } from '../src/server'
import { createHarnessClient } from '../src/client'
import { createSessionView } from '../src/view'
import {
  gate,
  messageTexts,
  mockAdapter,
  storedThreadState,
  text,
  toolCall,
} from './helpers'
import type { AnyTool } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type {
  AnyAgent,
  HarnessHostOptions,
  HarnessPlugin,
  HarnessRunContext,
  HarnessSession,
  Operation,
  HarnessUser,
} from '../src'
import type { Reply } from './helpers'
import type { ViewMessage } from '../src/view/types'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
const NAME = 'test/human-handoff'

interface User extends HarnessUser {
  tenantId: string
}
const olga: User = { id: 'olga', tenantId: 'acme' }
const bea: User = { id: 'bea', tenantId: 'acme' }
const vic: User = { id: 'vic', tenantId: 'acme' }

/** The main model hands the turn to a person with the `handoff` tool. */
const toHuman: Reply = () =>
  toolCall(
    'handoff',
    { to: { human: true }, note: 'The user asks for a person.' },
    'call_human',
  )

/** An agent that answers with its own model. */
function modelAgent(name: string, replies: Array<Reply>) {
  const model = mockAdapter(replies)
  const agent = defineAgent({
    name,
    description: `The ${name} desk`,
    run: (ctx) =>
      ctx.chat({ adapter: model.adapter, systemPrompts: [`You are ${name}.`] }),
  })
  return { agent, model }
}

function routingHarness(options: {
  agents: ReadonlyArray<AnyAgent>
  replies: Array<Reply>
  tools?: ReadonlyArray<AnyTool>
  /** `routing.allowHandoffToHuman`. Default true. */
  humans?: boolean
  plugins?: ReadonlyArray<HarnessPlugin>
}) {
  const main = mockAdapter(options.replies)
  const harness = defineHarness({
    name: NAME,
    adapter: main.adapter,
    agents: options.agents,
    ...(options.tools ? { tools: options.tools } : {}),
    ...(options.plugins ? { plugins: () => [...(options.plugins ?? [])] } : {}),
    routing: {
      router: () => undefined,
      allowHandoffToHuman: options.humans ?? true,
    },
  })
  return { harness, main }
}

/** A host on `log` with the session of `THREAD` open for olga. */
async function hostOn(
  log: LogStore,
  harness: ReturnType<typeof routingHarness>['harness'],
  options: Omit<HarnessHostOptions, 'persistence'> = {},
) {
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...options,
  })
  const session = await host.open(harness, {
    threadId: THREAD,
    user: olga,
  })
  return { host, session }
}

async function handoffRecords(log: LogStore) {
  const entries = await log.read({
    logId: logIdOf({ tenantId: 'acme', logId: THREAD }),
  })
  return entries
    .map((entry) => entry.record)
    .filter((record) => record.type === 'harness.handoff')
}

async function handoffEvents(operation: Operation<unknown>) {
  const values: Array<unknown> = []
  for await (const { event } of operation.events({ from: '0' })) {
    if (event.type === 'CUSTOM' && event.name === HARNESS_EVENTS.handoff) {
      values.push(event.value)
    }
  }
  return values
}

const stored = (log: LogStore) =>
  storedThreadState(log, { threadId: THREAD, tenantId: 'acme' })

const transcriptTexts = async (session: HarnessSession) =>
  messageTexts({ messages: await session.transcript() })

describe('a handoff to a person', () => {
  it('opens one human wait, and the turn ends interrupted', async () => {
    const billing = modelAgent('billing', [])
    const { harness, main } = routingHarness({
      agents: [billing.agent],
      replies: [toHuman],
    })
    const log = memoryLogStore()
    const { host, session } = await hostOn(log, harness)

    const turn = session.send('I want a person.', { inputId: 'in-1' })

    expect((await turn).interrupts).toEqual([])
    expect(turn.status()).toBe('interrupted')
    expect((await session.settled({ inputId: 'in-1' })).outcome).toBe(
      'interrupted',
    )
    const [wait] = session.snapshot().pendingWaits
    expect(session.snapshot().pendingWaits).toEqual([
      {
        waitId: expect.any(String),
        kind: 'human',
        runId: turn.id,
        user: { id: 'olga', tenantId: 'acme' },
        message: 'The user asks for a person.',
      },
    ])
    const handoff = {
      from: null,
      to: { human: true },
      note: 'The user asks for a person.',
      runId: turn.id,
      by: 'tool',
      waitId: wait?.waitId,
      agents: ['billing'],
    }
    expect(await handoffRecords(log)).toEqual([
      { type: 'harness.handoff', ...handoff },
    ])
    expect(await handoffEvents(turn)).toEqual([handoff])
    expect((await stored(log)).activeAgent).toEqual({
      human: true,
      waitId: wait?.waitId,
      from: null,
      agents: ['billing'],
    })
    expect(main.calls).toHaveLength(1)
    expect(billing.model.calls).toHaveLength(0)
    await host.close()
  })

  it('keeps a user message during the pause in the transcript, and runs no model', async () => {
    const billing = modelAgent('billing', [])
    const { harness, main } = routingHarness({
      agents: [billing.agent],
      replies: [toHuman, () => text('never')],
    })
    const { host, session } = await hostOn(memoryLogStore(), harness)
    await session.send('I want a person.')

    const held = session.send('Hello? Anyone there?', { inputId: 'in-2' })

    expect(await held).toMatchObject({ text: '', interrupts: [] })
    expect(held.status()).toBe('interrupted')
    expect((await session.settled({ inputId: 'in-2' })).outcome).toBe(
      'interrupted',
    )
    expect(main.calls).toHaveLength(1)
    expect(billing.model.calls).toHaveLength(0)
    expect((await transcriptTexts(session)).at(-1)).toBe('Hello? Anyone there?')
    // The wait is still open.
    expect(session.snapshot().pendingWaits).toHaveLength(1)
    await host.close()
  })

  it('hands back to the agent that answered before on { resume: true }', async () => {
    const billing = modelAgent('billing', [
      toHuman,
      () => text('Billing is back.'),
    ])
    const { harness, main } = routingHarness({
      agents: [billing.agent],
      replies: [() => toolCall('handoff', { to: 'billing' }, 'call_b')],
    })
    const log = memoryLogStore()
    const { host, session } = await hostOn(log, harness)
    const turn = session.send('Refund, then a person.')
    await turn
    const [wait] = session.snapshot().pendingWaits
    if (!wait) throw new Error('No human wait.')
    expect((await stored(log)).activeAgent).toEqual({
      human: true,
      waitId: wait.waitId,
      from: 'billing',
      agents: ['billing'],
    })

    expect(
      await session.answer({
        questionId: wait.waitId,
        value: { resume: true },
      }),
    ).toMatchObject({ status: 'accepted' })

    expect(session.snapshot().pendingWaits).toEqual([])
    expect((await stored(log)).activeAgent).toBe('billing')
    expect((await handoffRecords(log)).at(-1)).toEqual({
      type: 'harness.handoff',
      from: { human: true },
      to: 'billing',
      runId: turn.id,
      by: 'operator',
    })
    expect((await session.send('Are you there?')).text).toBe(
      'billing:\nBilling is back.',
    )
    expect(main.calls).toHaveLength(1)
    await host.close()
  })

  it('hands back to the named agent, and refuses an answer that names no target', async () => {
    const billing = modelAgent('billing', [])
    const { harness, main } = routingHarness({
      agents: [billing.agent],
      replies: [toHuman, () => text('Main is back.')],
    })
    const log = memoryLogStore()
    const { host, session } = await hostOn(log, harness)
    await session.send('I want a person.')
    const [wait] = session.snapshot().pendingWaits
    if (!wait) throw new Error('No human wait.')

    expect(
      await session.answer({ questionId: wait.waitId, value: { ok: 1 } }),
    ).toMatchObject({ status: 'rejected', reason: 'invalid_answer' })
    expect(
      await session.answer({
        questionId: wait.waitId,
        value: { handBack: 'nobody' },
      }),
    ).toMatchObject({ status: 'rejected', reason: 'unknown_agent' })
    expect(session.snapshot().pendingWaits).toHaveLength(1)

    expect(
      await session.answer({
        questionId: wait.waitId,
        value: { handBack: 'main' },
      }),
    ).toMatchObject({ status: 'accepted' })
    expect((await stored(log)).activeAgent).toBeNull()
    expect((await session.send('Hi again.')).text).toBe('Main is back.')
    expect(main.calls).toHaveLength(2)
    await host.close()
  })

  it('hands back to a root agent of a turn plugin', async () => {
    const seo = modelAgent('seo', [() => text('SEO here.')])
    const { harness } = routingHarness({
      agents: [],
      replies: [toHuman],
      plugins: [
        definePlugin({
          name: 'test/turn-agents',
          lifetime: 'turn',
          setup: () => ({ agents: [seo.agent] }),
        }),
      ],
    })
    const log = memoryLogStore()
    const { host, session } = await hostOn(log, harness)
    await session.send('I want a person.')
    const [wait] = session.snapshot().pendingWaits
    if (!wait) throw new Error('No human wait.')

    expect(
      await session.answer({
        questionId: wait.waitId,
        value: { handBack: 'seo' },
      }),
    ).toMatchObject({ status: 'accepted' })
    expect((await session.send('Hi.')).text).toBe('seo:\nSEO here.')
    await host.close()
  })

  it('takes the answer of a second host through the input lane', async () => {
    const logState = memoryLogState()
    const release = gate()
    const slow = toolDefinition({
      name: 'slow',
      description: 'Waits for the test',
      inputSchema: z.object({}),
    }).server(async () => {
      await release.opened
      return 'done'
    })
    const billing = modelAgent('billing', [() => text('Billing here.')])
    const { harness } = routingHarness({
      agents: [billing.agent],
      replies: [toHuman],
      tools: [slow],
    })
    const owner = await hostOn(memoryLogStore({ state: logState }), harness)
    await owner.session.send('I want a person.')
    const [wait] = owner.session.snapshot().pendingWaits
    if (!wait) throw new Error('No human wait.')
    // A tool turn runs while a person answers, so the owner keeps the log.
    const busy = owner.session.runTool({ name: 'slow' })
    await busy.receipt

    const other = await hostOn(memoryLogStore({ state: logState }), harness)
    const receipt = await other.session.answer({
      questionId: wait.waitId,
      value: { handBack: 'billing' },
    })
    expect(receipt.status).toBe('queued')

    release.open()
    await busy
    await waitFor(async () =>
      expect(
        (await stored(memoryLogStore({ state: logState }))).activeAgent,
      ).toBe('billing'),
    )
    expect((await owner.session.send('Hello?')).text).toBe(
      'billing:\nBilling here.',
    )
    await owner.host.close()
    await other.host.close()
  })
})

describe('an operator reply', () => {
  /** A host with access: olga owns `THREAD`, bea is an operator, vic a viewer. */
  async function sharedThread(replies: Array<Reply>) {
    const billing = modelAgent('billing', [])
    const { harness, main } = routingHarness({
      agents: [billing.agent],
      replies,
    })
    const tokens: Record<string, User> = { olga, bea, vic }
    const host = createHarnessHost({
      persistence: memoryPersistence(),
      access: {
        getUser: ({ request }): User | null =>
          tokens[request.headers.get('authorization') ?? ''] ?? null,
        rules: membersOnly(),
      },
    })
    const open = (user: User) => host.open(harness, { threadId: THREAD, user })
    const owner = await open(olga)
    for (const [userId, role] of [
      ['bea', 'operator'],
      ['vic', 'viewer'],
    ] as const) {
      await host.sessions.share({
        threadId: THREAD,
        userId,
        role,
        user: olga,
      })
    }
    return { host, harness, main, owner, open }
  }

  it('adds the message of an operator, and runs no model', async () => {
    const { host, main, owner, open } = await sharedThread([toHuman])
    await owner.send('I want a person.')
    const member = await open(bea)

    const reply = member.send('Hi, I am Bea. I can help.', {
      as: 'operator',
      inputId: 'op-1',
    })

    expect(await reply.receipt).toMatchObject({ status: 'accepted' })
    expect(await reply).toMatchObject({ text: 'Hi, I am Bea. I can help.' })
    expect((await owner.settled({ inputId: 'op-1' })).outcome).toBe('completed')
    expect((await owner.transcript()).at(-1)).toMatchObject({
      role: 'assistant',
      content: 'Hi, I am Bea. I can help.',
      metadata: { harness: { operator: 'bea' } },
    })
    expect(main.calls).toHaveLength(1)
    // The pause goes on until the operator answers the wait.
    expect(owner.snapshot().pendingWaits).toHaveLength(1)
    await host.close()
  })

  it('keeps the files of a reply in a note for the model, and shows them with the reply', async () => {
    const { host, owner, open } = await sharedThread([toHuman])
    await owner.send('I want a person.')
    const record = await owner.putMedia({
      body: new Uint8Array([1, 2, 3]),
      mimeType: 'image/png',
      name: 'screen.png',
    })
    const member = await open(bea)

    const reply = member.send(
      [{ type: 'text', content: 'See this.' }, mediaPart(record)],
      { as: 'operator', inputId: 'op-1' },
    )
    await reply

    // Providers take media only from a user, so the assistant message has
    // only the text.
    const saved = await owner.transcript()
    expect(saved.slice(-2)).toMatchObject([
      {
        id: 'operator-op-1',
        role: 'assistant',
        content: 'See this.',
        metadata: { harness: { operator: 'bea' } },
      },
      {
        id: 'operator-op-1:media',
        role: 'user',
        metadata: {
          harness: { operatorAttachment: true, media: [{ id: record.id }] },
        },
      },
    ])
    // The live view and a reload show one operator message with the file.
    let live = emptyState()
    for await (const entry of reply.events({ from: '0' })) {
      live = applyEvent(live, entry)
    }
    const partsOf = (message: ViewMessage | undefined) =>
      message?.role === 'assistant'
        ? message.parts.map((part) =>
            part.type === 'media' ? part.id : part.type,
          )
        : []
    expect(partsOf(live.messages.at(-1))).toEqual(['text', record.id])
    expect(partsOf(messagesFromTranscript(saved).at(-1))).toEqual([
      'text',
      record.id,
    ])
    await host.close()
  })

  it('shows live in an open view, with no transcript reload', async () => {
    const { host, owner, open } = await sharedThread([toHuman])
    await owner.send('I want a person.')
    const view = createSessionView(owner)
    await view.ready
    const transcript = vi.spyOn(owner, 'transcript')
    const member = await open(bea)

    await member.send('Hi, I am Bea.', { as: 'operator' })

    await waitFor(() =>
      expect(view.store.get().messages.at(-1)).toMatchObject({
        role: 'assistant',
        parts: [{ type: 'text', text: 'Hi, I am Bea.' }],
      }),
    )
    expect(transcript).not.toHaveBeenCalled()
    view.dispose()
    await host.close()
  })

  it('refuses a viewer, and rejects a reply with no handoff to a person', async () => {
    const { host, owner, open } = await sharedThread([() => text('Hello.')])
    const member = await open(bea)
    const viewer = await open(vic)

    const early = member.send('Too early.', { as: 'operator' })
    expect(await early.receipt).toMatchObject({
      status: 'rejected',
      reason: 'no_human_wait',
    })
    await expect(early).rejects.toThrow()

    await owner.send('Hi.')
    await expect(
      viewer.send('I am only a viewer.', { as: 'operator' }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    // The owner waits for a person, so the owner is not one by default.
    await expect(
      owner.send('I am the operator now.', { as: 'operator' }),
    ).rejects.toBeInstanceOf(AccessDeniedError)
    expect(await messageTexts({ messages: await owner.transcript() })).toEqual([
      'Hi.',
      'Hello.',
    ])
    await host.close()
  })

  it('goes over the protocol, the client, and the view', async () => {
    const { host, harness, owner, open } = await sharedThread([toHuman])
    await owner.send('I want a person.')

    expect(() =>
      parseHarnessInput({ op: 'prompt', message: 'x', as: 'admin' }),
    ).toThrow("the as of prompt must be 'operator'")
    expect(
      await applyInput({
        harness,
        session: await open(bea),
        input: parseHarnessInput({
          op: 'prompt',
          message: 'From the protocol.',
          as: 'operator',
        }),
        user: bea,
      }),
    ).toMatchObject({ status: 'accepted' })

    const handler = createHarnessHandler({ host, harness })
    const clientOf = (token: string) =>
      createHarnessClient<typeof harness>({
        url: 'http://local/api/harness/',
        threadId: THREAD,
        headers: { authorization: token },
        fetch: (input, init) => handler(new Request(input, init)),
      })
    // It waits behind the reply of the protocol.
    expect(
      (await clientOf('bea').send('From the client.', { as: 'operator' }))
        .status,
    ).not.toBe('rejected')
    await expect(
      clientOf('vic').send('Not me.', { as: 'operator' }),
    ).rejects.toThrow()

    const view = createSessionView(await open(bea))
    await view.ready
    await view.send('From the view.', { as: 'operator' })

    await waitFor(async () =>
      expect(
        (await owner.transcript())
          .slice(-3)
          .map(({ role, content }) => ({ role, content })),
      ).toEqual(
        ['From the protocol.', 'From the client.', 'From the view.'].map(
          (content) => ({ role: 'assistant', content }),
        ),
      ),
    )
    view.dispose()
    await host.close()
  })
})

describe('run.handoff', () => {
  /** A tool of the main model that hands off from its run context. */
  const escalate = toolDefinition({
    name: 'escalate',
    description: 'Hand the user to billing',
    inputSchema: z.object({}),
  }).server<HarnessRunContext>(async (_args, ctx) =>
    ctx.context.run.handoff({ to: 'billing', note: 'From a tool' }).then(
      () => 'moved',
      (error: unknown) => `stayed: ${String(error)}`,
    ),
  )

  it('hands the turn off from a tool of the main model', async () => {
    const billing = modelAgent('billing', [() => text('Refunded')])
    const { harness, main } = routingHarness({
      agents: [billing.agent],
      replies: [() => toolCall('escalate', {}, 'call_e')],
      tools: [escalate],
    })
    const log = memoryLogStore()
    const { host, session } = await hostOn(log, harness)

    expect((await session.send('refund please')).text).toBe(
      'billing:\nRefunded',
    )
    expect(main.calls).toHaveLength(1)
    expect(
      (await handoffRecords(log)).map(({ from, to, note, by }) => ({
        from,
        to,
        note,
        by,
      })),
    ).toEqual([{ from: null, to: 'billing', note: 'From a tool', by: 'code' }])
    await host.close()
  })

  it('offers no person and rejects a handoff to one without routing.allowHandoffToHuman', async () => {
    const toPerson = toolDefinition({
      name: 'toPerson',
      description: 'Hand the user to a person',
      inputSchema: z.object({}),
    }).server<HarnessRunContext>(async (_args, ctx) =>
      ctx.context.run.handoff({ to: { human: true } }).then(
        () => 'moved',
        (error: unknown) => `stayed: ${String(error)}`,
      ),
    )
    const billing = modelAgent('billing', [])
    const { harness, main } = routingHarness({
      agents: [billing.agent],
      replies: [
        () => toolCall('toPerson', {}, 'call_p'),
        () => text('I stay.'),
      ],
      tools: [toPerson],
      humans: false,
    })
    const log = memoryLogStore()
    const { host, session } = await hostOn(log, harness)

    expect((await session.send('a person please')).text).toBe('I stay.')
    const tool = main.calls[0].tools.find(
      (item: { name: string }) => item.name === 'handoff',
    )
    expect(tool.inputSchema.properties.to).toEqual({
      type: 'string',
      enum: ['billing'],
    })
    expect(JSON.stringify(main.calls[1].messages)).toContain(
      'stayed: Error: A handoff to a person needs `routing: { humans: true }` in the harness.',
    )
    expect(await handoffRecords(log)).toEqual([])
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('rejects outside a turn of a harness with routing', async () => {
    const main = mockAdapter([
      () => toolCall('escalate', {}, 'call_e'),
      () => text('I stay.'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({ name: NAME, adapter: main.adapter, tools: [escalate] }),
      { threadId: THREAD },
    )

    expect((await session.send('refund please')).text).toBe('I stay.')
    expect(JSON.stringify(main.calls[1].messages)).toContain(
      'stayed: Error: ctx.harness.handoff needs a root agent that answers a turn of a harness with routing.',
    )
    await host.close()
  })
})
