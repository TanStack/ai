import { describe, expect, it } from 'vitest'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import { config } from '../../scripts/maintainer/fixtures.ts'
import { COMMENT_MARKER } from './comments.ts'
import type { GitRunner } from './git.ts'
import type { ReviewedPull } from './results.ts'
import { publishPull, reviewPull } from './run.ts'

const REPO = 'TanStack/ai'
const NUMBER = 42
const SHA = 'abc123def456'
const MACHINE = 'tanstack-ai-bot'
const TOKEN = 'ghs_test'
const WORKTREE = '/tmp/review'
const HEAD_REF = 'fix-chat'
const HEAD_REPO = 'alice/ai'
const AUTOMATED =
  'This comment is automated by a Grok agent. It is not a maintainer review.'

type StoredComment = { id: number; issueNumber: number; body: string }
type GitResult = { stdout: string; stderr: string; code: number }

function samplePull(
  overrides: {
    draft?: boolean
    maintainer_can_modify?: boolean
    login?: string
  } = {},
) {
  return {
    number: NUMBER,
    title: 'Fix chat crash',
    body: 'Handle empty messages.',
    html_url: 'https://github.com/TanStack/ai/pull/42',
    draft: overrides.draft ?? false,
    user: { login: overrides.login ?? 'alice' },
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
    labels: [{ name: 'bug' }],
  }
}

