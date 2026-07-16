/**
 * Shared types for the maintainer toolset (sweep + scorecard).
 *
 * The data layer (collect.ts) normalizes GitHub GraphQL responses into these
 * shapes; everything downstream (classify.ts, route.ts, metrics.ts) is pure
 * and operates only on these types, so it can be unit-tested with fixtures.
 */

export type CIState = 'success' | 'failure' | 'pending' | 'unknown'

export interface TimelineEvent {
  kind: 'comment' | 'review' | 'commit'
  /** GitHub login, or null when the account was deleted / unresolvable. */
  actor: string | null
  isBot: boolean
  /** ISO timestamp. */
  at: string
  /** Only present for comments; used for bot-marker detection. */
  body?: string
  /** Only present for reviews: APPROVED | CHANGES_REQUESTED | COMMENTED | DISMISSED. */
  reviewState?: string
}

export interface PRItem {
  type: 'pr'
  number: number
  title: string
  url: string
  author: string | null
  authorIsBot: boolean
  /** ISO timestamp of the author account creation, when resolvable. */
  authorAccountCreatedAt: string | null
  authorAssociation: string
  createdAt: string
  updatedAt: string
  isDraft: boolean
  /** MERGEABLE | CONFLICTING | UNKNOWN */
  mergeable: string
  /** '' | APPROVED | CHANGES_REQUESTED | REVIEW_REQUIRED */
  reviewDecision: string
  additions: number
  deletions: number
  changedFiles: number
  /** Paths of changed files (capped at 100 by the API query). */
  files: Array<string>
  labels: Array<string>
  assignees: Array<string>
  ciState: CIState
  /** Issue numbers this PR closes (via closingIssuesReferences). */
  linkedIssues: Array<number>
  timeline: Array<TimelineEvent>
}

export interface IssueItem {
  type: 'issue'
  number: number
  title: string
  url: string
  author: string | null
  authorIsBot: boolean
  authorAssociation: string
  createdAt: string
  updatedAt: string
  body: string
  labels: Array<string>
  assignees: Array<string>
  timeline: Array<TimelineEvent>
}

export interface DiscussionItem {
  type: 'discussion'
  number: number
  title: string
  url: string
  author: string | null
  createdAt: string
  updatedAt: string
  isAnswered: boolean
  category: string
  upvotes: number
  commentCount: number
  /** Most recent comments (login + timestamp), newest last. */
  comments: Array<{ actor: string | null; isBot: boolean; at: string }>
}

/** Minimal record of a recently closed PR/issue, for scorecard trend metrics. */
export interface ClosedItem {
  type: 'pr' | 'issue'
  number: number
  title: string
  url: string
  author: string | null
  authorIsBot: boolean
  createdAt: string
  closedAt: string
  /** Only for PRs; null when closed without merging. */
  mergedAt: string | null
  /** Comment/review events, enough to compute first-response time. */
  timeline: Array<TimelineEvent>
}

export interface RepoSnapshot {
  owner: string
  repo: string
  /** ISO timestamp the snapshot was taken. */
  takenAt: string
  prs: Array<PRItem>
  issues: Array<IssueItem>
  discussions: Array<DiscussionItem>
  /** PRs and issues closed within the lookback window (14 days). */
  recentlyClosed: Array<ClosedItem>
}

// --- Configuration (.github/maintainers.json) ---

export interface MaintainerEntry {
  github: string
  /** Discord user id (snowflake) for @-mentions in the digest; null → plain text. */
  discord?: string | null
  /** File globs this maintainer owns; used to route PR assignment. */
  areas: Array<string>
  /** Routing skips this maintainer once they have this many open assignments. */
  maxOpenAssignments?: number
}

export interface SlaConfig {
  /** Hours before an item with no maintainer response ever counts as breached. */
  firstResponseHours: number
  /** Hours to answer a follow-up message on an already-touched item. */
  followUpResponseHours: number
  /** Days of author silence before a waiting-on-author item counts as stale. */
  staleAuthorDays: number
}

export interface SpamConfig {
  /** Author accounts younger than this are eligible for the spam flag. */
  maxAccountAgeDays: number
  /** Diffs at or under this many changed lines are eligible for the spam flag. */
  maxChangedLines: number
}

export interface ToolsetConfig {
  /** owner/repo, e.g. "TanStack/ai". */
  repo: string
  maintainers: Array<MaintainerEntry>
  sla: SlaConfig
  spam: SpamConfig
  /** Logins (without [bot] suffix) always treated as bots, e.g. "renovate". */
  botAllowlist: Array<string>
  /** Safety cap on comments posted per sweep run. */
  maxCommentsPerRun: number
}

// --- Classification output ---

export type WaitingOn = 'maintainer' | 'author' | 'nobody'

export interface PRTriage {
  item: PRItem
  bot: boolean
  rosterAuthor: boolean
  firstTimeContributor: boolean
  suspectedSpam: boolean
  spamReasons: Array<string>
  waitingOn: WaitingOn
  waitingReason: string
  readyToMerge: boolean
  hasConflicts: boolean
  ciFailing: boolean
  missingChangeset: boolean
  missingE2E: boolean
  /** Last comment/review by a roster maintainer who isn't the PR author. */
  lastMaintainerResponseAt: string | null
  /** Last non-bot comment/commit by the author or a third party. */
  lastContributorActivityAt: string | null
  /** Oldest contributor message (or PR creation) still awaiting a maintainer reply. */
  unansweredSince: string | null
  /** Hours the oldest unanswered message has been waiting. */
  unansweredHours: number | null
  slaBreached: boolean
  /** Hours from creation to first maintainer response; null if none yet. */
  firstResponseHours: number | null
  /** Contributor activity newer than the last maintainer response. */
  freshContributorReply: boolean
  staleAuthor: boolean
  hasAckComment: boolean
  /** Set by the sweep when the PR is unassigned and routable. */
  suggestedAssignee: string | null
}

export interface IssueTriage {
  item: IssueItem
  bot: boolean
  rosterAuthor: boolean
  waitingOn: WaitingOn
  needsRepro: boolean
  hasOpenPR: boolean
  lastMaintainerResponseAt: string | null
  lastContributorActivityAt: string | null
  unansweredSince: string | null
  unansweredHours: number | null
  slaBreached: boolean
  firstResponseHours: number | null
  staleAuthor: boolean
  hasReproComment: boolean
  suggestedAssignee: string | null
}

export interface DiscussionTriage {
  item: DiscussionItem
  /** True when unanswered and no roster maintainer has commented. */
  needsAttention: boolean
  /** Hours since the last comment (or creation) on a needs-attention discussion. */
  waitingHours: number
}

export interface TriageResult {
  prs: Array<PRTriage>
  issues: Array<IssueTriage>
  discussions: Array<DiscussionTriage>
}
