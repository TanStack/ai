/**
 * Orchestrate one AI review job: skip, review, optional polish push, comment, label.
 */

import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { readFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { chat } from '@tanstack/ai'
import {
  GROK_CLI_INSTALL_COMMAND,
  grokBuildText,
} from '@tanstack/ai-grok-build'
import {
  createSecrets,
  defineSandbox,
  defineWorkspace,
  localSource,
  withSandbox,
} from '@tanstack/ai-sandbox'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  loadConfig,
  isRosterMaintainer,
} from '../../scripts/maintainer/config.ts'
import { resolveToken } from '../../scripts/maintainer/env.ts'
import { createGitHubClient } from '../../scripts/maintainer/github.ts'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import type { ToolsetConfig } from '../../scripts/maintainer/types.ts'
import {
  buildReviewComment,
  isBotReviewComment,
  upsertReviewComment,
} from './comments.ts'
import {
  isAiReviewLabelEvent,
  isPullRequestLabeledEvent,
  parseReviewEvent,
} from './event.ts'
import { commitAll, headRemoteUrl, pushHead } from './git.ts'
import type { GitRunner } from './git.ts'
import { setReviewState } from './labels.ts'
import { fetchPullRequest, fetchPullRequestDiff } from './pr.ts'
import { approveWaitingWorkflows, setSecureLabel } from './secure.ts'
import { scanPullSecurity } from './security.ts'
import { shouldSkip } from './skip.ts'
import { createReviewTools } from './tools.ts'
import { parseVerdict, reviewLabelFor, reviewVerdictSchema } from './verdict.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readIssueCommentBody(event: unknown) {
  if (!isRecord(event) || !isRecord(event.comment)) return ''
  return typeof event.comment.body === 'string' ? event.comment.body : ''
}

function firstToken(body: string) {
  const trimmed = body.trim()
  if (trimmed.length === 0) return ''
  const [token] = trimmed.split(/\s+/)
  return token ?? ''
}

function formatFinding(
  issue: ReturnType<typeof parseVerdict>['issues'][number],
) {
  return `[${issue.severity}] ${issue.file}:${issue.line} ${issue.description}`
}

function pushNoteFor(input: {
  pushLanded: boolean
  verdict: ReturnType<typeof parseVerdict>['verdict']
  maintainerCanModify: boolean
}) {
  if (input.pushLanded) {
    return 'Pushed polish commit to the PR branch.'
  }
  if (input.verdict === 'polish' && !input.maintainerCanModify) {
    return 'Did not push: fork has maintainer edits off.'
  }
  return 'Did not push.'
}

/**
 * Read `**Head SHA:** <sha>` from a bot review comment body.
 *
 * @param body comment markdown
 */
export function parseHeadShaFromComment(body: string) {
  const match = /\*\*Head SHA:\*\*\s+(\S+)/.exec(body)
  return match?.[1] ?? null
}

function parseListedComment(value: unknown) {
  if (!isRecord(value) || typeof value.body !== 'string') return null
  const user = isRecord(value.user) ? value.user : null
  const userLogin =
    user !== null && typeof user.login === 'string' ? user.login : null
  return { body: value.body, userLogin }
}

async function fetchAlreadyReviewedSha(
  client: GitHubClient,
  repo: string,
  issueNumber: number,
  machineUserLogin: string,
) {
  const list = await client.rest(
    'GET',
    `/repos/${repo}/issues/${issueNumber}/comments`,
  )
  if (!Array.isArray(list)) return null
  const comments = []
  for (const item of list) {
    const comment = parseListedComment(item)
    if (comment !== null) comments.push(comment)
  }
  const existing = comments.find((comment) =>
    isBotReviewComment(comment, machineUserLogin),
  )
  if (existing === undefined) return null
  return parseHeadShaFromComment(existing.body)
}

type ReviewInput = {
  pr: Awaited<ReturnType<typeof fetchPullRequest>>
  diff: string
  worktreeRoot: string
  client: GitHubClient
  repo: string
}

/**
 * Production Grok review step for `runReviewJob`.
 *
 * `grokBuildText` streams tools first, then a `structured-output.complete`
 * event. Do not call this from unit tests.
 */
