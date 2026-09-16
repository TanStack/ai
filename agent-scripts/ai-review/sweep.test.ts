import { describe, expect, it } from 'vitest'
import { config } from '../../scripts/maintainer/fixtures.ts'
import {
  DEFAULT_SWEEP_LIMIT,
  addPullWorktree,
  listOpenPulls,
  parseSweepLimit,
  removePullWorktree,
  selectSweepPulls,
} from './sweep'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import type { GitRunner } from './git.ts'

const MACHINE = 'tanstack-ai-bot'
const REPO = 'TanStack/ai'

function pull(
  overrides: Partial<{
    number: number
    headSha: string
    isDraft: boolean
    authorLogin: string | null
    alreadyReviewedSha: string | null
  }> = {},
) {
  return {
    number: 1,
    headSha: 'sha1',
    isDraft: false,
    authorLogin: 'alice',
    alreadyReviewedSha: null,
    ...overrides,
  }
}

function select(
  pulls: Array<ReturnType<typeof pull>>,
  limit = DEFAULT_SWEEP_LIMIT,
) {
  return selectSweepPulls({
    pulls,
    machineUserLogin: MACHINE,
    config,
    limit,
  })
}

function listClient(payload: unknown): GitHubClient {
  return {
    graphql: () => {
      throw new Error('not used')
    },
    rest: () => Promise.resolve(payload),
  }
}

function recordingRunner(code = 0) {
  const calls: Array<{ args: Array<string>; cwd: string }> = []
  const runner: GitRunner = (args, cwd) => {
    calls.push({ args, cwd })
    return Promise.resolve({ stdout: '', stderr: 'boom', code })
  }
  return { calls, runner }
}

describe('listOpenPulls', () => {
  it('reads number, head SHA, draft, and author', async () => {
    const pulls = await listOpenPulls(
      listClient([
        {
          number: 7,
          draft: false,
          head: { sha: 'aaa' },
          user: { login: 'alice' },
        },
      ]),
      REPO,
    )

    expect(pulls).toEqual([
      { number: 7, headSha: 'aaa', isDraft: false, authorLogin: 'alice' },
    ])
  })

  it('reads a null author as null', async () => {
    const pulls = await listOpenPulls(
      listClient([
        { number: 7, draft: true, head: { sha: 'aaa' }, user: null },
      ]),
      REPO,
    )

    expect(pulls[0]?.authorLogin).toBeNull()
  })

  it('throws when a pull is missing head.sha', async () => {
    await expect(
      listOpenPulls(listClient([{ number: 7, draft: false }]), REPO),
    ).rejects.toThrow('head.sha')
  })
})

describe('selectSweepPulls', () => {
  it('selects an open human PR with no review at this SHA', () => {
    expect(select([pull()])).toEqual({
      selected: [pull()],
      skipped: [],
    })
  })

  it('skips drafts, bots, maintainers, and reviewed SHAs with a reason', () => {
    const result = select([
      pull({ number: 1, isDraft: true }),
      pull({ number: 2, authorLogin: 'renovate' }),
      pull({ number: 3, authorLogin: 'alem' }),
      pull({ number: 4, alreadyReviewedSha: 'sha1' }),
    ])

    expect(result.selected).toEqual([])
    expect(result.skipped).toEqual([
      { number: 1, reason: 'draft' },
      { number: 2, reason: 'bot-author' },
      { number: 3, reason: 'maintainer-author' },
      { number: 4, reason: 'same-sha' },
    ])
  })

  it('reviews a PR again once its head SHA moves', () => {
    const result = select([pull({ alreadyReviewedSha: 'older' })])

    expect(result.selected).toHaveLength(1)
  })

  it('defers everything past the limit to the next run', () => {
    const result = select(
      [pull({ number: 1 }), pull({ number: 2 }), pull({ number: 3 })],
      2,
    )

    expect(result.selected.map((item) => item.number)).toEqual([1, 2])
    expect(result.skipped).toEqual([{ number: 3, reason: 'over-limit' }])
  })
})

describe('parseSweepLimit', () => {
  it('falls back to the default for missing or unusable values', () => {
    expect(parseSweepLimit(undefined)).toBe(DEFAULT_SWEEP_LIMIT)
    expect(parseSweepLimit('')).toBe(DEFAULT_SWEEP_LIMIT)
    expect(parseSweepLimit('0')).toBe(DEFAULT_SWEEP_LIMIT)
    expect(parseSweepLimit('two')).toBe(DEFAULT_SWEEP_LIMIT)
  })

  it('reads a positive integer', () => {
    expect(parseSweepLimit('5')).toBe(5)
  })
})

describe('addPullWorktree', () => {
  it('fetches the PR head into its own branch and worktree', async () => {
    const { calls, runner } = recordingRunner()

    const branch = await addPullWorktree({
      repoRoot: '/repo',
      worktreePath: '/repo/.pr-12',
      prNumber: 12,
      runner,
    })

    expect(branch).toBe('ai-review-pr-12')
    expect(calls).toEqual([
      {
        args: ['fetch', '--force', 'origin', 'pull/12/head:ai-review-pr-12'],
        cwd: '/repo',
      },
      {
        args: ['worktree', 'add', '/repo/.pr-12', 'ai-review-pr-12'],
        cwd: '/repo',
      },
    ])
  })

  it('throws when git fails', async () => {
    const { runner } = recordingRunner(1)

    await expect(
      addPullWorktree({
        repoRoot: '/repo',
        worktreePath: '/repo/.pr-12',
        prNumber: 12,
        runner,
      }),
    ).rejects.toThrow('exited 1: boom')
  })
})

describe('removePullWorktree', () => {
  it('removes the worktree and the fetched branch', async () => {
    const { calls, runner } = recordingRunner()

    await removePullWorktree({
      repoRoot: '/repo',
      worktreePath: '/repo/.pr-12',
      branch: 'ai-review-pr-12',
      runner,
    })

    expect(calls.map((call) => call.args)).toEqual([
      ['worktree', 'remove', '--force', '/repo/.pr-12'],
      ['branch', '-D', 'ai-review-pr-12'],
    ])
  })

  it('does not throw when cleanup fails', async () => {
    const runner: GitRunner = () => Promise.reject(new Error('spawn failed'))

    await expect(
      removePullWorktree({
        repoRoot: '/repo',
        worktreePath: '/repo/.pr-12',
        branch: 'ai-review-pr-12',
        runner,
      }),
    ).resolves.toBeUndefined()
  })
})
