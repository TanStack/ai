import { describe, expect, it } from 'vitest'
import { CapabilityRegistry } from '../../src/middlewares'
import { createCapability } from '../../src/activities/chat/middleware/capabilities'

describe('middlewares public exports', () => {
  it('exports a working CapabilityRegistry', () => {
    const registry = new CapabilityRegistry()
    const capability = createCapability<number>()('value')
    const [getValue, provideValue] = capability
    const context = { capabilities: registry }

    expect(registry.has(capability)).toBe(false)
    provideValue(context, 42)
    expect(registry.has(capability)).toBe(true)
    expect(getValue(context)).toBe(42)
  })
})