function sampleFiles() {
  return [
    {
      filename: 'src/chat.ts',
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
  } = {},
) {
  const pull = options.pull ?? samplePull()
  const files = options.files ?? sampleFiles()
  const comments: Array<StoredComment> = []
  let nextId = 1
  const issueLabels = new Set<string>()
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
          params.get('status') === 'waiting' && params.get('head_sha') === SHA
            ? waitingRunIds
            : []
        return {
          workflow_runs: ids.map((id) => ({
            id,
            head_sha: SHA,
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
  checkedOutSha: string = SHA,
) {
  const calls: Array<{ args: Array<string>; cwd: string }> = []
  const runner: GitRunner = async (args, cwd) => {
    calls.push({ args: [...args], cwd })
    // `reviewPull` pins the scan to the checked-out commit before it does
    // anything else, so every path answers rev-parse.
    if (args[0] === 'rev-parse') {
      return { stdout: `${checkedOutSha}\n`, stderr: '', code: 0 }
    }
    if (impl) {
      return impl(args, cwd)
    }
    return { stdout: '', stderr: '', code: 0 }
  }
  return { runner, calls }
}

const REV_PARSE = { args: ['rev-parse', 'HEAD'], cwd: WORKTREE }

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

async function unusedReview() {
  throw new Error('review should not run')
}

async function readyReview() {
  return { verdict: 'ready' as const, issues: [] }
}

async function polishReview() {
  return { verdict: 'polish' as const, issues: [BUG, NIT] }
}

async function rejectReview() {
  return { verdict: 'reject' as const, issues: [] }
}

function pullRequestEvent() {
  return { pull_request: { number: NUMBER } }
}

const PATCH =
  'diff --git a/src/chat.ts b/src/chat.ts\n@@ -1 +1 @@\n-old\n+new\n'

async function runReview(options: {
  eventName?: string
  event?: unknown
  pull?: ReturnType<typeof samplePull>
  review?:
    | typeof unusedReview
    | typeof readyReview
    | typeof polishReview
    | typeof rejectReview
  alreadyReviewedSha?: string | null
  headCommitAuthorLogin?: string | null
  gitImpl?: (args: Array<string>, cwd: string) => GitResult
  files?: ReturnType<typeof sampleFiles>
  checkedOutSha?: string
}) {
  const github = createFakeGitHub({
    pull: options.pull,
    files: options.files,
  })
  const git = createFakeRunner(
    options.gitImpl ??
      ((args) =>
        args[0] === 'diff'
          ? { stdout: PATCH, stderr: '', code: 0 }
          : { stdout: '', stderr: '', code: 0 }),
    options.checkedOutSha,
  )
  const outcome = await reviewPull({
    client: github.client,
    repo: REPO,
    config,
    eventName: options.eventName ?? 'pull_request',
    event: options.event ?? pullRequestEvent(),
    worktreeRoot: WORKTREE,
    machineUserLogin: MACHINE,
    gitRunner: git.runner,
    review: options.review ?? unusedReview,
    alreadyReviewedSha: options.alreadyReviewedSha ?? null,
    headCommitAuthorLogin: options.headCommitAuthorLogin ?? 'alice',
  })
  return {
    outcome,
    comments: github.comments,
    issueLabels: github.issueLabels,
    approvedRuns: github.approvedRuns,
    gitCalls: git.calls,
  }
}

async function runPublish(options: {
  pull?: ReturnType<typeof samplePull>
  files?: ReturnType<typeof sampleFiles>
  waitingRunIds?: Array<number>
  approveError?: string
  reviewed?: ReviewedPull | null
  gitImpl?: (args: Array<string>, cwd: string) => GitResult
  worktreeRoot?: string | null
}) {
  const github = createFakeGitHub({
    pull: options.pull,
    files: options.files,
    waitingRunIds: options.waitingRunIds,
    approveError: options.approveError,
  })
  const git = createFakeRunner(options.gitImpl)
  const reviewed = options.reviewed === undefined ? null : options.reviewed
  const needsWorktree =
    reviewed !== null &&
    reviewed.verdict.verdict === 'polish' &&
    reviewed.patch.length > 0
  const outcome = await publishPull({
    client: github.client,
    repo: REPO,
    token: TOKEN,
    prNumber: NUMBER,
    machineUserLogin: MACHINE,
    gitRunner: git.runner,
    worktreeRoot:
      options.worktreeRoot === undefined
        ? needsWorktree
          ? WORKTREE
          : null
        : options.worktreeRoot,
    reviewed,
  })
  return {
    outcome,
    comments: github.comments,
    issueLabels: github.issueLabels,
    approvedRuns: github.approvedRuns,
    gitCalls: git.calls,
  }
}

function reviewedPolish(patch = PATCH): ReviewedPull {
  return {
    number: NUMBER,
    verdict: { verdict: 'polish', issues: [BUG, NIT] },
    patch,
  }
}

function reviewedReady(): ReviewedPull {
  return {
    number: NUMBER,
    verdict: { verdict: 'ready', issues: [] },
    patch: '',
  }
}

describe('reviewPull', () => {
  it('holds no token and writes nothing to GitHub on a clean review', async () => {
    const { outcome, comments, issueLabels, approvedRuns } = await runReview({
      review: readyReview,
    })

    expect(outcome).toEqual({
      reviewed: true,
      result: {
        number: NUMBER,
        verdict: { verdict: 'ready', issues: [] },
        patch: '',
      },
    })
    // The whole point of the split: this half never writes.
    expect(comments).toEqual([])
    expect([...issueLabels]).toEqual([])
    expect(approvedRuns).toEqual([])
  })

  it('carries the agent edits as a patch on a polish verdict', async () => {
    const { outcome } = await runReview({ review: polishReview })

    expect(outcome).toEqual({
      reviewed: true,
      result: {
        number: NUMBER,
        verdict: { verdict: 'polish', issues: [BUG, NIT] },
        patch: PATCH,
      },
    })
  })

  it('skips a draft auto run', async () => {
    const { outcome } = await runReview({ pull: samplePull({ draft: true }) })

    expect(outcome).toEqual({ reviewed: false, reason: 'draft' })
  })

  it('skips an auto run from a roster maintainer', async () => {
    const { outcome } = await runReview({ pull: samplePull({ login: 'alem' }) })

    expect(outcome).toEqual({ reviewed: false, reason: 'maintainer-author' })
  })

  it('skips an issue_comment that is not the /ai-review command', async () => {
    const { outcome } = await runReview({
      eventName: 'issue_comment',
      event: {
        issue: { number: NUMBER, pull_request: {} },
        comment: { body: 'looks good', user: { login: 'alem' } },
      },
    })

    expect(outcome).toEqual({ reviewed: false, reason: 'not-command' })
  })

  it('skips an issue_comment from a non-maintainer', async () => {
    const { outcome } = await runReview({
      eventName: 'issue_comment',
      event: {
        issue: { number: NUMBER, pull_request: {} },
        comment: { body: '/ai-review', user: { login: 'mallory' } },
      },
    })

    expect(outcome).toEqual({ reviewed: false, reason: 'not-maintainer' })
  })

  it('runs a maintainer /ai-review comment in manual mode', async () => {
    const { outcome } = await runReview({
      eventName: 'issue_comment',
      event: {
        issue: { number: NUMBER, pull_request: {} },
        comment: { body: '/ai-review', user: { login: 'alem' } },
      },
      pull: samplePull({ draft: true }),
      review: readyReview,
    })

    expect(outcome.reviewed).toBe(true)
  })

  it('never runs the agent when the worktree is not the scanned commit', async () => {
    // A force-push between the worktree fetch and the REST read. Scanning one
    // commit and reviewing another is the hole this closes, so the run stops.
    // `unusedReview` throws if called.
    const { outcome } = await runReview({ checkedOutSha: 'deadbeefdeadbeef' })

    expect(outcome).toEqual({ reviewed: false, reason: 'head-moved' })
  })

  it('never runs the agent when the diff looks like malware', async () => {
    const { outcome } = await runReview({
      files: [
        {
          filename: '.github/workflows/ci.yml',
          patch:
            '@@ -1,2 +1,4 @@\n on:\n+  pull_request_target:\n+    types: [opened]\n',
        },
      ],
    })

    expect(outcome).toEqual({ reviewed: false, reason: 'security-scan' })
  })
})

describe('publishPull', () => {
  it('rejects a malware PR and approves nothing, whatever the review said', async () => {
    // The review job's payload claims a clean ready verdict. The re-scan here
    // is what decides, so a compromised review job cannot fake a pass.
    const { outcome, comments, issueLabels, approvedRuns } = await runPublish({
      waitingRunIds: [101],
      reviewed: reviewedReady(),
      files: [
        {
          filename: '.github/workflows/ci.yml',
          patch:
            '@@ -1,2 +1,4 @@\n on:\n+  pull_request_target:\n+    types: [opened]\n',
        },
      ],
    })

    expect(outcome).toEqual({ published: true, label: 'ai-rejected' })
    expect([...issueLabels]).toEqual(['ai-rejected'])
    expect(approvedRuns).toEqual([])
    expect(comments[0]?.body).toContain('blocked. Did not approve workflows.')
    expect(comments[0]?.body).toContain('adds pull_request_target')
  })

  it('approves workflows on a clean scan even when the review job produced nothing', async () => {
    const { outcome, comments, issueLabels, approvedRuns } = await runPublish({
      waitingRunIds: [101, 202],
      reviewed: null,
    })

    expect(outcome).toEqual({ published: false, reason: 'no-review' })
    expect(approvedRuns).toEqual([101, 202])
    expect([...issueLabels]).toEqual(['secure'])
    expect(comments).toEqual([])
  })

  it('adds secure and approves waiting workflows when clean', async () => {
    const { comments, issueLabels, approvedRuns } = await runPublish({
      waitingRunIds: [101, 202],
      reviewed: reviewedReady(),
    })

    expect([...issueLabels]).toEqual(['secure', 'ai-ready'])
    expect(approvedRuns).toEqual([101, 202])
    expect(comments[0]?.body).toContain('Added label `secure`')
    expect(comments[0]?.body).toContain('Approved 2 waiting workflow runs.')
    expect(comments[0]?.body).toContain(AUTOMATED)
    expect(comments[0]?.body).toContain(COMMENT_MARKER)
  })

  it('releases workflows even when the AI verdict is reject', async () => {
    // The scan is the security gate; the verdict is only advice.
    const { issueLabels, comments } = await runPublish({
      waitingRunIds: [101],
      reviewed: {
        number: NUMBER,
        verdict: { verdict: 'reject', issues: [] },
        patch: '',
      },
    })

    expect([...issueLabels]).toEqual(['secure', 'ai-rejected'])
    expect(comments[0]?.body).toContain('**Verdict:** reject')
  })

  it('applies the patch and pushes with a lease pinned to the scanned head', async () => {
    const { outcome, issueLabels, gitCalls } = await runPublish({
      pull: samplePull({ maintainer_can_modify: true }),
      reviewed: reviewedPolish(),
    })

    expect(outcome).toEqual({
      published: true,
      label: 'ai-ready',
      pushLanded: true,
    })
    expect([...issueLabels]).toEqual(['secure', 'ai-ready'])
    expect(gitCalls[0]).toEqual({
      args: ['apply', '--whitespace=nowarn', '-'],
      cwd: WORKTREE,
    })
    const push = gitCalls.at(-1)
    expect(push?.args).toContain(`--force-with-lease=${HEAD_REF}:${SHA}`)
    expect(push?.args).not.toContain('--force')
  })

  it('does not push when the patch does not apply', async () => {
    const { outcome, issueLabels, gitCalls } = await runPublish({
      pull: samplePull({ maintainer_can_modify: true }),
      reviewed: reviewedPolish(),
      gitImpl: (args) =>
        args[0] === 'apply'
          ? { stdout: '', stderr: 'does not apply', code: 1 }
          : { stdout: '', stderr: '', code: 0 },
    })

    expect(outcome).toEqual({
      published: true,
      label: 'ai-needs-work',
      pushLanded: false,
    })
    expect(gitCalls.map((call) => call.args[0])).toEqual(['apply'])
  })

  it('does not push polish when maintainer edits are off', async () => {
    const { outcome, comments, gitCalls } = await runPublish({
      pull: samplePull({ maintainer_can_modify: false }),
      reviewed: reviewedPolish(),
    })

    expect(outcome).toEqual({
      published: true,
      label: 'ai-needs-work',
      pushLanded: false,
    })
    expect(comments[0]?.body).toContain('fork has maintainer edits off')
    expect(gitCalls).toEqual([])
  })

  it('does not leave secure when workflow approval fails', async () => {
    const { comments, issueLabels, approvedRuns } = await runPublish({
      waitingRunIds: [101],
      approveError: 'Resource not accessible by personal access token',
      reviewed: reviewedReady(),
    })

    expect([...issueLabels]).toEqual(['ai-ready'])
    expect(approvedRuns).toEqual([])
    expect(comments[0]?.body).toContain('Did not add label `secure`')
    expect(comments[0]?.body).toContain('Could not approve workflows')
  })
})
