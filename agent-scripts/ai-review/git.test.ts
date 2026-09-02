import { describe, expect, it } from 'vitest'
import { commitAll, headRemoteUrl, pushHead, type GitRunner } from './git'

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
  const calls: Array<{ args: Array<string>; cwd: string }> = []
  const runner: GitRunner = async (args, cwd) => {
    calls.push({ args: [...args], cwd })
    if (impl) {
      return impl(args, cwd)
    }
    return { stdout: '', stderr: '', code: 0 }
  }
  return { runner, calls }
}

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

    await pushHead(CWD, runner, { remoteUrl: REMOTE, ref: 'heads/fix-nits' })

    const args = calls[0]?.args ?? []
    expect(calls).toEqual([
      {
        args: ['push', '--force-with-lease', REMOTE, 'HEAD:heads/fix-nits'],
        cwd: CWD,
      },
    ])
    expect(args).toContain('--force-with-lease')
    expect(args).not.toContain('--force')
  })

  it('throws when push exits non-zero', async () => {
    const { runner } = createFakeRunner(() => ({
      stdout: '',
      stderr: 'stale info',
      code: 1,
    }))

    await expect(
      pushHead(CWD, runner, { remoteUrl: REMOTE, ref: 'main' }),
    ).rejects.toThrow(/stale info/)
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
