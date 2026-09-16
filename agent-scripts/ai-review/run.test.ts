import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import { config } from '../../scripts/maintainer/fixtures.ts'
import { COMMENT_MARKER } from './comments.ts'
import type { GitRunner } from './git.ts'
import { runReviewJob } from './run.ts'

const REPO = 'TanStack/ai'
const NUMBER = 42
const SHA = 'a'.repeat(40)
const POLISH_SHA = 'c'.repeat(40)
const BASE_SHA = 'b'.repeat(40)
const MACHINE = 'tanstack-ai-bot'
const TOKEN = 'ghs_test'
const WORKTREE = '/tmp/review'
const HEAD_REF = 'fix-chat'
const HEAD_REPO = 'alice/ai'
const AUTOMATED =
  'This comment is automated by a Grok agent. It is not a maintainer review.'
const GENERATED_DIFF =
  'diff --git a/src/chat.ts b/src/chat.ts\n--- a/src/chat.ts\n+++ b/src/chat.ts\n@@ -1 +1 @@\n-old\n+new\n'

type StoredComment = { id: number; issueNumber: number; body: string }
type GitResult = { stdout: string; stderr: string; code: number }

function samplePull(
  overrides: {
    draft?: boolean
    maintainer_can_modify?: boolean
    login?: string
    labels?: Array<string>
    baseRef?: string
  } = {},
) {
  return {
    number: NUMBER,
    title: 'Fix chat crash',
    body: 'Handle empty messages.',
    html_url: 'https://github.com/TanStack/ai/pull/42',
    draft: overrides.draft ?? false,
    user: { login: overrides.login ?? 'alice' },
    base: { sha: BASE_SHA, ref: overrides.baseRef ?? 'main' },
    head: {
      sha: SHA,
      ref: HEAD_REF,
      repo: {
        full_name: HEAD_REPO,
        owner: { login: 'alice' },
      },
      user: { login: 'alice' },
    },
    maintainer_can_modify: overrides.maintainer_can_modify ?? false,
    labels: (overrides.labels ?? ['bug']).map((name) => ({ name })),
  }
}

function sampleFiles() {
  return [
    {
      filename: 'src/chat.ts',
      status: 'modified',
      patch: '@@ -1,2 +1,3 @@\n line',
    },
  ]
}

function readCommentBody(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'body' in body &&
    typeof body.body === 'string'
  ) {
    return body.body
  }
  throw new Error('expected { body: string }')
}

function readLabelName(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'name' in body &&
    typeof body.name === 'string'
  ) {
    return body.name
  }
  throw new Error('label body is missing name')
}

function readIssueLabelNames(body: unknown) {
  if (
    typeof body === 'object' &&
    body !== null &&
    'labels' in body &&
    Array.isArray(body.labels)
  ) {
    const names: Array<string> = []
    for (const label of body.labels) {
      if (typeof label !== 'string') {
        throw new Error('labels must be strings')
      }
      names.push(label)
    }
    return names
  }
  throw new Error('issue label body is missing labels')
}

