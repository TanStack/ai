import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { memoryLogState, memoryLogStore } from '@tanstack/ai-persistence'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  durableTool,
  logIdOf,
} from '../src'
import {
  CRASHING_OWNERSHIP,
  gate,
  mockAdapter,
  ownershipExpired,
  storedThreadState,
  text,
  toolCall,
  untilAborted,
} from './helpers'
import type { AnyTool } from '@tanstack/ai'
import type { LogStore } from '@tanstack/ai-persistence'
import type { CredentialStore } from '@tanstack/ai/byok'
import type {
  AnyAgent,
  AnyHarness,
  HarnessHostOptions,
  HarnessPlugin,
  HarnessSession,
} from '../src'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(check: () => T | Promise<T>) =>
  vi.waitFor(check, { timeout: 5_000 })

const THREAD = 't1'
const LOG = logIdOf({ logId: THREAD })
const NAME = 'test/step-ask'

function harnessWith({
  replies = [],
  tools = [],
  plugins = [],
}: {
  replies?: Array<Reply>
  tools?: Array<AnyTool>
  plugins?: Array<HarnessPlugin>
}) {
  return defineHarness({
    name: NAME,
    adapter: mockAdapter(replies).adapter,
    tools,
    plugins: () => plugins,
  })
}

/** A host on `log`, with the session of `THREAD` open. */
async function hostOn(
  log: LogStore,
  harness: AnyHarness,
  options: Omit<HarnessHostOptions, 'persistence'> = {},
) {
  const host = createHarnessHost({
    persistence: { stores: { log } },
    ...options,
  })
  const session = await host.open(harness, { threadId: THREAD })
  return { host, session }
}

/** The waits that the log of `THREAD` keeps, as a new host folds them. */
const storedWaits = async (log: LogStore) =>
  (await storedThreadState(log, { threadId: THREAD })).waits

/** The one open wait of `session`, once it opened. */
async function openWait(session: HarnessSession) {
  await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
  const [wait] = session.snapshot().pendingWaits
  if (!wait) throw new Error('No wait.')
  return wait
}

/** A durable tool that asks for a name, and returns it. */
const greet = durableTool(
  toolDefinition({
    name: 'greet',
    description: 'Ask the user for a name',
    inputSchema: z.object({}),
  }),
  async (_args, { step }) => {
    const name = await step.ask({
      name: 'name',
      message: 'Name?',
      schema: z.object({ name: z.string() }),
    })
    return `Hello, ${name.name}.`
  },
)

