import { describe, expect, it } from 'vitest'
import { planSbxPolicy, policyArgs } from '../src/sbx/policy'
import { defineSandboxPolicy } from '@tanstack/ai-sandbox'

describe('planSbxPolicy', () => {
  it('uses the machine preset when there is no policy and no host lists', () => {
    expect(planSbxPolicy({})).toEqual({ kind: 'machine-preset' })
  })

  it('adds auto API hosts for grok-build with no policy and no host lists', () => {
    expect(planSbxPolicy({ adapterName: 'grok-build' })).toEqual({
      kind: 'per-sandbox',
      allow: ['api.x.ai'],
      deny: [],
    })
  })

  it('adds auto API hosts for claude-code and codex with no policy', () => {
    expect(planSbxPolicy({ adapterName: 'claude-code' })).toEqual({
      kind: 'per-sandbox',
      allow: ['api.anthropic.com'],
      deny: [],
    })
    expect(planSbxPolicy({ adapterName: 'codex' })).toEqual({
      kind: 'per-sandbox',
      allow: ['api.openai.com'],
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
      allow: ['api.x.ai', '*.npmjs.org'],
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
      allow: ['api.anthropic.com'],
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
      allow: ['api.openai.com'],
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
      allow: ['registry.npmjs.org'],
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
      allow: ['example.com'],
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
      allow: ['api.x.ai'],
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
        'deny',
        'network',
        '--sandbox',
        'deadbeefdeadbeef',
        'ads.example.com',
      ],
    ])
  })
})
