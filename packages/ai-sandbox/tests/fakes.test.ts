import { describe, expect, it } from 'vitest'
import { createCapability } from '@tanstack/ai'
import { makeMiddlewareCtx } from './fakes'

describe('makeMiddlewareCtx', () => {
  it('tracks provided capabilities and stores their values', () => {
    const ctx = makeMiddlewareCtx({ threadId: 'thread-1', runId: 'run-1' })
    const capability = createCapability<{ value: string }>()('fake-capability')
    const value = { value: 'stored' }

    expect(ctx.capabilities.has(capability)).toBe(false)
    ctx.provide(capability, value)

    expect(ctx.capabilities.has(capability)).toBe(true)
    expect(ctx.get(capability)).toBe(value)
  })
})
