import { describe, it, expect } from 'vitest'
import { buildFileHookEvent } from '../src/file-diff'
import type { SandboxHandle } from '../src/contracts'

function fakeHandle(overrides: Partial<SandboxHandle['process']> & {
  read?: (p: string) => Promise<string>
}): SandboxHandle {
  return {
    fs: { read: overrides.read ?? (async () => 'AFTER') },
    process: { exec: overrides.exec ?? (async () => ({ stdout: '', stderr: '', exitCode: 0 })) },
  } as unknown as SandboxHandle
}

describe('buildFileHookEvent', () => {
  it('after() reads current content; delete → empty', async () => {
    const h = fakeHandle({ read: async () => 'HELLO' })
    const created = buildFileHookEvent(h, '/workspace', 'sha1', { type: 'create', path: '/workspace/a.ts', timestamp: 1 })
    expect(await created.after()).toBe('HELLO')
    const deleted = buildFileHookEvent(h, '/workspace', 'sha1', { type: 'delete', path: '/workspace/a.ts', timestamp: 1 })
    expect(await deleted.after()).toBe('')
  })

  it('before() runs `git show <base>:<rel>` and returns "" on non-zero exit', async () => {
    const calls: Array<string> = []
    const h = fakeHandle({ exec: async (cmd: string) => { calls.push(cmd); return { stdout: 'OLD', stderr: '', exitCode: 0 } } })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', { type: 'change', path: '/workspace/src/a.ts', timestamp: 1 })
    expect(await e.before()).toBe('OLD')
    expect(calls[0]).toBe("git show 'sha1':'src/a.ts'")

    const missing = buildFileHookEvent(
      fakeHandle({ exec: async () => ({ stdout: '', stderr: 'x', exitCode: 128 }) }),
      '/workspace', 'sha1', { type: 'change', path: '/workspace/src/a.ts', timestamp: 1 },
    )
    expect(await missing.before()).toBe('')
  })

  it('diff() with empty base synthesizes an add-patch from after()', async () => {
    const e = buildFileHookEvent(fakeHandle({ read: async () => 'line1\n' }), '/workspace', '', { type: 'create', path: '/workspace/a.ts', timestamp: 1 })
    const patch = await e.diff()
    expect(patch).toContain('+line1')
  })

  it('diff() with a base runs `git diff <base> -- <path>`', async () => {
    const calls: Array<string> = []
    const h = fakeHandle({ exec: async (cmd: string) => { calls.push(cmd); return { stdout: 'DIFF', stderr: '', exitCode: 0 } } })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', { type: 'change', path: '/workspace/a.ts', timestamp: 1 })
    expect(await e.diff()).toBe('DIFF')
    expect(calls[0]).toBe("git diff 'sha1' -- '/workspace/a.ts'")
  })
})