export function createGrokReview() {
  return async (input: ReviewInput) => {
    const xaiKey = process.env.XAI_API_KEY
    const sandbox = defineSandbox({
      id: 'ai-review',
      provider: localProcessSandbox({
        dir: input.worktreeRoot,
        removeOnDestroy: false,
      }),
      workspace: defineWorkspace({
        source: localSource(input.worktreeRoot),
        setup: ({ serial }) => serial(GROK_CLI_INSTALL_COMMAND),
        ...(xaiKey !== undefined && xaiKey.length > 0
          ? { secrets: createSecrets({ XAI_API_KEY: xaiKey }) }
          : {}),
      }),
      lifecycle: { reuse: 'none', destroyOnComplete: false },
    })
    const result = await chat({
      adapter: grokBuildText('grok-4.6', {
        authMode: 'api-key',
        protocol: 'streaming-json',
        cwd: input.worktreeRoot,
        grokExecutable: join(homedir(), '.grok', 'bin', 'grok'),
      }),
      debug: true,
      tools: createReviewTools({ worktreeRoot: input.worktreeRoot }),
      outputSchema: reviewVerdictSchema,
      middleware: [withSandbox(sandbox)],
      threadId: `ai-review-${input.pr.number}`,
      messages: [
        {
          role: 'user',
          content: [
            'Review this pull request.',
            'Read the changed source files before you choose a verdict.',
            'If it is a bug fix and does not fix the claimed root cause, verdict is reject.',
            'If it is useful and needs listed bug or suggestion edits, apply those with edit_file, then verdict polish.',
            'If it is useful and clean, verdict is ready.',
            'Nits stay in issues. Do not edit files for nits.',
            'Never edit .github/workflows.',
            '',
            `Pull request #${input.pr.number}: ${input.pr.title}`,
            input.pr.htmlUrl,
            input.pr.body ?? '',
            '',
            'Diff:',
            input.diff,
          ].join('\n'),
        },
      ],
    })
    const verdict = parseVerdict(result)
    console.log('ai-review verdict', JSON.stringify(verdict, null, 2))
    return verdict
  }
}

/**
 * Run one PR review: skip, review, optional polish push, comment, label.
 *
 * @param opts GitHub client, event, worktree, injected review step, and git runner
 */
export async function runReviewJob(opts: {
  client: GitHubClient
  repo: string
  token: string
  config: ToolsetConfig
  eventName: string
  event: unknown
  worktreeRoot: string
  machineUserLogin: string
  gitRunner: GitRunner
  review: (input: ReviewInput) => Promise<ReturnType<typeof parseVerdict>>
  alreadyReviewedSha: string | null
  headCommitAuthorLogin: string | null
}) {
  const parsed = parseReviewEvent({
    eventName: opts.eventName,
    event: opts.event,
  })

  if (opts.eventName === 'issue_comment') {
    if (firstToken(readIssueCommentBody(opts.event)) !== '/ai-review') {
      return { skipped: true as const, reason: 'not-command' }
    }
    if (!isRosterMaintainer(parsed.commentAuthor, opts.config)) {
      return { skipped: true as const, reason: 'not-maintainer' }
    }
  }

  if (
    opts.eventName === 'pull_request' &&
    isPullRequestLabeledEvent(opts.event) &&
    !isAiReviewLabelEvent(opts.event)
  ) {
    return { skipped: true as const, reason: 'not-label' }
  }

  const pr = await fetchPullRequest(opts.client, opts.repo, parsed.prNumber)
  const skip = shouldSkip({
    mode: parsed.mode,
    isDraft: pr.isDraft,
    authorLogin: pr.authorLogin,
    headCommitAuthorLogin: opts.headCommitAuthorLogin,
    headSha: pr.headSha,
    alreadyReviewedSha: opts.alreadyReviewedSha,
    machineUserLogin: opts.machineUserLogin,
    config: opts.config,
  })
  if (skip.skip) {
    return { skipped: true as const, reason: skip.reason }
  }

  const diff = await fetchPullRequestDiff(
    opts.client,
    opts.repo,
    parsed.prNumber,
  )
  const verdict = await opts.review({
    pr,
    diff,
    worktreeRoot: opts.worktreeRoot,
    client: opts.client,
    repo: opts.repo,
  })

  let pushLanded = false
  const canPushPolish = verdict.verdict === 'polish' && pr.maintainerCanModify
  if (canPushPolish) {
    const commit = await commitAll(
      opts.worktreeRoot,
      `ai-review: apply review polish for #${pr.number}`,
      opts.gitRunner,
      {
        name: opts.machineUserLogin,
        email: `${opts.machineUserLogin}@users.noreply.github.com`,
      },
    )
    if (commit.committed) {
      await pushHead(opts.worktreeRoot, opts.gitRunner, {
        remoteUrl: headRemoteUrl({
          isFork: pr.headRepo !== opts.repo,
          originRepo: opts.repo,
          headRepo: pr.headRepo,
          token: opts.token,
        }),
        ref: pr.headRef,
      })
    }
    pushLanded = commit.committed
  }

  const label = reviewLabelFor(verdict.verdict, pushLanded)
  const security = scanPullSecurity(pr.files)
  const markSecure = label === 'ai-ready' && security.ok
  await setReviewState(opts.client, opts.repo, pr.number, label)
  await setSecureLabel(opts.client, opts.repo, pr.number, markSecure)
  let approvedRuns = 0
  let approveError: string | null = null
  if (markSecure) {
    try {
      approvedRuns = await approveWaitingWorkflows(
        opts.client,
        opts.repo,
        pr.headSha,
      )
    } catch (error) {
      approveError = error instanceof Error ? error.message : String(error)
    }
  }
  const findings = []
  for (const issue of verdict.issues) {
    findings.push(formatFinding(issue))
  }
  const body = buildReviewComment({
    verdict: verdict.verdict,
    headSha: pr.headSha,
    findings,
    pushNote: pushNoteFor({
      pushLanded,
      verdict: verdict.verdict,
      maintainerCanModify: pr.maintainerCanModify,
    }),
    label,
    securityNote: securityNoteFor({
      markSecure,
      reasons: security.reasons,
      approvedRuns,
      approveError,
    }),
  })
  await upsertReviewComment(
    opts.client,
    opts.repo,
    pr.number,
    body,
    opts.machineUserLogin,
  )
  return { skipped: false as const, verdict, label, pushLanded }
}

