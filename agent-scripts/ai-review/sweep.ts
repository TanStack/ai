/**
 * Scheduled AI review sweep.
 *
 * `pull_request` events raised by a fork do not get repo secrets, so an
 * event-driven auto review could never start on the PRs that need it most.
 * Cron runs instead: list open PRs, drop the ones a review would skip, then
 * review up to `AI_REVIEW_SWEEP_LIMIT` of the rest, newest first.
 *
 * Each selected PR head is fetched into its own worktree. PR code is read and
 * edited there, never executed by this script.
 *
 * Usage: tsx agent-scripts/ai-review/sweep.ts
 */

import process from 'node:process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../scripts/maintainer/config.ts'
import { createGitHubClient } from '../../scripts/maintainer/github.ts'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import type { ToolsetConfig } from '../../scripts/maintainer/types.ts'
import {
  createGrokReview,
  createProcessGitRunner,
  fetchAlreadyReviewedSha,
  requireEnv,
  resolveReviewToken,
  runReviewJob,
} from './run.ts'
import { shouldSkip } from './skip.ts'
import type { GitRunner } from './git.ts'

/** Reviews started per sweep run. Each one runs a full agent, so keep it low. */
export const DEFAULT_SWEEP_LIMIT = 3

export type SweepPull = {
  number: number
  headSha: string
  isDraft: boolean
  authorLogin: string | null
}

/** An open pull plus the head SHA this bot last reviewed it at, if any. */
export type SweepCandidate = SweepPull & { alreadyReviewedSha: string | null }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function fail(path: string, message: string): never {
  throw new Error(`GitHub GET ${path} ${message}`)
}

function parseOpenPull(raw: unknown, path: string): SweepPull {
  if (!isRecord(raw)) fail(path, 'has a pull that is not an object')
  if (typeof raw.number !== 'number') fail(path, 'has a pull without number')
  if (typeof raw.draft !== 'boolean') fail(path, 'has a pull without draft')
  if (!isRecord(raw.head) || typeof raw.head.sha !== 'string') {
    fail(path, 'has a pull without head.sha')
  }
  const user = isRecord(raw.user) ? raw.user : null
  return {
    number: raw.number,
    headSha: raw.head.sha,
    isDraft: raw.draft,
    authorLogin:
      user !== null && typeof user.login === 'string' ? user.login : null,
  }
}

/**
 * List open pull requests, most recently updated first.
 *
 * @param client GitHub REST client
 * @param repo owner/name, for example `TanStack/ai`
 */
export async function listOpenPulls(client: GitHubClient, repo: string) {
  const path = `/repos/${repo}/pulls?state=open&sort=updated&direction=desc&per_page=100`
  const raw = await client.rest('GET', path)
  if (!Array.isArray(raw)) fail(path, 'did not return an array')
  const pulls = []
  for (const item of raw) {
    pulls.push(parseOpenPull(item, path))
  }
  return pulls
}

/**
 * Split open pulls into the ones to review now and the ones to leave.
 *
 * Reuses the auto-mode skip rules, so drafts, bot authors, roster
 * maintainers, and heads already reviewed at this SHA drop out. Anything
 * past `limit` waits for the next run.
 *
 * @param input open pulls with their already-reviewed SHA, plus skip context
 */
export function selectSweepPulls(input: {
  pulls: Array<SweepCandidate>
  machineUserLogin: string
  config: ToolsetConfig
  limit: number
}) {
  const selected: Array<SweepCandidate> = []
  const skipped: Array<{ number: number; reason: string }> = []
  for (const pull of input.pulls) {
    const skip = shouldSkip({
      mode: 'auto',
      isDraft: pull.isDraft,
      authorLogin: pull.authorLogin,
      headCommitAuthorLogin: null,
      headSha: pull.headSha,
      alreadyReviewedSha: pull.alreadyReviewedSha,
      machineUserLogin: input.machineUserLogin,
      config: input.config,
    })
    if (skip.skip) {
      skipped.push({ number: pull.number, reason: skip.reason ?? 'unknown' })
      continue
    }
    if (selected.length >= input.limit) {
      skipped.push({ number: pull.number, reason: 'over-limit' })
      continue
    }
    selected.push(pull)
  }
  return { selected, skipped }
}

/** Reviews per run, from `AI_REVIEW_SWEEP_LIMIT`. */
export function parseSweepLimit(value: string | undefined) {
  if (value === undefined || value.length === 0) return DEFAULT_SWEEP_LIMIT
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) return DEFAULT_SWEEP_LIMIT
  return parsed
}

async function git(runner: GitRunner, cwd: string, args: Array<string>) {
  const result = await runner(args, cwd)
  if (result.code !== 0) {
    const detail = result.stderr.trim() || result.stdout.trim()
    throw new Error(`git ${args.join(' ')} exited ${result.code}: ${detail}`)
  }
}

