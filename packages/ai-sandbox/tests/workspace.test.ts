import { describe, expect, it } from 'vitest'
import { createSecrets } from '../src/secrets'
import {
  defineWorkspace,
  gitSkill,
  localSource,
  mcpSkill,
} from '../src/workspace'

describe('gitSkill', () => {
  it('returns a git WorkspaceSkill with repo and secret', () => {
    const secrets = createSecrets({ GH_TOKEN: 'tok' })
    const skill = gitSkill({ repo: 'me/x', secret: secrets.GH_TOKEN })
    expect(skill).toEqual({
      kind: 'git',
      repo: 'me/x',
      secret: secrets.GH_TOKEN,
    })
  })

  it('returns a git WorkspaceSkill without secret when omitted', () => {
    const skill = gitSkill({ repo: 'me/public' })
    expect(skill).toEqual({ kind: 'git', repo: 'me/public' })
  })

  it('includes into when provided', () => {
    const skill = gitSkill({ repo: 'me/x', into: 'skills/x' })
    expect(skill).toEqual({ kind: 'git', repo: 'me/x', into: 'skills/x' })
  })
})

describe('defineWorkspace', () => {
  it('round-trips instructions', () => {
    const ws = defineWorkspace({
      source: localSource('/workspace'),
      instructions: 'You are a helpful agent.',
    })
    expect(ws.instructions).toBe('You are a helpful agent.')
  })

  it('round-trips plugins', () => {
    const ws = defineWorkspace({
      source: localSource('/workspace'),
      plugins: ['@anthropic/plugin-foo', '@anthropic/plugin-bar'],
    })
    expect(ws.plugins).toEqual([
      '@anthropic/plugin-foo',
      '@anthropic/plugin-bar',
    ])
  })

  it('round-trips secrets (Secrets object)', () => {
    const secrets = createSecrets({ API_KEY: 'secret-value' })
    const ws = defineWorkspace({
      source: localSource('/workspace'),
      secrets,
    })
    expect(ws.secrets).toBe(secrets)
    // The SecretRef is accessible by name — use the typed local directly
    expect(secrets.API_KEY.__secretName).toBe('API_KEY')
  })
})

describe('mcpSkill', () => {
  it('keeps a SecretRef in the descriptor without resolving it', () => {
    const secrets = createSecrets({ AUTH_TOKEN: 'bearer-value' })
    const secretRef = secrets.AUTH_TOKEN
    const skill = mcpSkill('my-server', {
      headers: { Authorization: secretRef },
    })
    expect(skill.kind).toBe('mcp')
    if (skill.kind !== 'mcp') return
    expect(skill.name).toBe('my-server')
    // The header value must still be the unresolved SecretRef
    const authHeader = skill.config.headers?.['Authorization']
    expect(authHeader).toBe(secretRef)
    expect(authHeader).toEqual({ __secretName: 'AUTH_TOKEN' })
  })
})
