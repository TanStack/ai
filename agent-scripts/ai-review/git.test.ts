import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtemp, writeFile, rename, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  applyPatch,
  commitAll,
  headRemoteUrl,
  preparePullWorktree,
  pushHead,
  readPullSnapshot,
} from './git'
import type { GitRunner } from './git'
import { auditPullSecurity } from './security'

type GitResult = { stdout: string; stderr: string; code: number }

const CWD = '/tmp/review'
const IDENTITY = { name: 'TanStack AI Bot', email: 'bot@tanstack.com' }
const TOKEN = 'ghs_abc'
const ORIGIN = 'TanStack/ai'
const FORK = 'alice/ai'
const REMOTE = `https://x-access-token:tok@github.com/${ORIGIN}.git`

const BASE = 'a'.repeat(40)
const HEAD = 'b'.repeat(40)
const MERGE_BASE = 'c'.repeat(40)
const OLD_BLOB = 'd'.repeat(40)
const NEW_BLOB = 'e'.repeat(40)

function snapshotRunner(
  options: {
    paths?: Array<string>
    raw?: string
    diff?: string
    failFetch?: boolean
  } = {},
) {
  const paths = options.paths ?? ['package.json']
  return createFakeRunner((args) => {
    if (args[0] === 'fetch' && options.failFetch)
      return { stdout: '', stderr: 'missing object', code: 1 }
    let stdout = ''
    if (args[0] === 'merge-base') stdout = MERGE_BASE
    if (args.includes('--raw'))
      stdout =
        options.raw ??
        paths
          .map((path) => `:100644 100644 ${OLD_BLOB} ${NEW_BLOB} M\0${path}\0`)
          .join('')
    if (args.includes('--patch'))
      stdout =
        options.diff ??
        paths
          .map(
            (path) =>
              `diff --git a/${JSON.stringify(path)} b/${JSON.stringify(path)}\n--- old\n+++ new\n@@ -1 +1 @@\n-old\n+new\n`,
          )
          .join('')
    if (args[0] === 'cat-file')
      stdout = args[2] === OLD_BLOB ? '{}' : '{"dependencies":{"left-pad":"1"}}'
    return { stdout, stderr: '', code: 0 }
  })
}

