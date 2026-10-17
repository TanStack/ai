import { afterEach, describe, expect, it } from 'vitest'
import { defineAgent } from '../src/activities/chat/agents/define-agent'
import { chat } from '../src/activities/chat'
import { registerSubagentContextDefaults } from '../src/adapter-internals'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { SubagentBinding } from '../src/activities/chat/agents/bound'

const removers: Array<() => void> = []

afterEach(() => {
  for (const remove of removers.splice(0)) remove()
})

/** Register `fields` as a default, and remove it after the test. */
function registerDefault(fields: object) {
  const remove = registerSubagentContextDefaults(() => fields)
  removers.push(remove)
  return remove
}

/**
 * Run one plain `chat({ subagents })` turn that routes to an agent, and
 * return the `ctx` that the agent's `run` got.
 */
async function contextOfRun(binding?: SubagentBinding) {
  const seen: Array<object> = []
  const probe = defineAgent({
    name: 'probe',
    description: 'Keeps the ctx it gets',
    run: async (ctx) => {
      seen.push(ctx)
      return 'done'
    },
  })
  await collectChunks(
    chat({
      adapter: createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      }).adapter,
      messages: [{ role: 'user', content: 'Go' }],
      subagents: {
        agents: [probe],
        router: () => 'probe',
        ...(binding && { binding }),
      },
    }),
  )
  return seen[0]
}

describe('registerSubagentContextDefaults', () => {
  it('adds the default to the ctx of a run that a plain chat() starts', async () => {
    registerDefault({ marker: 'from the default' })

    expect(await contextOfRun()).toHaveProperty('marker', 'from the default')
  })

  it('lets a binding.extend value win over the default', async () => {
    registerDefault({ marker: 'from the default' })

    const ctx = await contextOfRun({
      extend: () => ({ marker: 'from the binding' }),
    })

    expect(ctx).toHaveProperty('marker', 'from the binding')
  })

  it('removes the default when the returned function runs', async () => {
    const remove = registerDefault({ marker: 'from the default' })
    remove()

    expect(await contextOfRun()).not.toHaveProperty('marker')
  })

  it('keeps a default when another caller removes the same function', async () => {
    const extend = () => ({ marker: 'shared' })
    const first = registerSubagentContextDefaults(extend)
    const second = registerSubagentContextDefaults(extend)
    removers.push(second)

    first()

    expect(await contextOfRun()).toMatchObject({ marker: 'shared' })
  })
})
