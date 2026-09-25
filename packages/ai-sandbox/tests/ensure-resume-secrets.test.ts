import { describe, expect, it } from 'vitest'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import { defineSandbox } from '../src/sandbox'
import { createSecrets } from '../src/secrets'
import { defineWorkspace } from '../src/workspace'
import { InMemorySandboxInstanceStore } from '../src/instance-store'
import { makeFakeProvider } from './fakes'
import type { FakeProvider } from './fakes'
import type { SandboxHandle } from '../src/contracts'

const secrets = createSecrets({ GH_TOKEN: 'ghp_secret' })

const workspaceWithSecrets = defineWorkspace({
  source: { type: 'none' },
  secrets,
})

const workspaceWithoutSecrets = defineWorkspace({
  source: { type: 'none' },
})

function baseCtx(threadId: string) {
  return {
    threadId,
    runId: 'run-1',
    store: new InMemorySandboxInstanceStore(),
    locks: new InMemoryLockStore(),
  }
}

/** Record every `env.set` call on handles returned by `resume`. */
function captureResumeEnvSet(provider: FakeProvider) {
  const seen: Array<Record<string, string>> = []
  const original = provider.resume.bind(provider)
  provider.resume = async (input) => {
    const handle = await original(input)
    if (handle) wrapEnvSet(handle, seen)
    return handle
  }
  return seen
}

/** Record every `env.set` call on handles returned by `restoreSnapshot`. */
function captureRestoreEnvSet(provider: FakeProvider) {
  const seen: Array<Record<string, string>> = []
  const original = provider.restoreSnapshot
  if (!original) return seen
  provider.restoreSnapshot = async (input) => {
    const handle = await original(input)
    wrapEnvSet(handle, seen)
    return handle
  }
  return seen
}

function wrapEnvSet(
  handle: SandboxHandle,
  seen: Array<Record<string, string>>,
) {
  const original = handle.env.set
  handle.env.set = (vars) => {
    seen.push(vars)
    return original(vars)
  }
}

describe('ensure re-applies workspace.secrets after resume', () => {
  it('ensure re-applies workspace.secrets on the resume handle via env.set', async () => {
    const provider = makeFakeProvider()
    const seen = captureResumeEnvSet(provider)
    const def = defineSandbox({
      id: 'repo-resume-secrets',
      provider,
      workspace: workspaceWithSecrets,
    })
    const ctx = baseCtx('thread-resume-secrets')

    await def.ensure(ctx)
    await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.calls.create).toBe(1)
    expect(provider.calls.resume).toBe(1)
    expect(seen).toEqual([{ GH_TOKEN: 'ghp_secret' }])
  })

  it('ensure re-applies workspace.secrets on the restored handle via env.set', async () => {
    const provider = makeFakeProvider({ resumeReturnsNull: true })
    const seen = captureRestoreEnvSet(provider)
    const def = defineSandbox({
      id: 'repo-restore-secrets',
      provider,
      workspace: workspaceWithSecrets,
      lifecycle: { reuse: 'thread', snapshot: 'after-setup' },
    })
    const ctx = baseCtx('thread-restore-secrets')

    await def.ensure(ctx)
    await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.calls.resume).toBe(1)
    expect(provider.calls.restoreSnapshot).toBe(1)
    expect(seen).toEqual([{ GH_TOKEN: 'ghp_secret' }])
  })

  it('ensure does not call env.set on resume when workspace has no secrets', async () => {
    const provider = makeFakeProvider()
    const seen = captureResumeEnvSet(provider)
    const def = defineSandbox({
      id: 'repo-resume-no-secrets',
      provider,
      workspace: workspaceWithoutSecrets,
    })
    const ctx = baseCtx('thread-resume-no-secrets')

    await def.ensure(ctx)
    await def.ensure({ ...ctx, runId: 'run-2' })

    expect(provider.calls.resume).toBe(1)
    expect(seen).toEqual([])
  })

  it('two defines with the same id do not share fallbackStore', async () => {
    // Same id + same provider name + same workspace + same threadId → same
    // compound key. Without a per-call store, both hit the process-lifetime
    // fallbackStore and B would resume A's record (create stays 0).
    const providerA = makeFakeProvider()
    const providerB = makeFakeProvider()
    const a = defineSandbox({ id: 'same', provider: providerA })
    const b = defineSandbox({ id: 'same', provider: providerB })
    const ctxA = baseCtx('thread-shared')
    const ctxB = baseCtx('thread-shared')

    await a.ensure(ctxA)
    await b.ensure(ctxB)

    expect(providerA.calls.create).toBe(1)
    expect(providerB.calls.create).toBe(1)
  })
})