describe('readPullSnapshot', () => {
  it('reads real Git renames, modes, UTF-8 paths, and divergent base manifests', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ai-review-snapshot-'))
    const run = (args: Array<string>) => {
      const result = spawnSync(
        'git',
        [
          '-c',
          'user.name=Fixture',
          '-c',
          'user.email=fixture@example.com',
          '-c',
          `core.hooksPath=${join(directory, 'no-hooks')}`,
          ...args,
        ],
        { cwd: directory, encoding: 'utf8' },
      )
      if (result.status !== 0) throw new Error(result.stderr)
      return result.stdout.trim()
    }
    const runner: GitRunner = async (args, cwd) => {
      const result = spawnSync('git', args, { cwd, encoding: 'utf8' })
      return {
        stdout: result.stdout,
        stderr: result.stderr,
        code: result.status ?? 1,
      }
    }
    try {
      run(['init'])
      await writeFile(join(directory, 'package.json'), '{}\n')
      await writeFile(join(directory, 'AGENTS.md'), 'fixture instructions\n')
      await writeFile(join(directory, 'café.ts'), 'old\n')
      run(['add', '.'])
      run(['commit', '-m', 'fixture base'])
      const mergeBase = run(['rev-parse', 'HEAD'])
      await writeFile(
        join(directory, 'package.json'),
        '{"dependencies":{"left-pad":"1"}}\n',
      )
      run(['add', '.'])
      run(['commit', '-m', 'base update'])
      const baseSha = run(['rev-parse', 'HEAD'])
      run(['checkout', '--detach', mergeBase])
      await writeFile(
        join(directory, 'package.json'),
        '{"dependencies":{"left-pad":"1"}}\n',
      )
      await rename(
        join(directory, 'AGENTS.md'),
        join(directory, 'old-rules.md'),
      )
      await writeFile(join(directory, 'café.ts'), 'new\n')
      run(['add', '.'])
      run(['update-index', '--chmod=+x', 'café.ts'])
      run(['commit', '-m', 'head change'])
      const headSha = run(['rev-parse', 'HEAD'])
      run(['remote', 'add', 'origin', directory])
      const snapshot = await readPullSnapshot(
        directory,
        { baseSha, headSha },
        runner,
      )
      expect(snapshot.mergeBase).toBe(mergeBase)
      expect(snapshot.files.map((file) => file.path)).toEqual([
        'AGENTS.md',
        'café.ts',
        'old-rules.md',
        'package.json',
      ])
      expect(
        snapshot.files.find((file) => file.path === 'AGENTS.md')?.headMode,
      ).toBe('000000')
      expect(auditPullSecurity(snapshot).reasons).toEqual([
        'AGENTS.md: changes security-sensitive instructions or automation',
        'café.ts: becomes executable',
        'package.json: adds dependencies: left-pad',
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('uses the merge base and fixed blob IDs without checking out files', async () => {
    const { runner, calls } = snapshotRunner()
    const snapshot = await readPullSnapshot(
      CWD,
      { baseSha: BASE, headSha: HEAD },
      runner,
    )
    expect(snapshot.mergeBase).toBe(MERGE_BASE)
    expect(snapshot.files[0]).toMatchObject({
      path: 'package.json',
      before: '{}',
      after: '{"dependencies":{"left-pad":"1"}}',
    })
    expect(
      calls
        .filter(({ args }) => args[0] === 'diff')
        .every(
          ({ args }) =>
            args.includes(MERGE_BASE) &&
            args.includes(HEAD) &&
            args.includes('--no-ext-diff') &&
            args.includes('--no-textconv') &&
            args.includes('--no-renames'),
        ),
    ).toBe(true)
    expect(
      calls.some(
        ({ args }) => args.includes('checkout') || args.includes('worktree'),
      ),
    ).toBe(false)
  })

  it('names a file type change instead of reporting an incomplete patch', async () => {
    const { runner } = snapshotRunner({
      raw: `:120000 100644 ${OLD_BLOB} ${NEW_BLOB} T\0link.ts\0`,
      diff: 'diff --git a/link.ts b/link.ts\ndeleted file mode 120000\ndiff --git a/link.ts b/link.ts\nnew file mode 100644\n',
    })
    await expect(
      readPullSnapshot(CWD, { baseSha: BASE, headSha: HEAD }, runner),
    ).rejects.toThrow('File type changes are not supported')
  })

  it('keeps dotfiles and control characters from NUL-delimited paths', async () => {
    const paths = ['.hidden', 'quote"name.ts', 'line\nname.ts']
    const { runner } = snapshotRunner({ paths })
    const snapshot = await readPullSnapshot(
      CWD,
      { baseSha: BASE, headSha: HEAD },
      runner,
    )
    expect(snapshot.files.map((file) => file.path)).toEqual(paths)
  })

  it('scans a sensitive path after more than 3000 changed files', async () => {
    const paths = [
      ...Array.from({ length: 3001 }, (_, index) => `src/${index}.ts`),
      '.agents/rules.md',
    ]
    const { runner } = snapshotRunner({ paths })
    const snapshot = await readPullSnapshot(
      CWD,
      { baseSha: BASE, headSha: HEAD },
      runner,
    )
    expect(snapshot.files).toHaveLength(3002)
    expect(auditPullSecurity(snapshot)).toEqual({
      ok: false,
      reasons: [
        '.agents/rules.md: changes security-sensitive instructions or automation',
      ],
    })
  })

  it.each([
    { raw: 'incomplete' },
    { raw: `:100644 100644 ${OLD_BLOB} ${NEW_BLOB} R100\0old\0new\0` },
    { diff: '' },
  ])('rejects incomplete or unsupported Git output', async (options) => {
    const { runner } = snapshotRunner(options)
    await expect(
      readPullSnapshot(CWD, { baseSha: BASE, headSha: HEAD }, runner),
    ).rejects.toThrow(/snapshot/i)
  })

  it('does not fall back to a mutable reference after a fetch failure', async () => {
    const { runner, calls } = snapshotRunner({ failFetch: true })
    await expect(
      readPullSnapshot(CWD, { baseSha: BASE, headSha: HEAD }, runner),
    ).rejects.toThrow('missing object')
    expect(calls).toHaveLength(1)
  })
})

function createFakeRunner(
  impl?: (args: Array<string>, cwd: string) => GitResult,
) {
  const calls: Array<{ args: Array<string>; cwd: string; input?: string }> = []
  const runner: GitRunner = async (args, cwd, input) => {
    calls.push({
      args: [...args],
      cwd,
      ...(input === undefined ? {} : { input }),
    })
    if (impl) {
      return impl(args, cwd)
    }
    return { stdout: '', stderr: '', code: 0 }
  }
  return { runner, calls }
}

describe('applyPatch', () => {
  it('checks a patch before it applies it', async () => {
    const { runner, calls } = createFakeRunner()

    await applyPatch(CWD, 'diff text', runner)

    expect(calls).toEqual([
      {
        args: ['apply', '--check', '--whitespace=error-all', '-'],
        cwd: CWD,
        input: 'diff text',
      },
      {
        args: ['apply', '--whitespace=error-all', '-'],
        cwd: CWD,
        input: 'diff text',
      },
    ])
  })

  it('does not apply a patch that fails its check', async () => {
    const { runner, calls } = createFakeRunner((args) => ({
      stdout: '',
      stderr: args.includes('--check') ? 'bad patch' : '',
      code: args.includes('--check') ? 1 : 0,
    }))

    await expect(applyPatch(CWD, 'bad', runner)).rejects.toThrow(/bad patch/)
    expect(calls).toHaveLength(1)
  })
})

describe('preparePullWorktree', () => {
  it('creates the worktree after the fetched SHA matches', async () => {
    const { runner, calls } = createFakeRunner((args) => ({
      stdout: args[0] === 'rev-parse' ? 'abc123\n' : '',
      stderr: '',
      code: 0,
    }))

    await preparePullWorktree(CWD, '/tmp/pr-head', 42, 'abc123', runner)

    expect(calls).toEqual([
      {
        args: ['fetch', '--no-tags', 'origin', 'pull/42/head'],
        cwd: CWD,
      },
      { args: ['rev-parse', 'FETCH_HEAD'], cwd: CWD },
      {
        args: ['worktree', 'add', '--detach', '/tmp/pr-head', 'abc123'],
        cwd: CWD,
      },
    ])
  })

  it('does not check out a head that changed during review', async () => {
    const { runner, calls } = createFakeRunner((args) => ({
      stdout: args[0] === 'rev-parse' ? 'new-sha\n' : '',
      stderr: '',
      code: 0,
    }))

    await expect(
      preparePullWorktree(CWD, '/tmp/pr-head', 42, 'old-sha', runner),
    ).rejects.toThrow(/PR head changed during review/)
    expect(calls).toHaveLength(2)
  })
})

describe('commitAll', () => {
  it('adds all files then commits with the given identity', async () => {
    const { runner, calls } = createFakeRunner()

    expect(await commitAll(CWD, 'polish: fix nits', runner, IDENTITY)).toEqual({
      committed: true,
    })
    expect(calls).toEqual([
      { args: ['add', '-A'], cwd: CWD },
      {
        args: [
          '-c',
          'user.name=TanStack AI Bot',
          '-c',
          'user.email=bot@tanstack.com',
          'commit',
          '-m',
          'polish: fix nits',
        ],
        cwd: CWD,
      },
    ])
  })

  it('returns committed false when git reports nothing to commit', async () => {
    const { runner } = createFakeRunner((args) => {
      if (args.includes('commit')) {
        return {
          stdout: 'On branch main\nnothing to commit, working tree clean\n',
          stderr: '',
          code: 1,
        }
      }
      return { stdout: '', stderr: '', code: 0 }
    })

    expect(await commitAll(CWD, 'nope', runner, IDENTITY)).toEqual({
      committed: false,
    })
  })

  it('throws when add exits non-zero', async () => {
    const { runner } = createFakeRunner((args) => {
      if (args[0] === 'add') {
        return { stdout: '', stderr: 'index.lock exists', code: 128 }
      }
      return { stdout: '', stderr: '', code: 0 }
    })

    await expect(commitAll(CWD, 'nope', runner, IDENTITY)).rejects.toThrow(
      /index.lock exists/,
    )
  })

  it('throws when commit fails for a reason other than an empty tree', async () => {
    const { runner } = createFakeRunner((args) => {
      if (args.includes('commit')) {
        return { stdout: '', stderr: 'hook declined', code: 1 }
      }
      return { stdout: '', stderr: '', code: 0 }
    })

    await expect(commitAll(CWD, 'nope', runner, IDENTITY)).rejects.toThrow(
      /hook declined/,
    )
  })
})

describe('pushHead', () => {
  it('pushes HEAD to the dest ref with --force-with-lease and no bare --force', async () => {
    const { runner, calls } = createFakeRunner()

    await pushHead(CWD, runner, {
      remoteUrl: REMOTE,
      ref: 'fix-nits',
      expectedSha: 'abc123',
    })

    const args = calls[0]?.args ?? []
    expect(calls).toEqual([
      {
        args: [
          'push',
          '--force-with-lease=refs/heads/fix-nits:abc123',
          REMOTE,
          'HEAD:fix-nits',
        ],
        cwd: CWD,
      },
    ])
    expect(args).toContain('--force-with-lease=refs/heads/fix-nits:abc123')
    expect(args).not.toContain('--force')
  })

  it('throws when push exits non-zero', async () => {
    const { runner } = createFakeRunner(() => ({
      stdout: '',
      stderr: `stale info for ${REMOTE}`,
      code: 1,
    }))

    await expect(
      pushHead(CWD, runner, {
        remoteUrl: REMOTE,
        ref: 'main',
        expectedSha: 'abc123',
      }),
    ).rejects.toThrow('stale info for <redacted remote>')
  })
})

describe('headRemoteUrl', () => {
  it('uses originRepo for a same-repo PR', () => {
    expect(
      headRemoteUrl({
        isFork: false,
        originRepo: ORIGIN,
        headRepo: FORK,
        token: TOKEN,
      }),
    ).toBe(`https://x-access-token:${TOKEN}@github.com/${ORIGIN}.git`)
  })

  it('uses headRepo for a fork PR', () => {
    expect(
      headRemoteUrl({
        isFork: true,
        originRepo: ORIGIN,
        headRepo: FORK,
        token: TOKEN,
      }),
    ).toBe(`https://x-access-token:${TOKEN}@github.com/${FORK}.git`)
  })
})
