/**
 * Publish half of the AI review. Holds the PAT; never runs the agent.
 *
 * This job exists so the credential is never in a process tree next to an
 * auto-approving agent that is reading untrusted PR code. It checks out PR
 * heads to apply a polish patch, but it never installs or executes anything
 * from them.
 *
 * It treats the review job's output as hostile. For every PR it re-derives
 * eligibility and re-runs the malware scan from the GitHub API, so the review
 * job cannot fake a clean scan, smuggle in a PR the sweep never selected, or
 * name a repo or ref to push to.
 *
 * Usage: tsx agent-scripts/ai-review/publish.ts
 */

import process from 'node:process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadConfig } from '../../scripts/maintainer/config.ts'
import { createGitHubClient } from '../../scripts/maintainer/github.ts'
import type { GitHubClient } from '../../scripts/maintainer/github.ts'
import {
  createProcessGitRunner,
  fetchAlreadyReviewedSha,
  publishPull,
  resolveReviewToken,
} from './run.ts'
import { readResults, resultsPath } from './results.ts'
import type { ReviewedPull } from './results.ts'
import {
  addPullWorktree,
  listOpenPulls,
  removePullWorktree,
  parseSweepLimit,
  selectSweepPulls,
} from './sweep.ts'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

async function fetchMachineUserLogin(client: GitHubClient) {
  const raw = await client.rest('GET', '/user')
  if (!isRecord(raw) || typeof raw.login !== 'string') {
    throw new Error('GitHub GET /user is missing login')
  }
  return raw.login
}

/**
 * Production entry. Needs `AI_REVIEW_TOKEN` (or a resolvable GitHub token).
 * Does not need `XAI_API_KEY`: no model is called here.
 */
export async function main() {
  const token = await resolveReviewToken()
  const config = await loadConfig()
  const client = createGitHubClient({ token })
  const repo = process.env.GITHUB_REPOSITORY ?? config.repo
  const repoRoot = process.env.GITHUB_WORKSPACE ?? process.cwd()
  const machineUserLogin = await fetchMachineUserLogin(client)
  const limit = parseSweepLimit(process.env.AI_REVIEW_SWEEP_LIMIT)

  // Untrusted. Only `verdict` and `patch` are ever read off these, and only
  // for a PR this job independently selects below.
  const { results } = await readResults(resultsPath())
  const reviewed = new Map<number, ReviewedPull>()
  for (const result of results) {
    reviewed.set(result.number, result)
  }

  // Re-derive the eligible set rather than trusting the file's PR numbers.
  // Recomputing from live API state can only drop entries, never add one the
  // sweep would not have picked, so an unexpected number simply goes unread.
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
  const { selected } = selectSweepPulls({
    pulls,
    machineUserLogin,
    config,
    limit,
  })

  const gitRunner = createProcessGitRunner()
  let failures = 0
  for (const pull of selected) {
    const entry = reviewed.get(pull.number) ?? null
    // A worktree is only needed to apply a polish patch onto the head.
    const needsWorktree =
      entry !== null &&
      entry.verdict.verdict === 'polish' &&
      entry.patch.length > 0
    const worktreePath = join(repoRoot, `.publish-${String(pull.number)}`)
    let branch: string | null = null
    try {
      if (needsWorktree) {
        branch = await addPullWorktree({
          repoRoot,
          worktreePath,
          prNumber: pull.number,
          runner: gitRunner,
        })
      }
      const outcome = await publishPull({
        client,
        repo,
        token,
        prNumber: pull.number,
        machineUserLogin,
        gitRunner,
        worktreeRoot: needsWorktree ? worktreePath : null,
        reviewed: entry,
      })
      console.log(
        outcome.published
          ? `ai-review publish #${String(pull.number)} label=${outcome.label}`
          : `ai-review publish skip #${String(pull.number)}: ${outcome.reason}`,
      )
    } catch (error) {
      // One bad PR must not stop the rest. The run still exits non-zero.
      failures += 1
      console.error(`ai-review publish failed #${String(pull.number)}`, error)
    } finally {
      if (branch !== null) {
        await removePullWorktree({
          repoRoot,
          worktreePath,
          branch,
          runner: gitRunner,
        })
      }
    }
  }
  if (failures > 0) {
    throw new Error(`ai-review publish: ${String(failures)} failed`)
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