function createFakeGitHub(
  options: {
    pull?: ReturnType<typeof samplePull>
    files?: ReturnType<typeof sampleFiles>
    waitingRunIds?: Array<number>
    approveError?: string
    initialIssueLabels?: Array<string>
  } = {},
) {
  const pull = options.pull ?? samplePull()
  const files = options.files ?? sampleFiles()
  const comments: Array<StoredComment> = []
  let nextId = 1
  const issueLabels = new Set(options.initialIssueLabels ?? [])
  const repoLabels = new Set<string>()
  const approvedRuns: Array<number> = []
  const waitingRunIds = options.waitingRunIds ?? []
  const pullPath = `/repos/${REPO}/pulls/${NUMBER}`
  const filesPath = `/repos/${REPO}/pulls/${NUMBER}/files`
  const repoLabelsPath = `/repos/${REPO}/labels`
  const issueLabelsPath = `/repos/${REPO}/issues/${NUMBER}/labels`

  const client = {
    graphql() {
      throw new Error('not used')
    },
    async rest(method, path, body) {
      if (method === 'GET' && path === pullPath) return pull
      if (method === 'GET' && path.startsWith(`/repos/${REPO}/actions/runs?`)) {
        const params = new URL(`https://api.github.com${path}`).searchParams
        const ids =
          params.get('status') === 'waiting' &&
          params.get('head_sha') === pull.head.sha
            ? waitingRunIds
            : []
        return {
          workflow_runs: ids.map((id) => ({
            id,
            head_sha: pull.head.sha,
            status: params.get('status'),
          })),
        }
      }
      const approveMatch =
        /^\/repos\/TanStack\/ai\/actions\/runs\/(\d+)\/approve$/.exec(path)
      if (method === 'POST' && approveMatch?.[1] !== undefined) {
        if (options.approveError !== undefined) {
          throw new Error(
            `GitHub REST POST ${path} → HTTP 403: ${options.approveError}`,
          )
        }
        approvedRuns.push(Number(approveMatch[1]))
        return null
      }
      if (method === 'GET' && path.startsWith(`${filesPath}?`)) {
        const params = new URL(`https://api.github.com${path}`).searchParams
        const page = Number(params.get('page') ?? '1')
        const perPage = Number(params.get('per_page') ?? '100')
        const start = (page - 1) * perPage
        return files.slice(start, start + perPage)
      }
      if (method === 'GET' && path.includes('/git/trees/')) {
        return {
          truncated: false,
          tree: files.map((file) => ({
            path: file.filename,
            mode: '100644',
            type: 'blob',
          })),
        }
      }

      const listMatch = /^\/repos\/[^/]+\/[^/]+\/issues\/(\d+)\/comments$/.exec(
        path,
      )
      const patchMatch =
        /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/(\d+)$/.exec(path)

      if (method === 'GET' && listMatch?.[1] !== undefined) {
        const issueNumber = Number(listMatch[1])
        return comments.filter((comment) => comment.issueNumber === issueNumber)
      }

      if (method === 'POST' && listMatch?.[1] !== undefined) {
        const issueNumber = Number(listMatch[1])
        const comment = {
          id: nextId,
          issueNumber,
          body: readCommentBody(body),
        }
        nextId += 1
        comments.push(comment)
        return comment
      }

      if (method === 'PATCH' && patchMatch?.[1] !== undefined) {
        const id = Number(patchMatch[1])
        const existing = comments.find((comment) => comment.id === id)
        if (!existing) {
          throw new Error(`comment ${id} not found`)
        }
        existing.body = readCommentBody(body)
        return existing
      }

      if (method === 'POST' && path === repoLabelsPath) {
        const name = readLabelName(body)
        if (repoLabels.has(name)) {
          throw new Error(`GitHub REST POST ${path} → HTTP 422: already exists`)
        }
        repoLabels.add(name)
        return null
      }

      if (method === 'POST' && path === issueLabelsPath) {
        const names = readIssueLabelNames(body)
        for (const name of names) issueLabels.add(name)
        return null
      }

      if (method === 'DELETE' && path.startsWith(`${issueLabelsPath}/`)) {
        const name = decodeURIComponent(
          path.slice(`${issueLabelsPath}/`.length),
        )
        if (!issueLabels.has(name)) {
          throw new Error(`GitHub REST DELETE ${path} → HTTP 404: Not Found`)
        }
        issueLabels.delete(name)
        return null
      }

      throw new Error(`unexpected ${method} ${path}`)
    },
  } satisfies GitHubClient

  return { client, comments, issueLabels, approvedRuns }
}

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
    return {
      stdout: args[0] === 'rev-parse' ? POLISH_SHA : '',
      stderr: '',
      code: 0,
    }
  }
  return { runner, calls }
}

const BUG = {
  severity: 'bug' as const,
  file: 'src/chat.ts',
  line: 40,
  description: 'null crash on empty messages',
  suggestion: 'return early when messages is empty',
}

const NIT = {
  severity: 'nit' as const,
  file: 'src/chat.ts',
  line: 12,
  description: 'extra blank line',
  suggestion: 'delete the blank line',
}

function unusedReview() {
  return Promise.reject(new Error('review should not run'))
}

async function readyReview() {
  return { verdict: 'ready' as const, issues: [] }
}

async function polishReview() {
  return {
    verdict: 'polish' as const,
    issues: [BUG, NIT],
    generatedDiff: GENERATED_DIFF,
  }
}

async function rejectReview() {
  return { verdict: 'reject' as const, issues: [] }
}

