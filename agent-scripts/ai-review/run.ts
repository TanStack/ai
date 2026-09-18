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
import { parseReviewEvent } from './event.ts'
import { createReviewStreamLogger } from './log.ts'
import {
  applyPatch,
  commitAll,
  headRemoteUrl,
  headSha,
  pushHead,
  stagedPatch,
} from './git.ts'
import type { GitRunner } from './git.ts'
import { setReviewState } from './labels.ts'
import { fetchPullRequest, fetchPullRequestDiff } from './pr.ts'
import { approveWaitingWorkflows, setSecureLabel } from './secure.ts'
import { scanPullSecurity } from './security.ts'
import { shouldSkip } from './skip.ts'
import { createReviewTools } from './tools.ts'
import { parseVerdict, reviewLabelFor, reviewVerdictSchema } from './verdict.ts'
import type { ReviewedPull } from './results.ts'
import { resultsPath, writeResults } from './results.ts'

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

/**
 * Read the head SHA from this PR's existing bot review comment, if any.
 *
 * @param client GitHub REST client
 * @param repo owner/name, for example `TanStack/ai`
 * @param issueNumber pull request number
 * @param machineUserLogin login the bot comments as
 */
export async function fetchAlreadyReviewedSha(
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
    const stream = chat({
      adapter: grokBuildText('grok-4.6', {
        authMode: 'api-key',
        protocol: 'streaming-json',
        cwd: input.worktreeRoot,
        grokExecutable: join(homedir(), '.grok', 'bin', 'grok'),
      }),
      stream: true,
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
    let object: unknown
    const log = createReviewStreamLogger()
    for await (const chunk of stream) {
      log.chunk(chunk)
      if (
        chunk.type === 'CUSTOM' &&
        chunk.name === 'structured-output.complete' &&
        isRecord(chunk.value) &&
        'object' in chunk.value
      ) {
        object = chunk.value.object
      }
    }
    log.flush()
    if (object === undefined) {
      throw new Error('chat() did not emit structured-output.complete')
    }
    const verdict = parseVerdict(object)
    console.log('ai-review verdict', JSON.stringify(verdict, null, 2))
    return verdict
  }
}

/**
 * Run one PR review: skip, review, optional polish push, comment, label.
 *
 * @param opts GitHub client, event, worktree, injected review step, and git runner
 */
/**
 * Review one pull request. Runs the agent; performs NO GitHub writes and
 * needs no PAT, so this half can run in a job that holds no repo credentials.
 *
 * Returns `reviewed: false` with a reason whenever the PR should not be
 * reviewed. A failed malware scan is one of those reasons: the publish job
 * re-runs the scan itself and posts the rejection, because a scan verdict
 * from this job would be attacker-controlled.
 *
 * @param opts GitHub client, event, worktree, injected review step, git runner
 */
export async function reviewPull(opts: {
  client: GitHubClient
  repo: string
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
      return { reviewed: false as const, reason: 'not-command' }
    }
    if (!isRosterMaintainer(parsed.commentAuthor, opts.config)) {
      return { reviewed: false as const, reason: 'not-maintainer' }
    }
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
    return { reviewed: false as const, reason: skip.reason ?? 'unknown' }
  }

  // Bind the scan to the tree the agent will read. The worktree was fetched
  // before this REST call, so a force-push in between would leave us scanning
  // one commit and reviewing another. Refuse rather than straddle two commits;
  // the next sweep picks the new head up and scans it from scratch.
  const checkedOut = await headSha(opts.worktreeRoot, opts.gitRunner)
  if (checkedOut !== pr.headSha) {
    return { reviewed: false as const, reason: 'head-moved' }
  }

  // The scan gates the agent. A PR that trips it is never read or edited.
  // It reads the REST file list, so this needs nothing from the PR head.
  if (!scanPullSecurity(pr.files).ok) {
    return { reviewed: false as const, reason: 'security-scan' }
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

  // Carry the agent's edits as a patch. The publish job applies it to the head
  // it resolved itself, so the edits never decide where the push lands.
  const patch =
    verdict.verdict === 'polish'
      ? await stagedPatch(opts.worktreeRoot, opts.gitRunner)
      : ''

  return {
    reviewed: true as const,
    result: { number: pr.number, verdict, patch },
  }
}

/**
 * Publish one pull request's outcome. Holds the PAT and performs every GitHub
 * write, but never runs the agent and never executes PR code.
 *
 * Re-runs the malware scan rather than trusting `reviewed`, which the review
 * job produced next to untrusted code. A blocked PR is rejected here.
 *
 * @param opts GitHub client, token, PR number, untrusted review payload
 */
export async function publishPull(opts: {
  client: GitHubClient
  repo: string
  token: string
  prNumber: number
  machineUserLogin: string
  gitRunner: GitRunner
  /** Worktree at the PR head for applying a polish patch, else null. */
  worktreeRoot: string | null
  /** Untrusted payload from the review job. */
  reviewed: ReviewedPull | null
}) {
  const pr = await fetchPullRequest(opts.client, opts.repo, opts.prNumber)

  // Authoritative scan. The review job's opinion of this never reaches here.
  const security = scanPullSecurity(pr.files)
  if (!security.ok) {
    await setReviewState(opts.client, opts.repo, pr.number, 'ai-rejected')
    await setSecureLabel(opts.client, opts.repo, pr.number, false)
    await upsertReviewComment(
      opts.client,
      opts.repo,
      pr.number,
      buildReviewComment({
        verdict: 'reject',
        headSha: pr.headSha,
        findings: security.reasons,
        pushNote: 'Did not push.',
        label: 'ai-rejected',
        securityNote: securityNoteFor({
          reasons: security.reasons,
          approvedRuns: 0,
          approveError: null,
        }),
      }),
      opts.machineUserLogin,
    )
    return { published: true as const, label: 'ai-rejected' as const }
  }

  // A clean scan is what releases the other workflows, not the AI verdict.
  let approvedRuns = 0
  let approveError: string | null = null
  try {
    approvedRuns = await approveWaitingWorkflows(
      opts.client,
      opts.repo,
      pr.headSha,
    )
  } catch (error) {
    approveError = error instanceof Error ? error.message : String(error)
  }
  await setSecureLabel(opts.client, opts.repo, pr.number, approveError === null)

  if (opts.reviewed === null) {
    return { published: false as const, reason: 'no-review' }
  }
  const verdict = opts.reviewed.verdict

  let pushLanded = false
  const canPushPolish =
    verdict.verdict === 'polish' &&
    pr.maintainerCanModify &&
    opts.reviewed.patch.length > 0 &&
    opts.worktreeRoot !== null
  if (canPushPolish && opts.worktreeRoot !== null) {
    const applied = await applyPatch(
      opts.worktreeRoot,
      opts.reviewed.patch,
      opts.gitRunner,
    )
    if (applied) {
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
        // Lease pinned to the head we resolved, so a branch that moved since
        // the review is refused instead of overwritten.
        await pushHead(opts.worktreeRoot, opts.gitRunner, {
          remoteUrl: headRemoteUrl({
            isFork: pr.headRepo !== opts.repo,
            originRepo: opts.repo,
            headRepo: pr.headRepo,
            token: opts.token,
          }),
          ref: pr.headRef,
          expectSha: pr.headSha,
        })
      }
      pushLanded = commit.committed
    }
  }

  const label = reviewLabelFor(verdict.verdict, pushLanded)
  await setReviewState(opts.client, opts.repo, pr.number, label)
  const findings = []
  for (const issue of verdict.issues) {
    findings.push(formatFinding(issue))
  }
  await upsertReviewComment(
    opts.client,
    opts.repo,
    pr.number,
    buildReviewComment({
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
        reasons: security.reasons,
        approvedRuns,
        approveError,
      }),
    }),
    opts.machineUserLogin,
  )
  return { published: true as const, label, pushLanded }
}

