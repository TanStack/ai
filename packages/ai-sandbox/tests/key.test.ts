import { describe, expect, it } from 'vitest'
import { computeSandboxKey, computeWorkspaceHash } from '../src/key'
import { defineWorkspace, githubRepo } from '../src/workspace'
import type { SandboxKeyInput } from '../src/key'

const base: SandboxKeyInput = {
  threadId: 'thread-1',
  sandboxId: 'repo',
  providerName: 'docker',
  workspace: defineWorkspace({ source: githubRepo({ repo: 'TanStack/ai', ref: 'main' }) }),
}

describe('computeSandboxKey', () => {
  it('is stable for identical inputs', () => {
    expect(computeSandboxKey(base)).toBe(computeSandboxKey({ ...base }))
  })

  it('changes when thread, sandbox id, provider, or tenant change', () => {
    const k = computeSandboxKey(base)
    expect(computeSandboxKey({ ...base, threadId: 'thread-2' })).not.toBe(k)
    expect(computeSandboxKey({ ...base, sandboxId: 'other' })).not.toBe(k)
    expect(computeSandboxKey({ ...base, providerName: 'cloudflare' })).not.toBe(k)
    expect(computeSandboxKey({ ...base, tenant: { orgId: 'acme' } })).not.toBe(k)
  })

  it('changes when the workspace source/ref changes (busts stale env)', () => {
    const k = computeSandboxKey(base)
    const otherRef = computeSandboxKey({
      ...base,
      workspace: defineWorkspace({ source: githubRepo({ repo: 'TanStack/ai', ref: 'next' }) }),
    })
    expect(otherRef).not.toBe(k)
  })
})

describe('computeWorkspaceHash', () => {
  it('excludes secrets (rotating a token must not orphan the sandbox)', () => {
    const a = computeWorkspaceHash(
      defineWorkspace({ source: githubRepo({ repo: 'TanStack/ai' }), secrets: { A: '1' } }),
    )
    const b = computeWorkspaceHash(
      defineWorkspace({ source: githubRepo({ repo: 'TanStack/ai' }), secrets: { A: '2' } }),
    )
    expect(a).toBe(b)
  })

  it('changes when setup/scripts change', () => {
    const a = computeWorkspaceHash(
      defineWorkspace({ source: githubRepo({ repo: 'TanStack/ai' }), setup: ['pnpm i'] }),
    )
    const b = computeWorkspaceHash(
      defineWorkspace({ source: githubRepo({ repo: 'TanStack/ai' }), setup: ['npm i'] }),
    )
    expect(a).not.toBe(b)
  })
})
