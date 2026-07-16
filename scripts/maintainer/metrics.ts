/**
 * Scorecard computation: turns a snapshot + triage into the daily digest's
 * sections and stats. Pure — no I/O.
 */

import { deriveResponseState } from './classify'
import { computeLoad, routePR } from './route'
import type {
  DiscussionTriage,
  IssueTriage,
  PRTriage,
  RepoSnapshot,
  ToolsetConfig,
  TriageResult,
} from './types'

const DAY_MS = 24 * 60 * 60 * 1000

export interface MaintainerQueue {
  github: string
  discord: string | null
  assignedPRs: Array<PRTriage>
  assignedIssues: Array<IssueTriage>
  /** Assigned items where the contributor replied after our last response. */
  freshReplies: Array<PRTriage | IssueTriage>
}

export interface ScorecardStats {
  openPRs: number
  openIssues: number
  openPRsDelta7d: number
  openIssuesDelta7d: number
  mergedLast24h: number
  issuesClosedLast24h: number
  medianFirstResponseHours: number | null
  p90FirstResponseHours: number | null
  firstResponseSampleSize: number
  awaitingFirstResponse: number
  pctPRsAssigned: number
  unansweredDiscussions: number
  botPRs: number
  pendingChangesets: number
}

export interface Scorecard {
  /** Waiting on a maintainer past SLA, oldest wait first. */
  answerThese: Array<PRTriage | IssueTriage>
  /** Approved + green + conflict-free. */
  readyToMerge: Array<PRTriage>
  perMaintainer: Array<MaintainerQueue>
  newPRs: Array<PRTriage>
  newIssues: Array<IssueTriage>
  newDiscussions: Array<DiscussionTriage>
  /** Suspected drive-by/bounty PRs needing a human call before any ack. */
  flagged: Array<PRTriage>
  /** Waiting on author past the stale threshold — nudge/close candidates. */
  stale: Array<PRTriage | IssueTriage>
  discussionsNeedingAttention: Array<DiscussionTriage>
  /** Authors with several open PRs — review as a batch. */
  clusters: Array<{ author: string; count: number }>
  unassignable: Array<PRTriage>
  stats: ScorecardStats
}

export function percentile(values: Array<number>, p: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(
    sorted.length - 1,
    Math.ceil((p / 100) * sorted.length) - 1,
  )
  return sorted[Math.max(0, idx)]!
}

export function formatDuration(hours: number): string {
  if (hours < 1) return '<1h'
  if (hours < 48) return `${Math.round(hours)}h`
  return `${Math.round(hours / 24)}d`
}

function openAtCount(
  openCreatedAts: Array<string>,
  closed: Array<{ createdAt: string; closedAt: string }>,
  at: Date,
): number {
  const t = at.getTime()
  const stillOpen = openCreatedAts.filter(
    (c) => new Date(c).getTime() <= t,
  ).length
  const closedAfter = closed.filter(
    (c) =>
      new Date(c.createdAt).getTime() <= t &&
      new Date(c.closedAt).getTime() > t,
  ).length
  return stillOpen + closedAfter
}

