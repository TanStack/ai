import { expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import {
  createHarnessHost,
  defineHarness,
  definePlugin,
  oauthConnector,
} from '../src'
import { createHarnessHandler } from '../src/server'
import { mockAdapter } from './helpers'
import type { AnyTextAdapter, KeyedAdapter } from '@tanstack/ai'
import type { SessionIndexEntry } from '@tanstack/ai-persistence'
import type {
  AgentRun,
  HarnessConfig,
  HarnessInput,
  HarnessSession,
  Operation,
  PluginLifetime,
  Receipt,
  RecoverHook,
  SessionMetadataOf,
} from '../src'
import type { InputSettlement } from '../src/types'

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
    Operation<{ vendor: string; cents: number }>
  >()
  expectTypeOf(session.agents.writer.run()).toEqualTypeOf<Operation<string>>()
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
  expectTypeOf<PluginLifetime>().toEqualTypeOf<'session' | 'turn'>()
})

it('takes attempt and time limits on the harness', () => {
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
      }
    | undefined
  >()
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
    expectTypeOf(ctx.session.entry).returns.resolves.toEqualTypeOf<
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
        expectTypeOf(await hooked.entry()).toEqualTypeOf<
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

it('needs an explicit canAccess and an explicit login mode', () => {
  const host = createHarnessHost()
  // @ts-expect-error `canAccess` is required: allow-all must be explicit.
  createHarnessHandler({ host, harness, authorize: () => ({ id: 'u' }) })
  createHarnessHandler({
    host,
    harness,
    authorize: () => ({ id: 'u' }),
    canAccess: () => true,
  })
  const oauth = { authorizationUrl: 'a', tokenUrl: 't', clientId: 'c' }
  // @ts-expect-error `login` is required: no implicit loopback listener.
  oauthConnector({ id: 'svc', label: 'Service', oauth })
  oauthConnector({ id: 'svc', label: 'Service', oauth, login: 'device' })
})
