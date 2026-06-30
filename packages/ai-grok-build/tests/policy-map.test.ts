import { describe, expect, it } from 'vitest'
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'
import { mapPolicyToGrokBuildFlags } from '../src/adapters/policy-map'

describe('mapPolicyToGrokBuildFlags', () => {
  it('returns no flags for no policy', () => {
    expect(mapPolicyToGrokBuildFlags(undefined)).toEqual({})
  })

  it('maps fileWrite deny to readOnly', () => {
    const flags = mapPolicyToGrokBuildFlags(
      defineSandboxPolicy({ capabilities: { fileWrite: 'deny' } }),
    )
    expect(flags.readOnly).toBe(true)
  })

  it('maps network deny to networkDisabled', () => {
    const flags = mapPolicyToGrokBuildFlags(
      defineSandboxPolicy({ capabilities: { network: 'deny' } }),
    )
    expect(flags.networkDisabled).toBe(true)
  })

  it('maps a fully-permissive policy to no conservative flag', () => {
    expect(
      mapPolicyToGrokBuildFlags(defineSandboxPolicy({ default: 'allow' })),
    ).toEqual({})
  })

  it('maps a default-deny policy to conservative', () => {
    expect(
      mapPolicyToGrokBuildFlags(defineSandboxPolicy({ default: 'deny' }))
        .conservative,
    ).toBe(true)
  })

  it('maps a default-ask policy to conservative', () => {
    expect(
      mapPolicyToGrokBuildFlags(defineSandboxPolicy({ default: 'ask' }))
        .conservative,
    ).toBe(true)
  })

  it('maps ask/deny command rules to conservative', () => {
    expect(
      mapPolicyToGrokBuildFlags(
        defineSandboxPolicy({ commands: { ask: ['pnpm *'] } }),
      ).conservative,
    ).toBe(true)
    expect(
      mapPolicyToGrokBuildFlags(
        defineSandboxPolicy({ default: 'allow', commands: { deny: ['rm *'] } }),
      ).conservative,
    ).toBe(true)
  })
})