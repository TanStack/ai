import { describe, expect, it } from 'vitest'
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'
import { mapPolicyToCodexFlags } from '../src/adapters/policy-map'

describe('mapPolicyToCodexFlags', () => {
  it('returns no flags for no policy', () => {
    expect(mapPolicyToCodexFlags(undefined)).toEqual({})
  })

  it('maps fileWrite deny to read-only sandbox mode', () => {
    const flags = mapPolicyToCodexFlags(
      defineSandboxPolicy({ capabilities: { fileWrite: 'deny' } }),
    )
    expect(flags.sandboxMode).toBe('read-only')
  })

  it('maps network capability to network_access', () => {
    expect(
      mapPolicyToCodexFlags(
        defineSandboxPolicy({ capabilities: { network: 'allow' } }),
      ).networkAccessEnabled,
    ).toBe(true)
    expect(
      mapPolicyToCodexFlags(
        defineSandboxPolicy({ capabilities: { network: 'deny' } }),
      ).networkAccessEnabled,
    ).toBe(false)
  })

  it('maps a fully-permissive policy to approval_policy=never', () => {
    expect(
      mapPolicyToCodexFlags(defineSandboxPolicy({ default: 'allow' }))
        .approvalPolicy,
    ).toBe('never')
  })

  it('maps a default-deny policy to approval_policy=untrusted', () => {
    expect(
      mapPolicyToCodexFlags(defineSandboxPolicy({ default: 'deny' }))
        .approvalPolicy,
    ).toBe('untrusted')
  })

  it('maps ask command rules to approval_policy=on-request', () => {
    expect(
      mapPolicyToCodexFlags(
        defineSandboxPolicy({ commands: { ask: ['pnpm *'] } }),
      ).approvalPolicy,
    ).toBe('on-request')
  })

  it('maps default ask without ask command rules to on-request', () => {
    expect(
      mapPolicyToCodexFlags(defineSandboxPolicy({ default: 'ask' }))
        .approvalPolicy,
    ).toBe('on-request')
  })

  // Headless `codex exec` refuses tools when approval_policy is on-request.
  // A deny list is a hard block, not a human prompt, so default: allow +
  // deny stays never. Issue #1081 item 1.
  it('does not treat a deny list as on-request when default is allow', () => {
    expect(
      mapPolicyToCodexFlags(
        defineSandboxPolicy({
          default: 'allow',
          commands: { deny: ['rm -rf /'] },
        }),
      ).approvalPolicy,
    ).toBe('never')
  })
})