describe('step.ask in a durable tool', () => {
  it('keeps the question as a wait of the turn in the log, and the answer becomes the tool value', async () => {
    const log = memoryLogStore()
    const { host, session } = await hostOn(
      log,
      harnessWith({
        replies: [() => toolCall('greet', {}, 'call-1'), () => text('ok')],
        tools: [greet],
      }),
    )

    const turn = session.send('greet me')
    const wait = await openWait(session)
    expect(wait).toEqual({
      waitId: 'ask:call-1:name',
      kind: 'question',
      runId: turn.id,
      schema: expect.objectContaining({ type: 'object' }),
      message: 'Name?',
    })
    // No promise holds it: it is a wait of the log only.
    const stored = (await storedWaits(log)).get(wait.waitId)
    expect(stored?.live).toBeUndefined()

    // The answer must fit the JSON Schema of the wait.
    expect(
      await session.answer({ questionId: wait.waitId, value: { name: 7 } }),
    ).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('Invalid answer'),
    })
    expect(
      await session.answer({ questionId: wait.waitId, value: { name: 'Ada' } }),
    ).toMatchObject({ status: 'accepted' })
    await turn
    const result = (await session.transcript()).find(
      (message) => message.role === 'tool',
    )
    expect(result?.content).toBe('Hello, Ada.')
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('refuses an answer that breaks a pattern, a resolve, and a second answer', async () => {
    const log = memoryLogStore()
    const code = durableTool(
      toolDefinition({
        name: 'code',
        description: 'Ask for a code',
        inputSchema: z.object({}),
      }),
      async (_args, { step }) =>
        step.ask({
          name: 'code',
          message: 'Code?',
          schema: z.string().regex(/^key-/),
        }),
    )
    const { host, session } = await hostOn(
      log,
      harnessWith({
        replies: [() => toolCall('code', {}, 'call-1'), () => text('ok')],
        tools: [code],
      }),
    )
    const turn = session.send('ask me')
    const wait = await openWait(session)

    // The whole JSON Schema of the wait counts, `pattern` too.
    expect(
      await session.answer({ questionId: wait.waitId, value: 'secret' }),
    ).toMatchObject({
      status: 'rejected',
      reason: expect.stringContaining('Invalid answer'),
    })
    // A question of `step.ask` takes `answer`, which checks its schema.
    expect(
      await session.resolve({
        resume: [
          { interruptId: wait.waitId, status: 'resolved', payload: 'secret' },
        ],
      }),
    ).toMatchObject({ status: 'rejected', reason: 'use_answer' })
    // Two answers at once: one ends the wait, the other is refused.
    const receipts = await Promise.all([
      session.answer({ questionId: wait.waitId, value: 'key-1' }),
      session.answer({ questionId: wait.waitId, value: 'key-2' }),
    ])
    expect(receipts.map(({ status }) => status).sort()).toEqual([
      'accepted',
      'rejected',
    ])
    await turn
    await host.close()
  })

  it('waits across a crash: the next host runs the call again, and its answer reaches the call', async () => {
    const logState = memoryLogState()
    const reserve = vi.fn(async () => 'r-1')
    const book = durableTool(
      toolDefinition({
        name: 'book',
        description: 'Reserve, then ask, then book',
        inputSchema: z.object({}),
      }),
      async (_args, { step }) => {
        const reservation = await step.do('reserve', reserve)
        const seat = await step.ask({ name: 'seat', message: 'Which seat?' })
        return `${reservation}:${String(seat)}`
      },
    )
    const harness = (replies: Array<Reply>) =>
      harnessWith({ replies, tools: [book] })
    // The first host never renews its ownership, as after a crash.
    const first = await hostOn(
      memoryLogStore({ state: logState }),
      harness([() => toolCall('book', {}, 'call-book')]),
      { ownership: CRASHING_OWNERSHIP },
    )
    void first.session.send('book a seat', { inputId: 'book-1' })
    const wait = await openWait(first.session)

    await ownershipExpired()
    // The next host runs the cut call again, then calls the model.
    const next = await hostOn(
      memoryLogStore({ state: logState }),
      harness([() => text('done')]),
    )
    // The wait stays open: the call runs again and waits for it.
    await waitFor(() =>
      expect(next.session.snapshot().pendingWaits).toEqual([wait]),
    )
    await next.session.answer({ questionId: wait.waitId, value: '12A' })

    expect(await next.session.settled({ inputId: 'book-1' })).toMatchObject({
      outcome: 'completed',
    })
    expect(reserve).toHaveBeenCalledTimes(1)
    const result = (await next.session.transcript()).find(
      (message) =>
        message.role === 'tool' && message.toolCallId === 'call-book',
    )
    expect(result?.content).toBe('r-1:12A')
    await next.host.close()
    await first.host.close()
  })

  it('scrubs each field of a secret object answer from the tool result and the next model call', async () => {
    const PASSWORD = 'hunter2-correct-horse'
    const signIn = durableTool(
      toolDefinition({
        name: 'signIn',
        description: 'Ask for a login',
        inputSchema: z.object({}),
      }),
      async (_args, { step }) => {
        const login = await step.ask({
          name: 'login',
          message: 'Login?',
          schema: z.object({ user: z.string(), password: z.string() }),
          secret: true,
        })
        // On purpose: a careless tool puts the password in its result.
        return `Signed in ${login.user} with ${login.password}.`
      },
    )
    const model = mockAdapter([
      () => toolCall('signIn', {}, 'call-1'),
      () => text('ok'),
    ])
    const { host, session } = await hostOn(
      memoryLogStore(),
      defineHarness({ name: NAME, adapter: model.adapter, tools: [signIn] }),
    )

    const turn = session.send('sign me in')
    const wait = await openWait(session)
    await session.answer({
      questionId: wait.waitId,
      value: { user: 'ada', password: PASSWORD },
    })
    await turn

    const result = (await session.transcript()).find(
      (message) => message.role === 'tool',
    )
    expect(result?.content).toBe('Signed in ada with [redacted].')
    expect(JSON.stringify(model.calls[1]?.messages)).not.toContain(PASSWORD)
    await host.close()
  })

  it('throws outside a harness session', async () => {
    await expect(
      Promise.resolve(
        greet.execute?.({}, { toolCallId: 'c', emitCustomEvent: () => {} }),
      ),
    ).rejects.toThrow('step.ask needs a harness session')
  })
})

