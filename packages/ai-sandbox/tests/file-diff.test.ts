import { describe, expect, it } from 'vitest'
import { buildFileHookEvent } from '../src/file-diff'
import { captureLogger } from './fakes'
import type { SandboxHandle } from '../src/contracts'

function fakeHandle(
  overrides: Partial<SandboxHandle['process']> & {
    read?: (p: string) => Promise<string>
  },
): SandboxHandle {
  return {
    fs: { read: overrides.read ?? (async () => 'AFTER') },
    process: {
      exec:
        overrides.exec ??
        (async () => ({ stdout: '', stderr: '', exitCode: 0 })),
    },
  } as unknown as SandboxHandle
}

describe('buildFileHookEvent', () => {
  it('after() reads current content; delete → empty', async () => {
    const h = fakeHandle({ read: async () => 'HELLO' })
    const created = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'create',
      path: '/workspace/a.ts',
      timestamp: 1,
    })
    expect(await created.after()).toBe('HELLO')
    const deleted = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'delete',
      path: '/workspace/a.ts',
      timestamp: 1,
    })
    expect(await deleted.after()).toBe('')
  })

  it('before() runs `git show <base>:<rel>` and returns "" on non-zero exit', async () => {
    const calls: Array<string> = []
    const h = fakeHandle({
      exec: async (cmd: string) => {
        calls.push(cmd)
        return { stdout: 'OLD', stderr: '', exitCode: 0 }
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'change',
      path: '/workspace/src/a.ts',
      timestamp: 1,
    })
    expect(await e.before()).toBe('OLD')
    expect(calls[0]).toBe("git show 'sha1':'src/a.ts'")

    const missing = buildFileHookEvent(
      fakeHandle({
        exec: async () => ({ stdout: '', stderr: 'x', exitCode: 128 }),
      }),
      '/workspace',
      'sha1',
      { type: 'change', path: '/workspace/src/a.ts', timestamp: 1 },
    )
    expect(await missing.before()).toBe('')
  })

  it('diff() with empty base synthesizes an add-patch from after()', async () => {
    const e = buildFileHookEvent(
      fakeHandle({ read: async () => 'line1\n' }),
      '/workspace',
      '',
      { type: 'create', path: '/workspace/a.ts', timestamp: 1 },
    )
    const patch = await e.diff()
    expect(patch).toContain('+line1')
  })

  it('diff() with empty base and a delete event resolves to "" (no bogus add-patch)', async () => {
    const e = buildFileHookEvent(
      fakeHandle({ read: async () => 'AFTER' }),
      '/workspace',
      '',
      { type: 'delete', path: '/workspace/a.ts', timestamp: 1 },
    )
    expect(await e.diff()).toBe('')
  })

  it('diff() with a base runs `git diff <base> -- <rel-path>`', async () => {
    const calls: Array<string> = []
    const h = fakeHandle({
      exec: async (cmd: string) => {
        calls.push(cmd)
        return { stdout: 'DIFF', stderr: '', exitCode: 0 }
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'change',
      path: '/workspace/a.ts',
      timestamp: 1,
    })
    expect(await e.diff()).toBe('DIFF')
    // Pathspec is relativized (like before()'s `git show`) — a bare leading
    // `/` is resolved by git against the filesystem root, not the repo root,
    // and would fail with "fatal: Invalid path" once `root` isn't literally
    // `/workspace` on disk (e.g. every local-process sandbox).
    expect(calls[0]).toBe("git diff 'sha1' -- 'a.ts'")
  })

  it('diff() relativizes a nested path the same way before() does', async () => {
    const calls: Array<string> = []
    const h = fakeHandle({
      exec: async (cmd: string) => {
        calls.push(cmd)
        return { stdout: 'DIFF', stderr: '', exitCode: 0 }
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'change',
      path: '/workspace/src/a.ts',
      timestamp: 1,
    })
    expect(await e.diff()).toBe('DIFF')
    expect(calls[0]).toBe("git diff 'sha1' -- 'src/a.ts'")
  })

  it('diff() with a base synthesizes an add-patch when git diff is empty for a create (untracked file)', async () => {
    // `git diff <sha> -- <path>` shows nothing for an untracked file, so a
    // freshly created file yields exitCode 0 + empty stdout even though it has
    // content. The git-show probe exits non-zero (absent at baseline), so the
    // create must still get a real diff.
    const h = fakeHandle({
      read: async () => 'line1\n',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: '', exitCode: 1 } // not ignored
        if (cmd.startsWith('git show'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 } // untracked
        return { stdout: '', stderr: '', exitCode: 0 } // git diff empty
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'create',
      path: '/workspace/new.ts',
      timestamp: 1,
    })
    const patch = await e.diff()
    expect(patch).toContain('--- /dev/null')
    expect(patch).toContain('+line1')
  })

  it('diff() returns "" for a TRACKED file whose git diff is empty (identical to baseline, no bogus add-patch)', async () => {
    // A file present at the baseline (before() non-empty) whose content now
    // matches it legitimately diffs empty — it must NOT be synthesized into a
    // full-file add-patch. Only a file ABSENT at the baseline synthesizes.
    const h = fakeHandle({
      read: async () => 'X',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: '', exitCode: 1 } // not ignored
        if (cmd.startsWith('git show'))
          return { stdout: 'X', stderr: '', exitCode: 0 } // tracked at baseline
        return { stdout: '', stderr: '', exitCode: 0 } // git diff: identical
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'change',
      path: '/workspace/a.ts',
      timestamp: 1,
    })
    expect(await e.diff()).toBe('')
  })

  it('diff() synthesizes an add-patch for a CHANGE to an untracked file (the post-create edit case)', async () => {
    // The dominant #914 case: an agent creates a file then edits it. The edit
    // arrives as a `change`, `git diff` is still empty (git ignores untracked
    // files), and before() is '' (absent at baseline) — so it must synthesize,
    // not stream an empty diff. This is what keys on tracked-ness, not on the
    // event being a `create`.
    const h = fakeHandle({
      read: async () => 'hello\n',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: '', exitCode: 1 } // not ignored
        if (cmd.startsWith('git show'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 } // untracked
        return { stdout: '', stderr: '', exitCode: 0 } // git diff empty
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'change',
      path: '/workspace/new.ts',
      timestamp: 1,
    })
    const patch = await e.diff()
    expect(patch).toContain('diff --git a/new.ts b/new.ts')
    expect(patch).toContain('+hello')
  })

  it('diff() withholds content for a git-ignored file — notify-only, empty diff', async () => {
    // `git check-ignore` reports the path as ignored (exit 0). Even though the
    // file has content and is untracked, diff() returns '' so the file's
    // contents (e.g. a .env / secret) never reach the diff feed. The file event
    // itself still fires elsewhere to notify that it changed.
    const h = fakeHandle({
      read: async () => 'SECRET=1\n',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: '', exitCode: 0 } // ignored
        if (cmd.startsWith('git show'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 } // untracked
        return { stdout: '', stderr: '', exitCode: 0 } // git diff empty
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'create',
      path: '/workspace/.env',
      timestamp: 1,
    })
    expect(await e.diff()).toBe('')
  })

  it('diff() falls through to a normal diff (does NOT withhold) when git check-ignore itself throws', async () => {
    const { logger, calls } = captureLogger()
    const h = fakeHandle({
      read: async () => 'x\n',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore')) throw new Error('check-ignore boom')
        if (cmd.startsWith('git show'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 } // untracked
        return { stdout: '', stderr: '', exitCode: 0 } // git diff empty
      },
    })
    const e = buildFileHookEvent(
      h,
      '/workspace',
      'sha1',
      { type: 'create', path: '/workspace/n.ts', timestamp: 1 },
      logger,
    )
    const patch = await e.diff()
    expect(patch).toContain('+x') // synthesized, not withheld
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('check-ignore')),
    ).toBe(true)
  })

  it('logs a warning and still diffs when git check-ignore errors (exit 128)', async () => {
    const { logger, calls } = captureLogger()
    const h = fakeHandle({
      read: async () => 'y\n',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 } // error, not "1"
        if (cmd.startsWith('git show'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 } // untracked
        return { stdout: '', stderr: '', exitCode: 0 } // git diff empty
      },
    })
    const e = buildFileHookEvent(
      h,
      '/workspace',
      'sha1',
      { type: 'create', path: '/workspace/z.ts', timestamp: 1 },
      logger,
    )
    const patch = await e.diff()
    expect(patch).toContain('+y') // not withheld on a check-ignore error
    expect(
      calls.some(
        (c) => c.level === 'warn' && c.msg.includes('check-ignore non-zero'),
      ),
    ).toBe(true)
  })

  it('logs (sandbox) when the tracked-ness probe exits non-zero before synthesizing', async () => {
    const { logger, calls } = captureLogger()
    const h = fakeHandle({
      read: async () => 'q\n',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: '', exitCode: 1 } // not ignored
        if (cmd.startsWith('git show'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 }
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    })
    const e = buildFileHookEvent(
      h,
      '/workspace',
      'sha1',
      { type: 'create', path: '/workspace/q.ts', timestamp: 1 },
      logger,
    )
    const patch = await e.diff()
    expect(patch).toContain('+q')
    expect(
      calls.some(
        (c) => c.level === 'debug' && c.msg.includes('tracked-ness probe non-zero'),
      ),
    ).toBe(true)
  })

  it('logs a warning when git diff itself throws', async () => {
    const { logger, calls } = captureLogger()
    const h = fakeHandle({
      exec: async (cmd: string) => {
        if (cmd.startsWith('git diff')) throw new Error('diff boom')
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    })
    const e = buildFileHookEvent(
      h,
      '/workspace',
      'sha1',
      { type: 'change', path: '/workspace/a.ts', timestamp: 1 },
      logger,
    )
    expect(await e.diff()).toBe('')
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('git diff')),
    ).toBe(true)
  })

  it('synthesizes a git-shaped add-patch for a multi-line untracked file, with the no-newline marker', async () => {
    const h = fakeHandle({
      read: async () => 'a\nb\nc', // 3 lines, NO trailing newline
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: '', exitCode: 1 }
        if (cmd.startsWith('git show'))
          return { stdout: '', stderr: 'fatal', exitCode: 128 }
        return { stdout: '', stderr: '', exitCode: 0 }
      },
    })
    const e = buildFileHookEvent(h, '/workspace', 'sha1', {
      type: 'create',
      path: '/workspace/m.ts',
      timestamp: 1,
    })
    const patch = await e.diff()
    expect(patch).toContain('new file mode 100644')
    expect(patch).toContain('@@ -0,0 +1,3 @@')
    expect(patch).toContain('+a\n+b\n+c')
    expect(patch).toContain('\\ No newline at end of file')
  })

  it('synthesized add-patch omits the no-newline marker for content that ends in a newline', async () => {
    const e = buildFileHookEvent(
      fakeHandle({ read: async () => 'one\ntwo\n' }),
      '/workspace',
      '',
      { type: 'create', path: '/workspace/a.ts', timestamp: 1 },
    )
    const patch = await e.diff()
    expect(patch).toContain('@@ -0,0 +1,2 @@')
    expect(patch).toContain('+one\n+two\n')
    expect(patch).not.toContain('No newline at end of file')
  })

  it('synthesized add-patch for an empty file is header-only (no hunk)', async () => {
    const e = buildFileHookEvent(
      fakeHandle({ read: async () => '' }),
      '/workspace',
      '',
      { type: 'create', path: '/workspace/empty.ts', timestamp: 1 },
    )
    const patch = await e.diff()
    expect(patch).toBe(
      'diff --git a/empty.ts b/empty.ts\nnew file mode 100644\n',
    )
  })

  it('diff() does NOT synthesize when the tracked-ness probe throws (no bogus add-patch on a git hiccup)', async () => {
    // git diff comes back empty (looks like a no-op), but the git-show probe
    // that would confirm tracked-ness rejects transiently. We must NOT read
    // that as "untracked" and fabricate a full-file add-patch for a file that
    // is (probably) a tracked, unchanged file.
    const { logger, calls } = captureLogger()
    const h = fakeHandle({
      read: async () => 'X',
      exec: async (cmd: string) => {
        if (cmd.startsWith('git check-ignore'))
          return { stdout: '', stderr: '', exitCode: 1 } // not ignored
        if (cmd.startsWith('git show')) throw new Error('git hiccup')
        return { stdout: '', stderr: '', exitCode: 0 } // git diff empty
      },
    })
    const e = buildFileHookEvent(
      h,
      '/workspace',
      'sha1',
      { type: 'change', path: '/workspace/a.ts', timestamp: 1 },
      logger,
    )
    expect(await e.diff()).toBe('')
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('tracked-ness')),
    ).toBe(true)
  })

  it('logs a warning when git diff exits non-zero', async () => {
    const { logger, calls } = captureLogger()
    const h = fakeHandle({
      exec: async () => ({ stdout: '', stderr: 'boom', exitCode: 128 }),
    })
    const e = buildFileHookEvent(
      h,
      '/workspace',
      'sha1',
      { type: 'change', path: '/workspace/a.ts', timestamp: 1 },
      logger,
    )
    expect(await e.diff()).toBe('')
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('git diff')),
    ).toBe(true)
  })

  it('logs a warning when after() fails to read the file', async () => {
    const { logger, calls } = captureLogger()
    const h = fakeHandle({
      read: async () => {
        throw new Error('nope')
      },
    })
    const e = buildFileHookEvent(
      h,
      '/workspace',
      'sha1',
      { type: 'change', path: '/workspace/a.ts', timestamp: 1 },
      logger,
    )
    expect(await e.after()).toBe('')
    expect(
      calls.some((c) => c.level === 'warn' && c.msg.includes('after()')),
    ).toBe(true)
  })
})
