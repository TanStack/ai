/**
 * Pure classification logic: waiting-on state machine, SLA clocks, spam
 * heuristic, and per-item hygiene checks. No I/O — fixture-testable.
 */

import { isRosterMaintainer } from './config'
import { ACK_MARKER, REPRO_MARKER } from './comments'
import { matchesAnyGlob } from './glob'
import type {
  DiscussionItem,
  DiscussionTriage,
  IssueItem,
  IssueTriage,
  PRItem,
  PRTriage,
  RepoSnapshot,
  TimelineEvent,
  ToolsetConfig,
  TriageResult,
  WaitingOn,
} from './types'

export const HOUR_MS = 60 * 60 * 1000

export function hoursBetween(fromIso: string, to: Date): number {
  return (to.getTime() - new Date(fromIso).getTime()) / HOUR_MS
}

const PUBLISHED_SRC_GLOBS = ['packages/*/src/**']
const CHANGESET_GLOBS = ['.changeset/*.md']
const E2E_GLOBS = ['testing/e2e/**']

interface ResponseState {
  lastMaintainerResponseAt: string | null
  lastContributorActivityAt: string | null
  unansweredSince: string | null
  firstResponseHours: number | null
}

/**
 * Derives the conversational state of an item from its timeline.
 *
 * "Maintainer response" = a comment or review by a roster maintainer who is
 * not the item's author (your own comments on your own PR aren't responses).
 * Bot activity never counts on either side of the clock.
 */
export function deriveResponseState(
  timeline: Array<TimelineEvent>,
  author: string | null,
  createdAt: string,
  config: ToolsetConfig,
  now: Date,
): ResponseState {
  const isMaintainerResponse = (e: TimelineEvent) =>
    (e.kind === 'comment' || e.kind === 'review') &&
    !e.isBot &&
    e.actor !== null &&
    e.actor !== author &&
    isRosterMaintainer(e.actor, config)

  const isContributorActivity = (e: TimelineEvent) =>
    !e.isBot &&
    (e.actor === author ||
      e.actor === null ||
      !isRosterMaintainer(e.actor, config))

  const sorted = [...timeline].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  )

  let lastMaintainerResponseAt: string | null = null
  let firstMaintainerResponseAt: string | null = null
  let lastContributorActivityAt: string | null = null
  for (const event of sorted) {
    if (isMaintainerResponse(event)) {
      firstMaintainerResponseAt ??= event.at
      lastMaintainerResponseAt = event.at
    } else if (isContributorActivity(event)) {
      lastContributorActivityAt = event.at
    }
  }

  // Oldest contributor *message* still awaiting a reply. Pushed commits move
  // the "fresh activity" clock but don't demand a written response by
  // themselves; the item creation itself does.
  let unansweredSince: string | null = null
  if (lastMaintainerResponseAt === null) {
    unansweredSince = createdAt
  } else {
    const cutoff = new Date(lastMaintainerResponseAt).getTime()
    for (const event of sorted) {
      if (
        (event.kind === 'comment' || event.kind === 'review') &&
        isContributorActivity(event) &&
        new Date(event.at).getTime() > cutoff
      ) {
        unansweredSince = event.at
        break
      }
    }
  }

  return {
    lastMaintainerResponseAt,
    lastContributorActivityAt,
    unansweredSince,
    firstResponseHours:
      firstMaintainerResponseAt === null
        ? null
        : Math.max(
            0,
            (new Date(firstMaintainerResponseAt).getTime() -
              new Date(createdAt).getTime()) /
              HOUR_MS,
          ),
  }
}

function slaBreach(
  state: ResponseState,
  config: ToolsetConfig,
  now: Date,
): { unansweredHours: number | null; slaBreached: boolean } {
  if (state.unansweredSince === null) {
    return { unansweredHours: null, slaBreached: false }
  }
  const unansweredHours = hoursBetween(state.unansweredSince, now)
  const threshold =
    state.lastMaintainerResponseAt === null
      ? config.sla.firstResponseHours
      : config.sla.followUpResponseHours
  return { unansweredHours, slaBreached: unansweredHours > threshold }
}

function hasMarkerComment(
  timeline: Array<TimelineEvent>,
  marker: string,
): boolean {
  return timeline.some(
    (e) =>
      e.kind === 'comment' && e.body !== undefined && e.body.includes(marker),
  )
}

