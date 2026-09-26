import { expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { defineHarness } from '../src'
import { mockAdapter } from './helpers'
import type { HarnessSession, Operation } from '../src'

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
