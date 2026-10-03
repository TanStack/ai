import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { defineAgent } from '@tanstack/ai'
import { defineHarness, isHarnessDefinition } from '../src'
import { mockAdapter } from './helpers'

const agent = (name: string) =>
  defineAgent({
    name,
    description: name,
    inputSchema: z.object({ q: z.string() }),
    run: async () => 'ok',
  })

describe('defineHarness', () => {
  const { adapter } = mockAdapter([])

  it('returns a frozen, branded definition', () => {
    const harness = defineHarness({ name: 'acme/test', adapter })
    expect(isHarnessDefinition(harness)).toBe(true)
    expect(Object.isFrozen(harness)).toBe(true)
    expect(isHarnessDefinition({ name: 'x' })).toBe(false)
  })

  it('rejects an empty name', () => {
    expect(() => defineHarness({ name: ' ', adapter })).toThrow(
      'non-empty name',
    )
  })

  it('rejects two different agents with one name', () => {
    expect(() =>
      defineHarness({
        name: 'acme/test',
        adapter,
        agents: [agent('same')],
        subagents: { agents: [agent('same')] },
      }),
    ).toThrow('two different agents are named "same"')
  })

  it('allows one agent in both agents and subagents', () => {
    const shared = agent('shared')
    expect(() =>
      defineHarness({
        name: 'acme/test',
        adapter,
        agents: [shared],
        subagents: { agents: [shared] },
      }),
    ).not.toThrow()
  })

  it('rejects expose names that are not agents', () => {
    expect(() =>
      defineHarness({
        name: 'acme/test',
        adapter,
        agents: [agent('real')],
        expose: { agents: ['missing' as 'real'] },
      }),
    ).toThrow('expose.agents names "missing"')
  })
})