export function classifyPR(
  pr: PRItem,
  config: ToolsetConfig,
  now: Date,
): PRTriage {
  const bot = pr.authorIsBot
  const rosterAuthor = isRosterMaintainer(pr.author, config)
  const firstTimeContributor =
    pr.authorAssociation === 'FIRST_TIME_CONTRIBUTOR' ||
    pr.authorAssociation === 'FIRST_TIMER'

  const state = deriveResponseState(
    pr.timeline,
    pr.author,
    pr.createdAt,
    config,
    now,
  )
  const { unansweredHours, slaBreached } = slaBreach(state, config, now)

  const hasConflicts = pr.mergeable === 'CONFLICTING'
  const ciFailing = pr.ciState === 'failure'
  const approved = pr.reviewDecision === 'APPROVED'
  const readyToMerge = approved && !hasConflicts && !ciFailing && !pr.isDraft

  // Outstanding changes-requested: the decision stands and the contributor
  // hasn't commented or pushed since the last maintainer response.
  const changesRequestedOutstanding =
    pr.reviewDecision === 'CHANGES_REQUESTED' &&
    (state.lastContributorActivityAt === null ||
      (state.lastMaintainerResponseAt !== null &&
        state.lastContributorActivityAt <= state.lastMaintainerResponseAt))

  let waitingOn: WaitingOn
  let waitingReason: string
  if (bot) {
    waitingOn = 'nobody'
    waitingReason = 'bot'
  } else if (pr.isDraft) {
    waitingOn = 'author'
    waitingReason = 'draft'
  } else if (readyToMerge) {
    waitingOn = 'maintainer'
    waitingReason = 'ready-to-merge'
  } else if (hasConflicts) {
    waitingOn = 'author'
    waitingReason = 'merge-conflicts'
  } else if (ciFailing) {
    waitingOn = 'author'
    waitingReason = 'ci-failing'
  } else if (changesRequestedOutstanding) {
    waitingOn = 'author'
    waitingReason = 'changes-requested'
  } else if (
    state.lastMaintainerResponseAt !== null &&
    (state.lastContributorActivityAt === null ||
      state.lastContributorActivityAt <= state.lastMaintainerResponseAt)
  ) {
    waitingOn = 'author'
    waitingReason = 'maintainer-replied'
  } else {
    waitingOn = 'maintainer'
    waitingReason =
      state.lastMaintainerResponseAt === null ? 'no-response' : 'author-replied'
  }

  const spamReasons: Array<string> = []
  if (!bot && !rosterAuthor) {
    const trusted =
      pr.authorAssociation === 'MEMBER' ||
      pr.authorAssociation === 'OWNER' ||
      pr.authorAssociation === 'COLLABORATOR'
    const accountAgeDays =
      pr.authorAccountCreatedAt === null
        ? null
        : hoursBetween(pr.authorAccountCreatedAt, now) / 24
    if (
      !trusted &&
      accountAgeDays !== null &&
      accountAgeDays < config.spam.maxAccountAgeDays
    ) {
      spamReasons.push(`account is ${Math.floor(accountAgeDays)}d old`)
    }
    if (
      !trusted &&
      pr.additions + pr.deletions <= config.spam.maxChangedLines
    ) {
      spamReasons.push(`trivial diff (+${pr.additions}/−${pr.deletions})`)
    }
    if (!trusted && pr.linkedIssues.length === 0) {
      spamReasons.push('no linked issue')
    }
  }
  // All three signals together → likely drive-by bounty farming.
  const suspectedSpam = spamReasons.length === 3

  const touchesPublished = pr.files.some((f) =>
    matchesAnyGlob(f, PUBLISHED_SRC_GLOBS),
  )
  const missingChangeset =
    touchesPublished &&
    !pr.files.some((f) => matchesAnyGlob(f, CHANGESET_GLOBS))
  const missingE2E =
    touchesPublished && !pr.files.some((f) => matchesAnyGlob(f, E2E_GLOBS))

  const freshContributorReply =
    state.lastContributorActivityAt !== null &&
    (state.lastMaintainerResponseAt === null ||
      state.lastContributorActivityAt > state.lastMaintainerResponseAt)

  const staleAuthor =
    waitingOn === 'author' &&
    !pr.isDraft &&
    hoursBetween(state.lastContributorActivityAt ?? pr.createdAt, now) / 24 >
      config.sla.staleAuthorDays

  return {
    item: pr,
    bot,
    rosterAuthor,
    firstTimeContributor,
    suspectedSpam,
    spamReasons,
    waitingOn,
    waitingReason,
    readyToMerge,
    hasConflicts,
    ciFailing,
    missingChangeset,
    missingE2E,
    lastMaintainerResponseAt: state.lastMaintainerResponseAt,
    lastContributorActivityAt: state.lastContributorActivityAt,
    unansweredSince: state.unansweredSince,
    unansweredHours,
    slaBreached: !bot && !rosterAuthor && slaBreached && !pr.isDraft,
    firstResponseHours: state.firstResponseHours,
    freshContributorReply,
    staleAuthor,
    hasAckComment: hasMarkerComment(pr.timeline, ACK_MARKER),
    suggestedAssignee: null,
  }
}

