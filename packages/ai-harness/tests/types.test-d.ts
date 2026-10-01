import { expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { defineHarness } from '../src'
import { mockAdapter } from './helpers'
import type {
  HarnessConfig,
  HarnessInput,
  HarnessSession,
  Operation,
  Receipt,
  RecoverHook,
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

it('takes attempt and time limits on the harness', () => {
  expectTypeOf<HarnessConfig['durability']>().toEqualTypeOf<
    | { maxAttempts?: number; timeoutMs?: number; recover?: RecoverHook }
    | undefined
  >()
})
