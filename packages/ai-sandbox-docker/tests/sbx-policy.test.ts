import { describe, expect, it } from 'vitest'
import { autoApiHosts, planSbxPolicy, policyArgs } from '../src/sbx/policy'
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

describe('autoApiHosts', () => {
  it('returns grok-build hosts for a known adapter', () => {
    expect(autoApiHosts('grok-build')).toEqual(['api.x.ai'])
  })

  it('returns [] for Object.prototype keys that are not adapters', () => {
    expect(autoApiHosts('constructor')).toEqual([])
    expect(autoApiHosts('toString')).toEqual([])
  })
})

describe('planSbxPolicy', () => {
  it('uses the machine preset when there is no policy and no host lists', () => {
    expect(planSbxPolicy({})).toEqual({ kind: 'machine-preset' })
  })

  it('adds auto API hosts for grok-build with no policy and no host lists', () => {
    expect(planSbxPolicy({ adapterName: 'grok-build' })).toEqual({
      kind: 'per-sandbox',
      allow: ['api.x.ai', 'localhost'],
      deny: [],
    })
  })

  it('adds auto API hosts for claude-code and codex with no policy', () => {
    expect(planSbxPolicy({ adapterName: 'claude-code' })).toEqual({
      kind: 'per-sandbox',
      allow: ['api.anthropic.com', 'localhost'],
      deny: [],
    })
    expect(planSbxPolicy({ adapterName: 'codex' })).toEqual({
      kind: 'per-sandbox',
      allow: ['api.openai.com', 'localhost'],
      deny: [],
    })
  })

  it('stays on the machine preset for opencode or unknown adapter with no policy', () => {
    expect(planSbxPolicy({ adapterName: 'opencode' })).toEqual({
      kind: 'machine-preset',
    })
    expect(planSbxPolicy({})).toEqual({ kind: 'machine-preset' })
  })

  it('maps allow to allow ** then denyNetwork', () => {
    expect(
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'allow' } }),
        denyNetwork: ['ads.example.com'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['**'],
      deny: ['ads.example.com'],
    })
  })

  it('maps deny to an allowlist of auto hosts plus allowNetwork', () => {
    expect(
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
        adapterName: 'grok-build',
        allowNetwork: ['*.npmjs.org'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['api.x.ai', '*.npmjs.org', 'localhost'],
      deny: [],
    })
  })

  it('maps ask the same as deny (allowlist)', () => {
    expect(
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'ask' } }),
        adapterName: 'claude-code',
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['api.anthropic.com', 'localhost'],
      deny: [],
    })
  })

  it('uses policy.default when network is unset', () => {
    expect(
      planSbxPolicy({
        policy: defineSandboxPolicy({ default: 'ask' }),
        adapterName: 'codex',
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['api.openai.com', 'localhost'],
      deny: [],
    })
  })

  it('writes per-sandbox rules when only allowNetwork is set', () => {
    expect(
      planSbxPolicy({
        allowNetwork: ['registry.npmjs.org'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['registry.npmjs.org', 'localhost'],
      deny: [],
    })
  })

  it('adds no auto host for opencode or an unknown adapter', () => {
    expect(
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
        adapterName: 'opencode',
        allowNetwork: ['example.com'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['example.com', 'localhost'],
      deny: [],
    })
  })

  it('denyNetwork only with no policy writes deny rules and does not throw', () => {
    expect(() =>
      planSbxPolicy({ denyNetwork: ['ads.example.com'] }),
    ).not.toThrow(/allowNetwork/)
    expect(planSbxPolicy({ denyNetwork: ['ads.example.com'] })).toEqual({
      kind: 'per-sandbox',
      allow: [],
      deny: ['ads.example.com'],
    })
  })

  it('known adapter + denyNetwork only is additive deny on the preset, not an allowlist of only the model host', () => {
    expect(
      planSbxPolicy({
        adapterName: 'grok-build',
        denyNetwork: ['ads.example.com'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: [],
      deny: ['ads.example.com'],
    })
  })

  it('known adapter + deny policy still builds a real allowlist with auto hosts', () => {
    expect(
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
        adapterName: 'grok-build',
        denyNetwork: ['ads.example.com'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['api.x.ai', 'localhost'],
      deny: ['ads.example.com'],
    })
  })

  it('still throws empty allowlist when decision is really deny or ask', () => {
    expect(() =>
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
      }),
    ).toThrow(/allowNetwork/)
    expect(() =>
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'ask' } }),
        adapterName: 'opencode',
      }),
    ).toThrow(/grokBuildText/)
  })

  it('does not throw an empty allowlist when staying on the machine preset', () => {
    expect(planSbxPolicy({ adapterName: 'opencode' })).toEqual({
      kind: 'machine-preset',
    })
  })

  it('builds per-sandbox policy argv', () => {
    const plan = planSbxPolicy({
      policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
      adapterName: 'grok-build',
      denyNetwork: ['ads.example.com'],
    })
    if (plan.kind !== 'per-sandbox') throw new Error('expected per-sandbox')
    expect(policyArgs(plan, 'deadbeefdeadbeef')).toEqual([
      [
        'policy',
        'allow',
        'network',
        '--sandbox',
        'deadbeefdeadbeef',
        'api.x.ai',
      ],
      [
        'policy',
        'allow',
        'network',
        '--sandbox',
        'deadbeefdeadbeef',
        'localhost',
      ],
      [
        'policy',
        'deny',
        'network',
        '--sandbox',
        'deadbeefdeadbeef',
        'ads.example.com',
      ],
    ])
  })

  it('known adapter + allowNetwork and no policy still adds auto API hosts', () => {
    expect(
      planSbxPolicy({
        adapterName: 'grok-build',
        allowNetwork: ['*.npmjs.org'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['api.x.ai', '*.npmjs.org', 'localhost'],
      deny: [],
    })
  })

  it('denyNetwork-only with no policy still adds no auto hosts', () => {
    expect(
      planSbxPolicy({
        adapterName: 'grok-build',
        denyNetwork: ['ads.example.com'],
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: [],
      deny: ['ads.example.com'],
    })
  })

  it('deny + grok-build allowlist includes localhost for the host proxy rewrite', () => {
    const plan = planSbxPolicy({
      policy: defineSandboxPolicy({ capabilities: { network: 'deny' } }),
      adapterName: 'grok-build',
    })
    expect(plan).toMatchObject({ kind: 'per-sandbox' })
    if (plan.kind !== 'per-sandbox') throw new Error('expected per-sandbox')
    expect(plan.allow).toContain('localhost')
    expect(plan.allow).toContain('api.x.ai')
  })

  it('known adapter with no policy still allows localhost for the bridge', () => {
    const plan = planSbxPolicy({ adapterName: 'grok-build' })
    expect(plan).toMatchObject({ kind: 'per-sandbox' })
    if (plan.kind !== 'per-sandbox') throw new Error('expected per-sandbox')
    expect(plan.allow).toContain('localhost')
    expect(plan.allow).toContain('api.x.ai')
  })

  it('allowNetwork-only allowlist includes localhost', () => {
    const plan = planSbxPolicy({
      allowNetwork: ['registry.npmjs.org'],
    })
    expect(plan).toMatchObject({ kind: 'per-sandbox' })
    if (plan.kind !== 'per-sandbox') throw new Error('expected per-sandbox')
    expect(plan.allow).toContain('localhost')
    expect(plan.allow).toContain('registry.npmjs.org')
  })

  it('denyNetwork-only still does not add localhost', () => {
    const plan = planSbxPolicy({ denyNetwork: ['ads.example.com'] })
    expect(plan).toEqual({
      kind: 'per-sandbox',
      allow: [],
      deny: ['ads.example.com'],
    })
    if (plan.kind !== 'per-sandbox') throw new Error('expected per-sandbox')
    expect(plan.allow).not.toContain('localhost')
  })

  it('allow ** does not add localhost beside the open host', () => {
    expect(
      planSbxPolicy({
        policy: defineSandboxPolicy({ capabilities: { network: 'allow' } }),
      }),
    ).toEqual({
      kind: 'per-sandbox',
      allow: ['**'],
      deny: [],
    })
  })
})
