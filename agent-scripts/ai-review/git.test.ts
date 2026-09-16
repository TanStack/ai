import { describe, expect, it } from 'vitest'
import {
  applyPatch,
  commitAll,
  headRemoteUrl,
  preparePullWorktree,
  pushHead,
} from './git'
import type { GitRunner } from './git'

type GitResult = { stdout: string; stderr: string; code: number }

const CWD = '/tmp/review'
const IDENTITY = { name: 'TanStack AI Bot', email: 'bot@tanstack.com' }
const TOKEN = 'ghs_abc'
const ORIGIN = 'TanStack/ai'
const FORK = 'alice/ai'
const REMOTE = `https://x-access-token:tok@github.com/${ORIGIN}.git`

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