async function unsafePolishReview() {
  return {
    verdict: 'polish' as const,
    issues: [BUG],
    generatedDiff:
      'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml\n@@ -1 +1 @@\n-old\n+new\n',
  }
}

function pullRequestEvent() {
  return { pull_request: { number: NUMBER } }
}

async function runJob(options: {
  eventName?: string
  event?: unknown
  pull?: ReturnType<typeof samplePull>
  review?: Parameters<typeof runReviewJob>[0]['review']
  alreadyReviewedSha?: string | null
  headCommitAuthorLogin?: string | null
  gitImpl?: (args: Array<string>, cwd: string) => GitResult
  files?: ReturnType<typeof sampleFiles>
  waitingRunIds?: Array<number>
  approveError?: string
  initialIssueLabels?: Array<string>
}) {
  const pull = options.pull ?? samplePull()
  const github = createFakeGitHub({
    pull,
    files: options.files,
    waitingRunIds: options.waitingRunIds,
    approveError: options.approveError,
    initialIssueLabels: options.initialIssueLabels,
  })
  const git = createFakeRunner(options.gitImpl)
  const result = await runReviewJob({
    client: github.client,
    repo: REPO,
    token: TOKEN,
    config,
    eventName: options.eventName ?? 'pull_request',
    event: options.event ?? pullRequestEvent(),
    worktreeRoot: WORKTREE,
    machineUserLogin: MACHINE,
    gitRunner: async (args, cwd, input) => {
      const gitResult = await git.runner(args, cwd, input)
      if (args[0] === 'push' && gitResult.code === 0) pull.head.sha = POLISH_SHA
      return gitResult
    },
    review: options.review ?? unusedReview,
    prepareWorktree: async () => {},
    alreadyReviewedSha: options.alreadyReviewedSha ?? null,
    headCommitAuthorLogin: options.headCommitAuthorLogin ?? 'alice',
  })
  return {
    result,
    comments: github.comments,
    issueLabels: github.issueLabels,
    gitCalls: git.calls,
    approvedRuns: github.approvedRuns,
  }
}