/**
 * Fetch a PR head and check it out into its own worktree.
 *
 * @param input repo root, destination worktree path, PR number, git runner
 */
export async function addPullWorktree(input: {
  repoRoot: string
  worktreePath: string
  prNumber: number
  runner: GitRunner
}) {
  const branch = `ai-review-pr-${String(input.prNumber)}`
  await git(input.runner, input.repoRoot, [
    'fetch',
    '--force',
    'origin',
    `pull/${String(input.prNumber)}/head:${branch}`,
  ])
  await git(input.runner, input.repoRoot, [
    'worktree',
    'add',
    input.worktreePath,
    branch,
  ])
  return branch
}

/**
 * Drop a sweep worktree and its fetched branch. Never throws: a failed
 * cleanup must not hide the review result or stop the next PR.
 */
export async function removePullWorktree(input: {
  repoRoot: string
  worktreePath: string
  branch: string
  runner: GitRunner
}) {
  try {
    await input.runner(
      ['worktree', 'remove', '--force', input.worktreePath],
      input.repoRoot,
    )
    await input.runner(['branch', '-D', input.branch], input.repoRoot)
  } catch (error) {
    console.error('ai-review sweep could not clean up worktree', error)
  }
}

async function fetchHeadCommitAuthor(
  client: GitHubClient,
  repo: string,
  sha: string,
) {
  const raw = await client.rest('GET', `/repos/${repo}/commits/${sha}`)
  if (!isRecord(raw) || !isRecord(raw.author)) return null
  return typeof raw.author.login === 'string' ? raw.author.login : null
}

async function fetchMachineUserLogin(client: GitHubClient) {
  const raw = await client.rest('GET', '/user')
  if (!isRecord(raw) || typeof raw.login !== 'string') {
    throw new Error('GitHub GET /user is missing login')
  }
  return raw.login
}

/**
 * Production entry. Needs `AI_REVIEW_TOKEN` (or a resolvable GitHub token)
 * and `XAI_API_KEY`.
 */
export async function main() {
  const token = await resolveReviewToken()
  requireEnv('XAI_API_KEY')
  const config = await loadConfig()
  const client = createGitHubClient({ token })
  const repo = process.env.GITHUB_REPOSITORY ?? config.repo
  const repoRoot = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const machineUserLogin = await fetchMachineUserLogin(client)
  const limit = parseSweepLimit(process.env.AI_REVIEW_SWEEP_LIMIT)

  const open = await listOpenPulls(client, repo)
  const pulls = []
  for (const pull of open) {
    pulls.push({
      ...pull,
      alreadyReviewedSha: await fetchAlreadyReviewedSha(
        client,
        repo,
        pull.number,
        machineUserLogin,
      ),
    })
  }
  const { selected, skipped } = selectSweepPulls({
    pulls,
    machineUserLogin,
    config,
    limit,
  })
  console.log(
    `ai-review sweep: ${String(open.length)} open, ${String(selected.length)} to review`,
  )
  for (const skip of skipped) {
    console.log(`ai-review sweep skip #${String(skip.number)}: ${skip.reason}`)
  }

  const gitRunner = createProcessGitRunner()
  const review = createGrokReview()
  let failures = 0
  for (const pull of selected) {
    const worktreePath = join(repoRoot, `.pr-${String(pull.number)}`)
    const branch = await addPullWorktree({
      repoRoot,
      worktreePath,
      prNumber: pull.number,
      runner: gitRunner,
    })
    try {
      const result = await runReviewJob({
        client,
        repo,
        token,
        config,
        eventName: 'pull_request',
        event: { pull_request: { number: pull.number } },
        worktreeRoot: worktreePath,
        machineUserLogin,
        gitRunner,
        review,
        alreadyReviewedSha: pull.alreadyReviewedSha,
        headCommitAuthorLogin: await fetchHeadCommitAuthor(
          client,
          repo,
          pull.headSha,
        ),
      })
      console.log(
        result.skipped
          ? `ai-review sweep skip #${String(pull.number)}: ${result.reason}`
          : `ai-review sweep done #${String(pull.number)} label=${result.label} push=${String(result.pushLanded)}`,
      )
    } catch (error) {
      // One bad PR must not stop the sweep. The run still exits non-zero.
      failures += 1
      console.error(`ai-review sweep failed #${String(pull.number)}`, error)
    } finally {
      await removePullWorktree({
        repoRoot,
        worktreePath,
        branch,
        runner: gitRunner,
      })
    }
  }
  if (failures > 0) {
    throw new Error(`ai-review sweep: ${String(failures)} review(s) failed`)
  }
}

function isExecutedDirectly() {
  const entry = process.argv[1]
  if (entry === undefined) return false
  return fileURLToPath(import.meta.url) === resolve(entry)
}

if (isExecutedDirectly()) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