function bodyHasReproSignal(body: string): boolean {
  return /https?:\/\//.test(body) || body.includes('```')
}

export function classifyIssue(
  issue: IssueItem,
  config: ToolsetConfig,
  now: Date,
  openPRIssueNumbers: Set<number>,
): IssueTriage {
  const bot = issue.authorIsBot
  const rosterAuthor = isRosterMaintainer(issue.author, config)
  const state = deriveResponseState(
    issue.timeline,
    issue.author,
    issue.createdAt,
    config,
    now,
  )
  const { unansweredHours, slaBreached } = slaBreach(state, config, now)

  let waitingOn: WaitingOn
  if (bot) {
    waitingOn = 'nobody'
  } else if (
    state.lastMaintainerResponseAt !== null &&
    (state.lastContributorActivityAt === null ||
      state.lastContributorActivityAt <= state.lastMaintainerResponseAt)
  ) {
    waitingOn = 'author'
  } else {
    waitingOn = 'maintainer'
  }

  const staleAuthor =
    waitingOn === 'author' &&
    hoursBetween(state.lastContributorActivityAt ?? issue.createdAt, now) / 24 >
      config.sla.staleAuthorDays

  return {
    item: issue,
    bot,
    rosterAuthor,
    waitingOn,
    needsRepro: !bot && !rosterAuthor && !bodyHasReproSignal(issue.body),
    hasOpenPR: openPRIssueNumbers.has(issue.number),
    lastMaintainerResponseAt: state.lastMaintainerResponseAt,
    lastContributorActivityAt: state.lastContributorActivityAt,
    unansweredSince: state.unansweredSince,
    unansweredHours,
    slaBreached: !bot && !rosterAuthor && slaBreached,
    firstResponseHours: state.firstResponseHours,
    staleAuthor,
    hasReproComment: hasMarkerComment(issue.timeline, REPRO_MARKER),
    suggestedAssignee: null,
  }
}

export function classifyDiscussion(
  discussion: DiscussionItem,
  config: ToolsetConfig,
  now: Date,
): DiscussionTriage {
  const maintainerReplied = discussion.comments.some(
    (c) => !c.isBot && isRosterMaintainer(c.actor, config),
  )
  const needsAttention = !discussion.isAnswered && !maintainerReplied
  const lastActivity =
    discussion.comments.length > 0
      ? discussion.comments[discussion.comments.length - 1]!.at
      : discussion.createdAt
  return {
    item: discussion,
    needsAttention,
    waitingHours: Math.max(0, hoursBetween(lastActivity, now)),
  }
}

export function classifyAll(
  snapshot: RepoSnapshot,
  config: ToolsetConfig,
  now: Date = new Date(snapshot.takenAt),
): TriageResult {
  const openPRIssueNumbers = new Set(
    snapshot.prs.flatMap((pr) => pr.linkedIssues),
  )
  return {
    prs: snapshot.prs.map((pr) => classifyPR(pr, config, now)),
    issues: snapshot.issues.map((issue) =>
      classifyIssue(issue, config, now, openPRIssueNumbers),
    ),
    discussions: snapshot.discussions.map((d) =>
      classifyDiscussion(d, config, now),
    ),
  }
}