describe('runReviewJob', () => {
  it.each(['input', 'generated', 'verdict'])(
    'removes stale security labels when the %s audit fails',
    async (stage) => {
      const { result, issueLabels, approvedRuns, gitCalls } = await runJob({
        initialIssueLabels: ['secure', 'ai-ready', 'bug', 'ready-to-merge'],
        waitingRunIds: [101],
        files:
          stage === 'input'
            ? [
                {
                  filename: '.github/workflows/ci.yml',
                  status: 'modified',
                  patch: '@@ -1 +1 @@\n-old\n+new\n',
                },
              ]
            : sampleFiles(),
        review:
          stage === 'input'
            ? unusedReview
            : stage === 'generated'
              ? unsafePolishReview
              : async () => ({
                  ...(await readyReview()),
                  generatedDiff: GENERATED_DIFF,
                }),
      })

      expect(result).toMatchObject({
        skipped: true,
        reason: 'security-blocked',
      })
      expect([...issueLabels].sort()).toEqual(['bug', 'ready-to-merge'])
      expect(approvedRuns).toEqual([])
      expect(gitCalls).toEqual([])
    },
  )

  it('does not publish readiness for a head changed during review', async () => {
    const pull = samplePull()
    const { result, issueLabels, approvedRuns, comments } = await runJob({
      pull,
      initialIssueLabels: ['secure', 'ai-ready', 'bug'],
      waitingRunIds: [101],
      review: async () => {
        pull.head.sha = 'd'.repeat(40)
        return readyReview()
      },
    })

    expect(result).toMatchObject({ skipped: true, reason: 'head-changed' })
    expect([...issueLabels]).toEqual(['bug'])
    expect(approvedRuns).toEqual([])
    expect(comments).toEqual([])
  })

  it('preserves the verdict when the same SHA is skipped', async () => {
    const { result, issueLabels } = await runJob({
      alreadyReviewedSha: SHA,
      initialIssueLabels: ['secure', 'ai-ready', 'bug'],
    })

    expect(result).toEqual({ skipped: true, reason: 'same-sha' })
    expect([...issueLabels]).toEqual(['secure', 'ai-ready', 'bug'])
  })

  it.each([SHA, 'd'.repeat(40)])(
    'clears draft readiness with reviewed SHA %s',
    async (alreadyReviewedSha) => {
      const { result, issueLabels } = await runJob({
        pull: samplePull({ draft: true }),
        alreadyReviewedSha,
        initialIssueLabels: ['secure', 'ai-ready', 'bug'],
      })

      expect(result).toEqual({ skipped: true, reason: 'draft' })
      expect([...issueLabels]).toEqual(['bug'])
    },
  )

  it('skips a pull request that does not target main', async () => {
    const { result, comments, gitCalls } = await runJob({
      pull: samplePull({ baseRef: 'next' }),
    })

    expect(result).toEqual({ skipped: true, reason: 'not-main' })
    expect(comments).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('skips a draft auto run and does not post a comment', async () => {
    const { result, comments, gitCalls } = await runJob({
      pull: samplePull({ draft: true }),
    })

    expect(result).toEqual({ skipped: true, reason: 'draft' })
    expect(comments).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('skips an auto run from a roster maintainer and does not post a comment', async () => {
    const { result, comments, gitCalls } = await runJob({
      pull: samplePull({ login: 'alem' }),
    })

    expect(result).toEqual({ skipped: true, reason: 'maintainer-author' })
    expect(comments).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('runs when the ai-review label is added to a maintainer PR', async () => {
    const { result, comments } = await runJob({
      pull: samplePull({ login: 'alem' }),
      event: {
        action: 'labeled',
        label: { name: 'ai-review' },
        sender: { login: 'alem' },
        pull_request: { number: NUMBER },
      },
      review: readyReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'ready', issues: [] },
      label: 'ai-ready',
      pushLanded: false,
    })
    expect(comments).toHaveLength(1)
  })

  it('runs when the ai-review label is added via pull_request_target', async () => {
    const { result, comments } = await runJob({
      eventName: 'pull_request_target',
      pull: samplePull({ login: 'alem' }),
      event: {
        action: 'labeled',
        label: { name: 'ai-review' },
        sender: { login: 'alem' },
        pull_request: { number: NUMBER },
      },
      review: readyReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'ready', issues: [] },
      label: 'ai-ready',
      pushLanded: false,
    })
    expect(comments).toHaveLength(1)
  })

  function workflowRunEvent() {
    return {
      action: 'completed',
      workflow_run: {
        conclusion: 'success',
        pull_requests: [{ number: NUMBER }],
      },
    }
  }

  it('runs a workflow_run signal in auto mode', async () => {
    const { result, comments } = await runJob({
      eventName: 'workflow_run',
      event: workflowRunEvent(),
      review: readyReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'ready', issues: [] },
      label: 'ai-ready',
      pushLanded: false,
    })
    expect(comments).toHaveLength(1)
  })

  it('runs a workflow_run as manual when the ai-review label is on the PR', async () => {
    const { result, comments } = await runJob({
      eventName: 'workflow_run',
      pull: samplePull({ login: 'alem', labels: ['ai-review'] }),
      event: workflowRunEvent(),
      review: readyReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'ready', issues: [] },
      label: 'ai-ready',
      pushLanded: false,
    })
    expect(comments).toHaveLength(1)
  })

  it('skips a workflow_run for a maintainer PR without the ai-review label', async () => {
    const { result, comments, gitCalls } = await runJob({
      eventName: 'workflow_run',
      pull: samplePull({ login: 'alem' }),
      event: workflowRunEvent(),
    })

    expect(result).toEqual({ skipped: true, reason: 'maintainer-author' })
    expect(comments).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('skips a labeled pull_request that is not the ai-review label', async () => {
    const { result, comments, gitCalls } = await runJob({
      event: {
        action: 'labeled',
        label: { name: 'bug' },
        pull_request: { number: NUMBER },
      },
    })

    expect(result).toEqual({ skipped: true, reason: 'not-label' })
    expect(comments).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('skips an issue_comment that is not the /ai-review command', async () => {
    const { result, comments, gitCalls } = await runJob({
      eventName: 'issue_comment',
      event: {
        issue: {
          number: NUMBER,
          pull_request: {
            url: 'https://api.github.com/repos/TanStack/ai/pulls/42',
          },
        },
        comment: {
          body: 'please review this',
          user: { login: 'alem' },
        },
      },
    })

    expect(result).toEqual({ skipped: true, reason: 'not-command' })
    expect(comments).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('runs a maintainer /ai-review comment in manual mode', async () => {
    const { result, comments } = await runJob({
      eventName: 'issue_comment',
      event: {
        issue: {
          number: NUMBER,
          pull_request: {
            url: 'https://api.github.com/repos/TanStack/ai/pulls/42',
          },
        },
        comment: {
          body: '/ai-review',
          user: { login: 'alem' },
        },
      },
      review: readyReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'ready', issues: [] },
      label: 'ai-ready',
      pushLanded: false,
    })
    expect(comments).toHaveLength(1)
  })

  it('skips an issue_comment from a non-maintainer', async () => {
    const { result, comments, gitCalls } = await runJob({
      eventName: 'issue_comment',
      event: {
        issue: {
          number: NUMBER,
          pull_request: {
            url: 'https://api.github.com/repos/TanStack/ai/pulls/42',
          },
        },
        comment: {
          body: '/ai-review',
          user: { login: 'stranger' },
        },
      },
    })

    expect(result).toEqual({ skipped: true, reason: 'not-maintainer' })
    expect(comments).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('upserts a ready comment, sets ai-ready, and does not push', async () => {
    const { result, comments, issueLabels, gitCalls } = await runJob({
      review: readyReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'ready', issues: [] },
      label: 'ai-ready',
      pushLanded: false,
    })
    expect(comments).toHaveLength(1)
    expect(comments[0]?.body.startsWith(AUTOMATED)).toBe(true)
    expect(comments[0]?.body).toContain(COMMENT_MARKER)
    expect(comments[0]?.body).toContain('**Verdict:** ready')
    expect(comments[0]?.body).toContain(`**Head SHA:** ${SHA}`)
    expect(comments[0]?.body).toContain('**Label:** `ai-ready`')
    expect(comments[0]?.body).toContain('Did not push.')
    expect([...issueLabels]).toEqual(['ai-ready', 'secure'])
    expect(gitCalls).toEqual([])
  })

  it('pushes polish with --force-with-lease when maintainer edits are on', async () => {
    const { result, comments, issueLabels, gitCalls, approvedRuns } =
      await runJob({
        pull: samplePull({ maintainer_can_modify: true }),
        review: polishReview,
        waitingRunIds: [101],
      })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'polish', issues: [BUG, NIT] },
      label: 'ai-ready',
      pushLanded: true,
    })
    expect(comments[0]?.body).toContain('**Verdict:** polish')
    expect(comments[0]?.body).toContain(`**Head SHA:** ${POLISH_SHA}`)
    expect(approvedRuns).toEqual([101])
    expect(comments[0]?.body).toContain(
      '- [bug] src/chat.ts:40 null crash on empty messages',
    )
    expect(comments[0]?.body).toContain(
      '- [nit] src/chat.ts:12 extra blank line',
    )
    expect(comments[0]?.body).toContain(
      'Pushed polish commit to the PR branch.',
    )
    expect(comments[0]?.body).toContain('**Label:** `ai-ready`')
    expect([...issueLabels]).toEqual(['ai-ready', 'secure'])
    expect(gitCalls).toEqual([
      {
        args: ['apply', '--check', '--whitespace=error-all', '-'],
        cwd: WORKTREE,
        input: GENERATED_DIFF,
      },
      {
        args: ['apply', '--whitespace=error-all', '-'],
        cwd: WORKTREE,
        input: GENERATED_DIFF,
      },
      { args: ['add', '-A'], cwd: WORKTREE },
      {
        args: [
          '-c',
          `user.name=${MACHINE}`,
          '-c',
          `user.email=${MACHINE}@users.noreply.github.com`,
          'commit',
          '-m',
          'ai-review: apply review polish for #42',
        ],
        cwd: WORKTREE,
      },
      {
        args: ['rev-parse', 'HEAD'],
        cwd: WORKTREE,
      },
      {
        args: [
          'push',
          `--force-with-lease=refs/heads/${HEAD_REF}:${SHA}`,
          `https://x-access-token:${TOKEN}@github.com/${HEAD_REPO}.git`,
          `HEAD:${HEAD_REF}`,
        ],
        cwd: WORKTREE,
      },
    ])
    expect(gitCalls[5]?.args).toContain(
      `--force-with-lease=refs/heads/${HEAD_REF}:${SHA}`,
    )
    expect(gitCalls[5]?.args).not.toContain('--force')
  })

  it('does not apply an unsafe generated diff', async () => {
    const { result, comments, issueLabels, gitCalls } = await runJob({
      pull: samplePull({ maintainer_can_modify: true }),
      review: unsafePolishReview,
    })

    expect(result).toEqual({
      skipped: true,
      reason: 'security-blocked',
      security: {
        ok: false,
        reasons: ['.github/workflows/ci.yml: changes a workflow'],
      },
    })
    expect(comments).toEqual([])
    expect([...issueLabels]).toEqual([])
    expect(gitCalls).toEqual([])
  })

  it('does not push polish when maintainer edits are off and sets ai-needs-work', async () => {
    const { result, comments, issueLabels, gitCalls } = await runJob({
      pull: samplePull({ maintainer_can_modify: false }),
      review: polishReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'polish', issues: [BUG, NIT] },
      label: 'ai-needs-work',
      pushLanded: false,
    })
    expect(comments[0]?.body).toContain('**Label:** `ai-needs-work`')
    expect(comments[0]?.body).toContain(
      'Did not push: fork has maintainer edits off.',
    )
    expect([...issueLabels]).toEqual(['ai-needs-work'])
    expect(gitCalls).toEqual([])
  })

  it('sets ai-rejected on reject and does not push', async () => {
    const { result, comments, issueLabels, gitCalls } = await runJob({
      review: rejectReview,
    })

    expect(result).toEqual({
      skipped: false,
      verdict: { verdict: 'reject', issues: [] },
      label: 'ai-rejected',
      pushLanded: false,
    })
    expect(comments[0]?.body).toContain('**Verdict:** reject')
    expect(comments[0]?.body).toContain('**Label:** `ai-rejected`')
    expect([...issueLabels]).toEqual(['ai-rejected'])
    expect(comments[0]?.body).toContain('Did not mark secure.')
    expect(gitCalls).toEqual([])
  })

  it('adds secure and approves waiting workflows when ready and clean', async () => {
    const { comments, issueLabels, approvedRuns } = await runJob({
      review: readyReview,
      waitingRunIds: [101, 202],
    })

    expect([...issueLabels]).toEqual(['ai-ready', 'secure'])
    expect(approvedRuns).toEqual([101, 202])
    expect(comments[0]?.body).toContain('Added label `secure`')
    expect(comments[0]?.body).toContain('Approved 2 waiting workflow runs.')
  })

  it('stops before review when the security audit fails', async () => {
    const { result, comments, issueLabels, approvedRuns } = await runJob({
      review: readyReview,
      waitingRunIds: [101],
      files: [
        {
          filename: '.github/workflows/ci.yml',
          status: 'modified',
          patch:
            '@@ -1,2 +1,4 @@\n on:\n+  pull_request_target:\n+    types: [opened]\n',
        },
      ],
    })

    expect(result).toEqual({
      skipped: true,
      reason: 'security-blocked',
      security: {
        ok: false,
        reasons: [
          '.github/workflows/ci.yml: changes a workflow',
          '.github/workflows/ci.yml: adds pull_request_target',
        ],
      },
    })
    expect([...issueLabels]).toEqual([])
    expect(approvedRuns).toEqual([])
    expect(comments).toEqual([])
  })

  it('skips a labeled ai-review event from a non-maintainer', async () => {
    const { result, comments, approvedRuns } = await runJob({
      event: {
        action: 'labeled',
        label: { name: 'ai-review' },
        sender: { login: 'stranger' },
        pull_request: { number: NUMBER },
      },
      waitingRunIds: [101],
    })

    expect(result).toEqual({ skipped: true, reason: 'not-maintainer' })
    expect(comments).toEqual([])
    expect(approvedRuns).toEqual([])
  })

  it('does not leave secure when workflow approval fails', async () => {
    const { comments, issueLabels, approvedRuns } = await runJob({
      review: readyReview,
      waitingRunIds: [101],
      approveError: 'Resource not accessible by personal access token',
    })

    expect([...issueLabels]).toEqual(['ai-ready'])
    expect(approvedRuns).toEqual([])
    expect(comments[0]?.body).toContain('Did not add label `secure`')
    expect(comments[0]?.body).toContain('Could not approve workflows')
  })
})