describe('step.ask in an agent tool', () => {
  /** An agent that asks a name, does a step, then asks a color. */
  function namer() {
    const sideEffect = vi.fn(() => 'side effect')
    const runs = vi.fn()
    const agent = defineAgent({
      name: 'namer',
      description: 'Asks a name and a color',
      run: async (ctx) => {
        runs()
        const step = ctx.harness!.step
        const name = await step.ask({
          name: 'name',
          message: 'Name?',
          schema: z.object({ name: z.string() }),
        })
        await step.do('effect', sideEffect)
        const color = await step.ask({ name: 'color', message: 'Color?' })
        return `${name.name} likes ${String(color)}`
      },
    })
    return { agent, sideEffect, runs }
  }

  function leadHarness(agent: AnyAgent, replies: Array<Reply>) {
    const lead = mockAdapter(replies)
    return {
      lead,
      harness: defineHarness({
        name: NAME,
        adapter: lead.adapter,
        subagents: { agents: [agent] },
      }),
    }
  }

  /** Resolve the one wait of the stopped turn with `payload`. */
  async function resolveWith(session: HarnessSession, payload: unknown) {
    const [wait] = session.snapshot().pendingWaits
    if (!wait) throw new Error('No wait.')
    const receipt = await session.resolve({
      resume: [{ interruptId: wait.waitId, status: 'resolved', payload }],
    })
    return session.operation(receipt.operationId ?? '')
  }

  it('stops the turn for each question, and the agent goes on with the answers', async () => {
    const { agent, sideEffect, runs } = namer()
    const { lead, harness } = leadHarness(agent, [
      () => toolCall('namer', {}, 'call-n'),
      () => text('done'),
    ])
    const { host, session } = await hostOn(memoryLogStore(), harness)

    await session.send('ask me')
    expect(session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({
        kind: 'question',
        turn: true,
        agent: 'namer',
        message: 'Name?',
        schema: expect.objectContaining({ type: 'object' }),
        waitId: expect.stringMatching(/^ask:sub:subagent-.+:name$/),
      }),
    ])
    await resolveWith(session, { name: 'Ada' })
    expect(session.snapshot().pendingWaits).toEqual([
      expect.objectContaining({ agent: 'namer', message: 'Color?' }),
    ])
    const result = await resolveWith(session, 'teal')

    expect(result).toMatchObject({ text: 'done' })
    // The step of the first run again returned its logged value.
    expect(sideEffect).toHaveBeenCalledTimes(1)
    expect(runs).toHaveBeenCalledTimes(3)
    expect(JSON.stringify(lead.calls[1].messages)).toContain('Ada likes teal')
    await host.close()
  })

  it('gives the model a tool error for an answer that breaks the schema', async () => {
    const { agent } = namer()
    const { lead, harness } = leadHarness(agent, [
      () => toolCall('namer', {}, 'call-n'),
      () => text('done'),
    ])
    const { host, session } = await hostOn(memoryLogStore(), harness)

    await session.send('ask me')
    await resolveWith(session, { name: 7 })

    expect(JSON.stringify(lead.calls[1].messages)).toContain(
      'step.ask: the answer to \\"name\\" is invalid',
    )
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })
})