function securityNoteFor(input: {
  reasons: Array<string>
  approvedRuns: number
  approveError: string | null
}) {
  if (input.reasons.length > 0) {
    return `blocked. Did not approve workflows.\n${input.reasons.map((reason) => `- ${reason}`).join('\n')}`
  }
  if (input.approveError !== null) {
    return `clean. Did not add label \`secure\`. Could not approve workflows: ${input.approveError}`
  }
  if (input.approvedRuns === 0) {
    return 'clean. Added label `secure`. No waiting workflow runs.'
  }
  return `clean. Added label \`secure\`. Approved ${String(input.approvedRuns)} waiting workflow runs.`
}

/** Spawn-backed git runner for production entry points. */
export function createProcessGitRunner(): GitRunner {
  return (args, cwd, stdin) =>
    new Promise((resolveResult, reject) => {
      const child = spawn('git', args, { cwd })
      if (stdin !== undefined) {
        child.stdin.end(stdin)
      }
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

/**
 * `AI_REVIEW_TOKEN`, else any resolvable GitHub token.
 *
 * The review job has no PAT by design and falls through to the read-only
 * `GITHUB_TOKEN`, which is all it needs. Only the publish job supplies the
 * PAT, and it checks for that itself before it starts.
 */
export async function resolveReviewToken() {
  const fromEnv = process.env.AI_REVIEW_TOKEN
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv
  try {
    return await resolveToken()
  } catch {
    throw new Error('missing AI_REVIEW_TOKEN or GITHUB_TOKEN')
  }
}

/** Read a required env var, or throw naming it. */
export function requireEnv(name: string) {
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
 * Review entry for the manual single-PR path (`workflow_dispatch`, or a
 * maintainer's `/ai-review` comment).
 *
 * Runs the agent and writes `AI_REVIEW_RESULTS` for the publish job. Holds no
 * PAT: every GitHub write happens later, in `publish.ts`.
 *
 * Needs `XAI_API_KEY` and a readable GitHub token.
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
  const outcome = await reviewPull({
    client,
    repo,
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
  // The publish job runs either way: a PR the scan blocked still needs its
  // rejection comment, and that comment is written there, not here.
  await writeResults(resultsPath(), {
    results: outcome.reviewed ? [outcome.result] : [],
  })
  console.log(
    outcome.reviewed
      ? `ai-review reviewed #${String(outcome.result.number)} verdict=${outcome.result.verdict.verdict}`
      : `ai-review skipped: ${outcome.reason}`,
  )
}

if (isExecutedDirectly()) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