export function computeScorecard(
  snapshot: RepoSnapshot,
  triage: TriageResult,
  config: ToolsetConfig,
  now: Date,
  pendingChangesets: number,
): Scorecard {
  const humanPRs = triage.prs.filter((t) => !t.bot)
  const humanIssues = triage.issues.filter((t) => !t.bot)
  const dayAgo = new Date(now.getTime() - DAY_MS)
  const weekAgo = new Date(now.getTime() - 7 * DAY_MS)

  const answerThese = [...humanPRs, ...humanIssues]
    .filter((t) => t.slaBreached && t.waitingOn === 'maintainer')
    .sort((a, b) => (b.unansweredHours ?? 0) - (a.unansweredHours ?? 0))

  const readyToMerge = humanPRs.filter((t) => t.readyToMerge)

  const perMaintainer: Array<MaintainerQueue> = config.maintainers.map((m) => {
    const mine = (assignees: Array<string>) =>
      assignees.some((a) => a.toLowerCase() === m.github.toLowerCase())
    const assignedPRs = humanPRs.filter((t) => mine(t.item.assignees))
    const assignedIssues = humanIssues.filter((t) => mine(t.item.assignees))
    return {
      github: m.github,
      discord: m.discord ?? null,
      assignedPRs,
      assignedIssues,
      freshReplies: [...assignedPRs, ...assignedIssues].filter(
        (t) =>
          ('freshContributorReply' in t
            ? t.freshContributorReply
            : t.waitingOn === 'maintainer') && t.waitingOn === 'maintainer',
      ),
    }
  })

  const isNew = (createdAt: string) => new Date(createdAt) >= dayAgo
  const newPRs = humanPRs.filter((t) => isNew(t.item.createdAt))
  const newIssues = humanIssues.filter((t) => isNew(t.item.createdAt))
  const newDiscussions = triage.discussions.filter((t) =>
    isNew(t.item.createdAt),
  )

  const flagged = humanPRs.filter((t) => t.suspectedSpam)
  const stale = [...humanPRs, ...humanIssues].filter((t) => t.staleAuthor)
  const discussionsNeedingAttention = triage.discussions
    .filter((t) => t.needsAttention)
    .sort((a, b) => b.waitingHours - a.waitingHours)

  const clusterCounts = new Map<string, number>()
  for (const t of humanPRs) {
    if (t.item.author && !t.rosterAuthor) {
      clusterCounts.set(
        t.item.author,
        (clusterCounts.get(t.item.author) ?? 0) + 1,
      )
    }
  }
  const clusters = [...clusterCounts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)

  // Simulate the sweep's routing over unassigned PRs: only the ones that
  // still route nowhere (everyone at cap) are genuinely unassignable.
  const load = computeLoad(config, [
    ...snapshot.prs.map((pr) => pr.assignees),
    ...snapshot.issues.map((issue) => issue.assignees),
  ])
  const unassignable: Array<PRTriage> = []
  for (const t of humanPRs) {
    if (t.item.isDraft || t.suspectedSpam || t.item.assignees.length > 0) {
      continue
    }
    const routed = routePR(
      t.item.files,
      t.item.author,
      config,
      load,
      t.item.number,
    )
    if (routed === null) unassignable.push(t)
    else load.set(routed, (load.get(routed) ?? 0) + 1)
  }

  // --- Stats ---
  const closedPRs = snapshot.recentlyClosed.filter((c) => c.type === 'pr')
  const closedIssues = snapshot.recentlyClosed.filter((c) => c.type === 'issue')

  const openPRs = humanPRs.length
  const openIssues = humanIssues.length
  const openPRsDelta7d =
    openPRs -
    openAtCount(
      humanPRs.map((t) => t.item.createdAt),
      closedPRs.filter((c) => !c.authorIsBot),
      weekAgo,
    )
  const openIssuesDelta7d =
    openIssues -
    openAtCount(
      humanIssues.map((t) => t.item.createdAt),
      closedIssues.filter((c) => !c.authorIsBot),
      weekAgo,
    )

  const mergedLast24h = closedPRs.filter(
    (c) => c.mergedAt !== null && new Date(c.mergedAt) >= dayAgo,
  ).length
  const issuesClosedLast24h = closedIssues.filter(
    (c) => new Date(c.closedAt) >= dayAgo,
  ).length

  // First-response distribution over non-bot items created in the last 7 days
  // (both still-open and recently-closed).
  const responseSamples: Array<number> = []
  let awaitingFirstResponse = 0
  const openRecent = [...humanPRs, ...humanIssues].filter(
    (t) => new Date(t.item.createdAt) >= weekAgo && !t.rosterAuthor,
  )
  for (const t of openRecent) {
    if (t.firstResponseHours !== null)
      responseSamples.push(t.firstResponseHours)
    else awaitingFirstResponse++
  }
  for (const c of snapshot.recentlyClosed) {
    if (c.authorIsBot || new Date(c.createdAt) < weekAgo) continue
    const state = deriveResponseState(
      c.timeline,
      c.author,
      c.createdAt,
      config,
      now,
    )
    if (state.firstResponseHours !== null) {
      responseSamples.push(state.firstResponseHours)
    }
  }

  const assignablePRs = humanPRs.filter((t) => !t.item.isDraft)
  const pctPRsAssigned =
    assignablePRs.length === 0
      ? 100
      : Math.round(
          (assignablePRs.filter((t) => t.item.assignees.length > 0).length /
            assignablePRs.length) *
            100,
        )

  return {
    answerThese,
    readyToMerge,
    perMaintainer,
    newPRs,
    newIssues,
    newDiscussions,
    flagged,
    stale,
    discussionsNeedingAttention,
    clusters,
    unassignable,
    stats: {
      openPRs,
      openIssues,
      openPRsDelta7d,
      openIssuesDelta7d,
      mergedLast24h,
      issuesClosedLast24h,
      medianFirstResponseHours: percentile(responseSamples, 50),
      p90FirstResponseHours: percentile(responseSamples, 90),
      firstResponseSampleSize: responseSamples.length,
      awaitingFirstResponse,
      pctPRsAssigned,
      unansweredDiscussions: discussionsNeedingAttention.length,
      botPRs: triage.prs.length - humanPRs.length,
      pendingChangesets,
    },
  }
}