describe('step.ask in a command', () => {
  it('runs the command again after a crash, and a secret answer reaches the run again through the credential store', async () => {
    const logState = memoryLogState()
    const credentials: CredentialStore = memoryCredentialStore()
    const saved = vi.fn(async () => 'saved')
    const hostStops = gate()
    let isFirstRun = true
    const plugin = definePlugin({
      name: 'test/connect',
      setup: () => ({
        commands: {
          connect: defineCommand({
            description: 'Ask for a key, then save it',
            run: async (_input, { step }) => {
              const key = await step.ask({
                name: 'key',
                message: 'Paste your key',
                schema: z.string(),
                secret: true,
              })
              if (isFirstRun) {
                isFirstRun = false
                // The first host stops here, after the answer.
                await hostStops.opened
              }
              await step.do('save', saved)
              return key.length
            },
          }),
        },
      }),
    })
    const harness = harnessWith({ plugins: [plugin] })
    const first = await hostOn(memoryLogStore({ state: logState }), harness, {
      credentials,
      ownership: CRASHING_OWNERSHIP,
    })
    const running = first.session.runCommand({
      name: 'connect',
      inputId: 'connect-1',
    })
    running.then(
      () => {},
      () => {},
    )
    const wait = await openWait(first.session)
    expect(wait.waitId).toBe('ask:command:connect-1:key')
    expect(
      await first.session.answer({
        questionId: wait.waitId,
        value: 'sk-secret-key',
      }),
    ).toMatchObject({ status: 'accepted' })

    await ownershipExpired()
    const next = await hostOn(memoryLogStore({ state: logState }), harness, {
      credentials,
    })
    // The next host runs the command again, and it ends.
    const log = memoryLogStore({ state: logState })
    await waitFor(async () =>
      expect(
        (await log.read({ logId: LOG })).map((entry) => entry.record),
      ).toContainEqual(
        expect.objectContaining({
          type: 'harness.input.settled',
          inputId: 'connect-1',
          outcome: 'completed',
        }),
      ),
    )
    expect(saved).toHaveBeenCalledTimes(1)
    // The log never had the key, and the store gave it up when the command
    // ended.
    expect(JSON.stringify(await log.read({ logId: LOG }))).not.toContain(
      'sk-secret-key',
    )
    await waitFor(async () =>
      expect(await credentials.list({ threadId: THREAD })).toEqual([]),
    )
    hostStops.open()
    await next.host.close()
    await first.host.close()
  })

  it('ends the wait cancelled when the command is cancelled', async () => {
    const log = memoryLogStore()
    const plugin = definePlugin({
      name: 'test/ask',
      setup: () => ({
        commands: {
          ask: defineCommand({
            description: 'Ask',
            run: (_input, { step }) =>
              step.ask({ name: 'sure', message: 'Sure?' }),
          }),
        },
      }),
    })
    const { host, session } = await hostOn(
      log,
      harnessWith({ plugins: [plugin] }),
    )
    const running = session.runCommand({ name: 'ask' })
    const wait = await openWait(session)

    await session.cancel({ operationId: running.id })

    await expect(running).rejects.toBeDefined()
    await waitFor(async () =>
      expect((await storedWaits(log)).get(wait.waitId)).toMatchObject({
        outcome: 'cancelled',
      }),
    )
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })
})

describe('ctx.session.ask', () => {
  it('throws outside a live wait, and names step.ask', async () => {
    const plugin = definePlugin({
      name: 'test/ask-anywhere',
      setup: () => ({
        commands: {
          ask: defineCommand({
            description: 'Ask in memory',
            run: (_input, { session }) => session.ask({ message: 'Sure?' }),
          }),
        },
      }),
    })
    const { host, session } = await hostOn(
      memoryLogStore(),
      harnessWith({ plugins: [plugin] }),
    )

    await expect(session.runCommand({ name: 'ask' })).rejects.toThrow(
      'step.ask',
    )
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('puts a live wait of a session plugin on the run it names, not on the running turn', async () => {
    let asked: Promise<unknown> | undefined
    const plugin = definePlugin({
      name: 'test/live-asker',
      // The services API of a session plugin: no run of its own.
      setup: (ctx) => ({
        commands: {
          ask: defineCommand({
            description: 'Ask in a live wait of this command',
            run: (_input, { run }) => {
              asked = ctx.session.ask({
                message: 'Allow the MCP server?',
                live: { name: 'mcp-elicitation', run },
              })
              return asked
            },
          }),
        },
      }),
    })
    const { host, session } = await hostOn(
      memoryLogStore(),
      harnessWith({
        // The turn runs until it is cancelled.
        replies: [untilAborted()],
        plugins: [plugin],
      }),
    )
    const turn = session.send('Go.')
    await turn.receipt
    const command = session.runCommand({ name: 'ask' })
    const wait = await openWait(session)
    expect(wait.runId).toBe(command.id)

    // A cancel of the turn does not end the wait of the command.
    await session.cancel({ operationId: turn.id })
    await expect(turn).rejects.toBeDefined()
    expect(session.snapshot().pendingWaits).toEqual([wait])

    await session.answer({ questionId: wait.waitId, value: 'yes' })
    expect(await command).toBe('yes')
    await expect(asked).resolves.toBe('yes')
    await host.close()
  })
})
