import { describe, it, expect, vi } from 'vitest'
import {
  createCapability,
  CapabilityRegistry,
} from '../src/activities/chat/middleware/capabilities'
import type { CapabilityContext } from '../src/activities/chat/middleware/capabilities'

// A capability accessor only needs `ctx.capabilities`, so test contexts are
// typed against the minimal CapabilityContext — no casts.
function makeCtx(): CapabilityContext {
  return { capabilities: new CapabilityRegistry() }
}

describe('createCapability + CapabilityRegistry', () => {
  it('provides and gets a value by handle reference', () => {
    const cap = createCapability<{ n: number }>('thing')
    const [getThing, provideThing] = cap
    const ctx = makeCtx()
    provideThing(ctx, { n: 1 })
    expect(getThing(ctx)).toEqual({ n: 1 })
  })

  it('get throws a named error when absent', () => {
    const [getThing] = createCapability<number>('counter')
    const ctx = makeCtx()
    expect(() => getThing(ctx)).toThrowError(/capability "counter".*never provided/i)
  })

  it('get with { optional: true } returns undefined when absent', () => {
    const [getThing] = createCapability<number>('counter')
    const ctx = makeCtx()
    expect(getThing(ctx, { optional: true })).toBeUndefined()
  })

  it('two capabilities with the same name are distinct identities', () => {
    const [getA, provideA] = createCapability<string>('dup')
    const [getB] = createCapability<string>('dup')
    const ctx = makeCtx()
    provideA(ctx, 'a')
    expect(getA(ctx)).toBe('a')
    expect(getB(ctx, { optional: true })).toBeUndefined()
  })

  it('exposes capabilityName for diagnostics', () => {
    const cap = createCapability<number>('labelled')
    expect(cap.capabilityName).toBe('labelled')
  })

  it('duplicate provide is last-wins and notifies the registry', () => {
    const [getThing, provideThing] = createCapability<number>('over')
    const ctx = makeCtx()
    const warn = vi.fn()
    ctx.capabilities.setOnDuplicate(warn)
    provideThing(ctx, 1)
    provideThing(ctx, 2)
    expect(getThing(ctx)).toBe(2)
    expect(warn).toHaveBeenCalledWith('over')
  })
})