function securityNoteFor(input: {
  markSecure: boolean
  reasons: Array<string>
  approvedRuns: number
  approveError: string | null
}) {
  if (!input.markSecure) {
    if (input.reasons.length > 0) {
      return `blocked. Did not approve workflows.\n${input.reasons.map((reason) => `- ${reason}`).join('\n')}`
    }
    return 'Did not mark secure. Verdict is not ai-ready.'
  }
  if (input.approveError !== null) {
    return `clean. Added label \`secure\`. Could not approve workflows: ${input.approveError}`
  }
  if (input.approvedRuns === 0) {
    return 'clean. Added label `secure`. No waiting workflow runs.'
  }
  return `clean. Added label \`secure\`. Approved ${String(input.approvedRuns)} waiting workflow runs.`
}

function createProcessGitRunner(): GitRunner {
  return (args, cwd) =>
    new Promise((resolveResult, reject) => {
      const child = spawn('git', args, { cwd })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (chunk: Buffer | string) => {
        stdout += String(chunk)
      })
      child.stderr.on('data', (chunk: Buffer | string) => {
        stderr += String(chunk)
      })
      child.on('error', reject)
      child.on('close', (code) => {
        resolveResult({ stdout, stderr, code: code ?? 1 })
      })
    })
}

async function resolveReviewToken() {
  const fromEnv = process.env.AI_REVIEW_TOKEN
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
  try {
    return await resolveToken()
  } catch {
    throw new Error('missing AI_REVIEW_TOKEN or XAI_API_KEY')
  }
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (value === undefined || value.length === 0) {
    throw new Error(`missing ${name}`)
  }
  return value
}

function isExecutedDirectly() {
  const entry = process.argv[1]
  if (entry === undefined) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

/**
 * Production entry. Fills `runReviewJob` opts from env.
 *
 * Needs `AI_REVIEW_TOKEN` (or a resolvable GitHub token) and `XAI_API_KEY`.
 */
export async function main() {
  const token = await resolveReviewToken()
  requireEnv('XAI_API_KEY')
  const eventName = process.env.GITHUB_EVENT_NAME
  const eventPath = process.env.GITHUB_EVENT_PATH
  const repo = process.env.GITHUB_REPOSITORY
  if (
    eventName === undefined ||
    eventName.length === 0 ||
    eventPath === undefined ||
    eventPath.length === 0 ||
    repo === undefined ||
    repo.length === 0
  ) {
    throw new Error(
      'missing GITHUB_EVENT_NAME, GITHUB_EVENT_PATH, or GITHUB_REPOSITORY',
    )
  }
  const eventText = await readFile(eventPath, 'utf8')
  const event: unknown = JSON.parse(eventText)
  const config = await loadConfig()
  const worktreeRoot =
    process.env.AI_REVIEW_WORKTREE ??
    process.env.GITHUB_WORKSPACE ??
    process.cwd()
  const machineUserLogin =
    process.env.AI_REVIEW_MACHINE_USER ?? 'tanstack-ai-bot'
  const headCommitAuthor = process.env.AI_REVIEW_HEAD_COMMIT_AUTHOR
  const client = createGitHubClient({ token })
  const parsed = parseReviewEvent({ eventName, event })
  const alreadyReviewedSha = await fetchAlreadyReviewedSha(
    client,
    repo,
    parsed.prNumber,
    machineUserLogin,
  )
  const result = await runReviewJob({
    client,
    repo,
    token,
    config,
    eventName,
    event,
    worktreeRoot,
    machineUserLogin,
    gitRunner: createProcessGitRunner(),
    review: createGrokReview(),
    alreadyReviewedSha,
    headCommitAuthorLogin:
      headCommitAuthor === undefined || headCommitAuthor.length === 0
        ? null
        : headCommitAuthor,
  })
  if (result.skipped) {
    console.log(`ai-review skipped: ${result.reason}`)
    return
  }
  console.log(
    `ai-review done label=${result.label} push=${String(result.pushLanded)}`,
  )
}

if (isExecutedDirectly()) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
