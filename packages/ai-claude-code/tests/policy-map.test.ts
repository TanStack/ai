import { describe, expect, it } from 'vitest'
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'
import { mapPolicyToClaudeFlags } from '../src/adapters/policy-map'

describe('mapPolicyToClaudeFlags', () => {
  it('returns empty additions for no policy', () => {
    const flags = mapPolicyToClaudeFlags(undefined)
    expect(flags).toEqual({ allowedTools: [], disallowedTools: [] })
  })

  it('maps the default decision to a permission mode', () => {
    expect(
      mapPolicyToClaudeFlags(defineSandboxPolicy({ default: 'allow' }))
        .permissionMode,
    ).toBe('bypassPermissions')
    expect(
      mapPolicyToClaudeFlags(defineSandboxPolicy({ default: 'deny' }))
        .permissionMode,
    ).toBe('default')
    expect(
      mapPolicyToClaudeFlags(defineSandboxPolicy({ default: 'ask' }))
        .permissionMode,
    ).toBe('acceptEdits')
  })

  it('disallows write tools when fileWrite is denied', () => {
    const flags = mapPolicyToClaudeFlags(
      defineSandboxPolicy({ capabilities: { fileWrite: 'deny' } }),
    )
    expect(flags.disallowedTools).toEqual(
      expect.arrayContaining(['Write', 'Edit', 'MultiEdit']),
    )
  })

  it('disallows network tools when network is denied', () => {
    const flags = mapPolicyToClaudeFlags(
      defineSandboxPolicy({ capabilities: { network: 'deny' } }),
    )
    expect(flags.disallowedTools).toEqual(
      expect.arrayContaining(['WebFetch', 'WebSearch']),
    )
  })

  it('maps tool-name command rules to allow/deny lists', () => {
    const flags = mapPolicyToClaudeFlags(
      defineSandboxPolicy({
        commands: { allow: ['Read'], deny: ['Bash', 'pnpm *'] },
      }),
    )
    // 'Bash' is a built-in tool name -> disallowed; 'pnpm *' is a command glob,
    // not a tool name, so it's left to the permission-prompt tool.
    expect(flags.allowedTools).toContain('Read')
    expect(flags.disallowedTools).toContain('Bash')
    expect(flags.disallowedTools).not.toContain('pnpm *')
  })
})
