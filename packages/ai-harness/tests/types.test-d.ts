import { expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import {
  HARNESS_EVENTS,
  createHarnessHost,
  defineHarness,
  definePlugin,
  membersOnly,
  oauthConnector,
} from '../src'
import { createHarnessHandler } from '../src/server'
import { mockAdapter } from './helpers'
import type { AnyTextAdapter, KeyedAdapter, Logger } from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'
import type {
  AgentActions,
  AgentRun,
  AgentSettled,
  HarnessAgentContext,
  HarnessConfig,
  HarnessErrorCode,
  HarnessEventValues,
  HarnessHost,
  HarnessInput,
  HarnessSession,
  Operation,
  PluginLifetime,
  HarnessUser,
  ProjectOptions,
  Receipt,
  RecoverHook,
  ReduceOptions,
  SessionMetadataOf,
} from '../src'
import type { InputSettlement } from '../src/types'
import type {
  HarnessErrorCode as ClientErrorCode,
  HarnessProtocolError,
} from '../src/client'
import type { HarnessErrorCode as ServerErrorCode } from '../src/server'
import type { ToolStep } from '../src/durable-tool'
import type { PluginServices, PluginSetupContext } from '../src/plugins'

const pricer = defineAgent({
  name: 'pricer',
  description: 'Prices a vendor',
  inputSchema: z.object({ vendor: z.string() }),
  run: async (ctx) => ({ vendor: ctx.input.vendor, cents: 1200 }),
})

const writer = defineAgent({
  name: 'writer',
  description: 'Writes text',
  run: () => (async function* () {})(),
})

const harness = defineHarness({
  name: 'test/types',
  adapter: mockAdapter([]).adapter,
  agents: [pricer],
  subagents: { agents: [writer] },
})

declare const session: HarnessSession<typeof harness>
declare const input: HarnessInput

it('types agent input and result from the definition', () => {
  expectTypeOf(session.agents.pricer.run({ vendor: 'a' })).toEqualTypeOf<
    AgentRun<{ vendor: string; cents: number }>
  >()
  expectTypeOf(session.agents.writer.run()).toEqualTypeOf<AgentRun<string>>()
  // @ts-expect-error unknown agent
  void session.agents.missing
  // @ts-expect-error wrong input
  void session.agents.pricer.run({ vendor: 1 })
})

it('takes an inputId on every input and keeps the op narrowing', () => {
  const inputs = [
    { op: 'prompt', message: 'hi', inputId: 'a' },
    { op: 'cancel', inputId: 'b' },
    { op: 'config', key: 'tone', value: 'warm', inputId: 'c' },
  ] satisfies Array<HarnessInput>
  expectTypeOf(inputs).toExtend<Array<HarnessInput>>()

  if (input.op === 'prompt') {
    expectTypeOf(input.message).toEqualTypeOf<
      Extract<HarnessInput, { op: 'prompt' }>['message']
    >()
  }
})

it('gives every operation a receipt promise', () => {
  expectTypeOf<Operation<string>['receipt']>().toEqualTypeOf<Promise<Receipt>>()
})

it('describes how an input ended', () => {
  expectTypeOf<InputSettlement['outcome']>().toEqualTypeOf<
    'completed' | 'failed' | 'aborted' | 'interrupted'
  >()
  expectTypeOf<InputSettlement['error']>().toEqualTypeOf<
    { message: string; code?: string } | undefined
  >()
})

it('takes a harness without an adapter, and turn plugins', () => {
  const picked = defineHarness({
    name: 'test/no-adapter',
    plugins: () => [definePlugin({ name: 'test/turn', lifetime: 'turn' })],
  })
  expectTypeOf(picked.adapter).toEqualTypeOf<
    AnyTextAdapter | KeyedAdapter<AnyTextAdapter> | undefined
  >()
  expectTypeOf<PluginLifetime>().toEqualTypeOf<'session' | 'turn' | 'host'>()
})

it('takes attempt and time limits, and the log folds, on the harness', () => {
  expectTypeOf<HarnessConfig['durability']>().toEqualTypeOf<
    | {
        maxAttempts?: number
        timeoutMs?: number
        recover?: RecoverHook
        interruptedToolResult?: string
        truncatedToolResult?:
          | string
          | ((call: { toolCallId: string; toolName: string }) => string)
        continueCutOff?: boolean | { note?: string | ReadonlyArray<string> }
        resumeBackgroundAgents?: boolean
        agentToolWaits?: boolean
        addRecordsToModelContext?: ProjectOptions
        logState?: ReduceOptions<undefined>
      }
    | undefined
  >()
  // The state type of `session.logState()` comes from `initial` and `record`.
  const counted = defineHarness({
    name: 'test/reduce',
    durability: {
      logState: {
        initial: { count: 0 },
        record: ({ state }) => ({ count: state.count + 1 }),
      },
    },
  })
  expectTypeOf<
    HarnessSession<typeof counted>['logState']
  >().returns.resolves.toEqualTypeOf<{ count: number } | undefined>()
})

it('gives a started agent run send()', () => {
  const run = session.agents.pricer.start({ vendor: 'a' })
  expectTypeOf(run).toEqualTypeOf<AgentRun<{ vendor: string; cents: number }>>()
  expectTypeOf(run.send).returns.toEqualTypeOf<Promise<Receipt>>()
})

const chipsSchema = z.object({ chips: z.array(z.string()) })
type Chips = z.infer<typeof chipsSchema>
const chipsPlugin = definePlugin({
  name: 'test/chips',
  metadataSchema: chipsSchema,
  setup: (ctx) => {
    expectTypeOf(ctx.session.indexEntry).returns.resolves.toEqualTypeOf<
      SessionIndexEntry<Chips> | undefined
    >()
  },
})
const untypedPlugin = definePlugin({ name: 'test/untyped' })

it('types the session metadata from the harness metadataSchema', () => {
  const chips = defineHarness({
    name: 'test/chips',
    metadataSchema: chipsSchema,
    plugins: () => [chipsPlugin, untypedPlugin],
    turn: {
      beforeFinish: async ({ session: hooked }) => {
        expectTypeOf(await hooked.indexEntry()).toEqualTypeOf<
          SessionIndexEntry<Chips> | undefined
        >()
        return undefined
      },
    },
  })
  expectTypeOf<SessionMetadataOf<typeof chips>>().toEqualTypeOf<Chips>()
  expectTypeOf<SessionMetadataOf<typeof harness>>().toEqualTypeOf<
    Record<string, unknown>
  >()
})

it('refuses a plugin whose metadata the harness does not have', () => {
  const other = definePlugin({
    name: 'test/other',
    metadataSchema: z.object({ other: z.number() }),
  })
  defineHarness({
    name: 'test/mismatch',
    metadataSchema: chipsSchema,
    // @ts-expect-error The plugin reads `other`, which the harness does not have.
    plugins: () => [other],
  })
})

it('types the user of the host from what access.getUser returns', () => {
  type User = { id: string; tenantId: string; role: 'admin' | 'user' }
  // The app's own login check, as `verifySession(request)` in an app.
  const userOf = async (request: Request): Promise<User | null> =>
    request.headers.has('cookie')
      ? { id: 'u1', tenantId: 'acme', role: 'user' }
      : null
  const host = createHarnessHost({
    access: {
      getUser: ({ request }) => userOf(request),
      rules: {
        isAllowed: ({ user }) => {
          expectTypeOf(user).toEqualTypeOf<User>()
          return user.role === 'admin'
        },
      },
    },
  })
  expectTypeOf(host).toEqualTypeOf<HarnessHost<User>>()
  expectTypeOf<Parameters<typeof host.open>[1]['user']>().toEqualTypeOf<
    User | undefined
  >()
  const user: User = { id: 'u2', tenantId: 'acme', role: 'user' }
  void host.open(harness, { threadId: 't1', user })
  // @ts-expect-error The user of this host has a role.
  void host.open(harness, { threadId: 't1', user: { id: 'u3' } })
  // membersOnly() fits any user type.
  expectTypeOf(
    createHarnessHost({
      access: { getUser: () => user, rules: membersOnly() },
    }),
  ).toEqualTypeOf<HarnessHost<User>>()
  // Without access, the user is the plain one.
  expectTypeOf(createHarnessHost()).toEqualTypeOf<HarnessHost<HarnessUser>>()
})

it('types the openAccess user by the host, and needs an explicit login mode', () => {
  const host = createHarnessHost()
  createHarnessHandler({ host, harness, openAccess: true })
  createHarnessHandler({
    host,
    harness,
    openAccess: { user: { id: 'u' } },
  })
  createHarnessHandler({
    host,
    harness,
    openAccess: true,
    // @ts-expect-error The host access decides who calls: no authorize here.
    authorize: () => ({ id: 'u' }),
  })
  const oauth = { authorizationUrl: 'a', tokenUrl: 't', clientId: 'c' }
  // @ts-expect-error `login` is required: no implicit loopback listener.
  oauthConnector({ id: 'svc', label: 'Service', oauth })
  oauthConnector({ id: 'svc', label: 'Service', oauth, login: 'device' })
})

it('has a value type for every harness event name, and no other', () => {
  expectTypeOf<keyof HarnessEventValues>().toEqualTypeOf<
    (typeof HARNESS_EVENTS)[keyof typeof HARNESS_EVENTS]
  >()
})

type Priced = { vendor: string; cents: number }
declare const agents: AgentActions

it('types start and run from the worker, subject first', () => {
  expectTypeOf(agents.start(pricer, { vendor: 'a' })).toEqualTypeOf<
    AgentRun<Priced>
  >()
  expectTypeOf(agents.run(pricer, { vendor: 'a' })).toEqualTypeOf<
    AgentRun<Priced>
  >()
  expectTypeOf(agents.start(writer)).toEqualTypeOf<AgentRun<string>>()
  // A name the session knows gives an untyped run.
  expectTypeOf(agents.start('pricer', { vendor: 1 })).toEqualTypeOf<
    AgentRun<unknown>
  >()
  // @ts-expect-error wrong input
  void agents.start(pricer, { vendor: 1 })
  // @ts-expect-error the input of an agent with an inputSchema is required
  void agents.run(pricer)
  // @ts-expect-error an agent without an inputSchema takes no input
  void agents.start(writer, { text: 'hi' })
})

it('takes the options grouped per concern', () => {
  void agents.start(
    pricer,
    { vendor: 'a' },
    {
      key: 'price-a',
      startTurnWhenDone: true,
      limits: { timeoutMs: 1000, maxAttempts: 2 },
      budget: { maxTokens: 500, maxCost: 0.1 },
      onModelError: ({ retries }) => (retries < 2 ? 'retry' : 'fail'),
    },
  )
  // @ts-expect-error `run` never wakes the session
  void agents.run(pricer, { vendor: 'a' }, { startTurnWhenDone: true })
  // @ts-expect-error limits are in `limits`
  void agents.start(pricer, { vendor: 'a' }, { timeoutMs: 1000 })
})

it('resolves a group to the results in order', () => {
  expectTypeOf(
    agents.group({ concurrency: 2 }, (g) => [
      g.start(pricer, { vendor: 'a' }),
      g.start(writer),
    ]),
  ).toEqualTypeOf<Promise<[Priced, string]>>()
  expectTypeOf(
    agents.group({ onFailure: 'collect' }, async (g) => [
      g.start(pricer, { vendor: 'a' }),
      g.start('writer'),
    ]),
  ).toEqualTypeOf<Promise<[AgentSettled<Priced>, AgentSettled<unknown>]>>()
  expectTypeOf(
    agents.group({}, (g) =>
      ['a', 'b'].map((vendor) => g.start(pricer, { vendor })),
    ),
  ).toEqualTypeOf<Promise<Array<Priced>>>()
  // @ts-expect-error wrong input in a group
  void agents.group({}, (g) => [g.start(pricer, { vendor: 1 })])
})

it('gives plugins and agent code the same agent actions', () => {
  expectTypeOf<PluginServices['agents']>().toEqualTypeOf<AgentActions>()
  expectTypeOf<HarnessAgentContext['agents']>().toEqualTypeOf<AgentActions>()
  expectTypeOf<PluginSetupContext['agents']>().toExtend<AgentActions>()
})

it('gives plugins the logger of the host as ctx.logger', () => {
  expectTypeOf<PluginSetupContext['logger']>().toEqualTypeOf<Logger>()
})

it('types ctx.harness as optional, since a plain chat() run has none', () => {
  defineAgent({
    name: 'boss',
    description: 'Starts a worker',
    run: async (ctx) => {
      expectTypeOf(ctx.harness).toEqualTypeOf<HarnessAgentContext | undefined>()
      if (!ctx.harness) throw new Error('This agent must run in a harness.')
      const priced = await ctx.harness.agents.run(pricer, { vendor: 'a' })
      expectTypeOf(priced).toEqualTypeOf<Priced>()
      return `${priced.cents}`
    },
  })
})

it('takes only JSON values from step.do', () => {
  interface Invoice {
    id: string
    total?: number
  }
  const run = async (step: ToolStep, invoice: Invoice) => {
    expectTypeOf(
      await step.do('invoice', () => invoice),
    ).toEqualTypeOf<Invoice>()
    expectTypeOf(await step.do('mail', async () => {})).toEqualTypeOf<void>()
    // @ts-expect-error JSON turns a Date into a string.
    await step.do('now', () => new Date())
    // @ts-expect-error JSON turns a Map into {}.
    await step.do('seen', () => ({ ids: new Map<string, number>() }))
  }
  expectTypeOf(run).toBeFunction()
})

it('exports HarnessErrorCode from each entry, as the type of the error code', () => {
  expectTypeOf<HarnessProtocolError['code']>().toEqualTypeOf<HarnessErrorCode>()
  expectTypeOf<ClientErrorCode>().toEqualTypeOf<HarnessErrorCode>()
  expectTypeOf<ServerErrorCode>().toEqualTypeOf<HarnessErrorCode>()
  expectTypeOf<'slow_consumer'>().toExtend<HarnessErrorCode>()
})
