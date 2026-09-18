/**
 * Maintainer sweep — runs on a schedule (every few hours). For every open PR
 * and issue it:
 *   - routes an owner and reviewer (core approval → load → areas)
 *   - posts a one-time ack comment with a deterministic pre-review checklist
 *   - reconciles `waiting-on:*` / `ready-to-merge` / `needs-repro` / `has-pr`
 *     labels so triage state is visible in the GitHub UI
 *   - asks for a reproduction on bug reports that lack one
 *
 * Suspected drive-by/bounty PRs are left untouched (no ack, no assignment) —
 * they surface in the daily Discord digest for a human call instead.
 *
 * Read/write via the GitHub API only; PR code is never checked out or
 * executed. Idempotent: safe to re-run at any time.
 *
 * Usage: tsx scripts/maintainer/sweep.ts [--dry-run]
 */

import process from 'node:process'
import { pathToFileURL } from 'node:url'
import {
  describeMutation,
  ensureManagedLabels,
  executeMutations,
  planLabelChanges,
} from './actions'
import { classifyAll } from './classify'
import { collectSnapshot } from './collect'
import { buildAckComment, buildReproComment } from './comments'
import { loadConfig } from './config'
import { createGitHubClient } from './github'
import { computeLoad, requiresCoreReview, routeIssue, routePR } from './route'
import { isDryRun, resolveToken, writeStepSummary } from './env'
import type { Mutation } from './actions'
import type { RepoSnapshot, ToolsetConfig } from './types'

export interface SweepPlan {
  mutations: Array<Mutation>
  skippedAsSpam: Array<number>
  commentsSuppressedByCap: number
}

export function planSweep(
  snapshot: RepoSnapshot,
  config: ToolsetConfig,
): SweepPlan {
  const triage = classifyAll(snapshot, config)
  const prLoad = computeLoad(
    config,
    snapshot.prs.map((pr) => pr.assignees),
  )
  const issueLoad = computeLoad(
    config,
    snapshot.issues.map((issue) => issue.assignees),
  )

  const mutations: Array<Mutation> = []
  const skippedAsSpam: Array<number> = []
  let comments = 0
  let commentsSuppressedByCap = 0
  const addComment = (m: Mutation & { kind: 'comment' }) => {
    if (comments < config.maxCommentsPerRun) {
      mutations.push(m)
      comments++
    } else {
      commentsSuppressedByCap++
    }
  }

  for (const t of [...triage.prs].sort(
    (a, b) =>
      Number(requiresCoreReview(b.item.files, snapshot.codeowners)) -
        Number(requiresCoreReview(a.item.files, snapshot.codeowners)) ||
      a.item.number - b.item.number,
  )) {
    const pr = t.item
    if (t.bot) continue
    if (t.suspectedSpam) {
      skippedAsSpam.push(pr.number)
      continue
    }
    if (pr.isDraft) continue

    let assignee = pr.assignees[0] ?? null
    if (assignee === null) {
      const routed = routePR(
        pr.files,
        pr.author,
        config,
        prLoad,
        pr.number,
        snapshot.codeowners,
        snapshot.recentlyClosed,
      )
      if (routed !== null) {
        mutations.push({ kind: 'assign', number: pr.number, assignee: routed })
        prLoad.set(routed, (prLoad.get(routed) ?? 0) + 1)
        t.suggestedAssignee = routed
        assignee = routed
      }
    }

    // Repair partial runs: assignment may succeed before review request fails.
    for (const reviewer of new Set([
      ...pr.assignees,
      ...(assignee ? [assignee] : []),
    ])) {
      if (reviewer.toLowerCase() === pr.author?.toLowerCase()) continue
      const requested = pr.requestedReviewers.some(
        (login) => login.toLowerCase() === reviewer.toLowerCase(),
      )
      const reviewed = pr.timeline.some(
        (e) =>
          e.kind === 'review' &&
          e.actor?.toLowerCase() === reviewer.toLowerCase() &&
          e.reviewState !== 'PENDING',
      )
      if (!requested && !reviewed)
        mutations.push({ kind: 'request-review', number: pr.number, reviewer })
    }

    if (!t.hasAckComment && !t.rosterAuthor && assignee !== null) {
      addComment({
        kind: 'comment',
        number: pr.number,
        body: buildAckComment(t, assignee),
        note: 'ack + pre-review checklist',
      })
    }

    const desired: Array<string> = []
    if (t.readyToMerge) desired.push('ready-to-merge')
    if (t.hasConflicts) desired.push('merge-conflicts')
    if (t.waitingOn === 'maintainer') desired.push('waiting-on: maintainer')
    if (t.waitingOn === 'author') desired.push('waiting-on: author')
    mutations.push(...planLabelChanges(pr.number, pr.labels, desired))
  }

  for (const t of triage.issues) {
    const issue = t.item
    if (t.bot) continue

    if (issue.assignees.length === 0) {
      const routed = routeIssue(
        `${issue.title}\n${issue.body}`,
        issue.author,
        config,
        issueLoad,
        issue.number,
      )
      if (routed !== null) {
        mutations.push({
          kind: 'assign',
          number: issue.number,
          assignee: routed,
        })
        issueLoad.set(routed, (issueLoad.get(routed) ?? 0) + 1)
        t.suggestedAssignee = routed
      }
    }

    if (t.needsRepro && !t.hasReproComment && !t.rosterAuthor) {
      addComment({
        kind: 'comment',
        number: issue.number,
        body: buildReproComment(issue.author),
        note: 'reproduction request',
      })
    }

    const desired: Array<string> = []
    if (t.waitingOn === 'maintainer') desired.push('waiting-on: maintainer')
    if (t.waitingOn === 'author') desired.push('waiting-on: author')
    if (t.needsRepro) desired.push('needs-repro')
    if (t.hasOpenPR) desired.push('has-pr')
    mutations.push(...planLabelChanges(issue.number, issue.labels, desired))
  }

  return { mutations, skippedAsSpam, commentsSuppressedByCap }
}

