import { describe, expect, it } from 'vitest'
import { LocksCapability as CoreLocksCapability } from '@tanstack/ai'
import { LocksCapability as SandboxLocksCapability } from '../src/capabilities'

describe('LocksCapability identity', () => {
  it('is the SAME token object as the one exported by @tanstack/ai', () => {
    // Capability names must be globally unique and the runtime identity is the
    // object reference. The sandbox layer must reference the core token (not a
    // second 'locks' capability) so a persistence-provided LockStore is visible
    // to withSandbox's optional requirement.
    expect(SandboxLocksCapability).toBe(CoreLocksCapability)
  })

  it('is named "locks"', () => {
    expect(SandboxLocksCapability.capabilityName).toBe('locks')
  })
})