function summarize(plan: SweepPlan, dryRun: boolean): string {
  const lines = [
    `## Maintainer sweep ${dryRun ? '(dry run)' : ''}`,
    '',
    `Planned mutations: **${plan.mutations.length}**`,
    '',
    ...plan.mutations.map((m) => `- ${describeMutation(m)}`),
  ]
  if (plan.skippedAsSpam.length > 0) {
    lines.push(
      '',
      `⚠️ Left untouched pending human judgment (suspected drive-by): ${plan.skippedAsSpam.map((n) => `#${n}`).join(', ')}`,
    )
  }
  if (plan.commentsSuppressedByCap > 0) {
    lines.push(
      '',
      `${plan.commentsSuppressedByCap} comment(s) deferred to the next run by the per-run cap.`,
    )
  }
  return lines.join('\n')
}

async function main(): Promise<void> {
  const dryRun = isDryRun()
  const config = await loadConfig()
  const client = createGitHubClient({ token: await resolveToken() })

  console.log(`Collecting snapshot of ${config.repo}…`)
  const snapshot = await collectSnapshot(client, config)
  console.log(
    `Open: ${snapshot.prs.length} PRs, ${snapshot.issues.length} issues, ${snapshot.discussions.length} discussions.`,
  )

  const plan = planSweep(snapshot, config)
  const summary = summarize(plan, dryRun)
  console.log(summary)
  await writeStepSummary(summary)

  if (dryRun) {
    console.log('\nDry run — nothing executed.')
    return
  }

  await ensureManagedLabels(client, config.repo)
  await executeMutations(client, config.repo, plan.mutations)
  console.log(`Executed ${plan.mutations.length} mutation(s).`)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (isDirectRun) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
