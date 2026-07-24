/** Test fixture builders. NOW is the frozen reference time for all tests. */

import type {
  DiscussionItem,
  IssueItem,
  PRItem,
  TimelineEvent,
  ToolsetConfig,
} from './types'

export const NOW = new Date('2026-07-16T00:00:00Z')

export function hoursAgo(h: number): string {
  return new Date(NOW.getTime() - h * 60 * 60 * 1000).toISOString()
}

export function daysAgo(d: number): string {
  return hoursAgo(d * 24)
}

export const config: ToolsetConfig = {
  repo: 'TanStack/ai',
  maintainers: [
    {
      github: 'tom',
      discord: '111',
      areas: ['packages/ai-sandbox*/**', 'packages/ai-claude-code/**'],
      maxOpenAssignments: 5,
    },
    {
      github: 'alem',
      discord: null,
      areas: ['packages/ai/**', 'packages/ai-client/**'],
      maxOpenAssignments: 5,
    },
    {
      github: 'jack',
      discord: null,
      areas: ['docs/**', 'examples/**'],
      maxOpenAssignments: 5,
    },
  ],
  sla: {
    firstResponseHours: 24,
    followUpResponseHours: 48,
    staleAuthorDays: 14,
  },
  spam: { maxAccountAgeDays: 30, maxChangedLines: 30 },
  botAllowlist: ['renovate'],
  maxCommentsPerRun: 25,
}

export function comment(
  actor: string,
  at: string,
  body = '',
  isBot = false,
): TimelineEvent {
  return { kind: 'comment', actor, isBot, at, body }
}

export function review(
  actor: string,
  at: string,
  reviewState: string,
): TimelineEvent {
  return { kind: 'review', actor, isBot: false, at, reviewState }
}

export function commit(actor: string, at: string): TimelineEvent {
  return { kind: 'commit', actor, isBot: false, at }
}

export function makePR(overrides: Partial<PRItem> = {}): PRItem {
  const number = overrides.number ?? 100
  return {
    type: 'pr',
    number,
    title: 'feat: add thing',
    url: `https://github.com/TanStack/ai/pull/${number}`,
    author: 'contributor',
    authorIsBot: false,
    authorAccountCreatedAt: daysAgo(400),
    authorAssociation: 'CONTRIBUTOR',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    isDraft: false,
    mergeable: 'MERGEABLE',
    reviewDecision: '',
    additions: 120,
    deletions: 30,
    changedFiles: 4,
    files: ['packages/ai/src/core/chat.ts', '.changeset/nice-fix.md'],
    labels: [],
    assignees: [],
    ciState: 'success',
    linkedIssues: [50],
    timeline: [],
    ...overrides,
  }
}

export function makeIssue(overrides: Partial<IssueItem> = {}): IssueItem {
  return {
    type: 'issue',
    number: 200,
    title: 'bug: chat streaming breaks',
    url: 'https://github.com/TanStack/ai/issues/200',
    author: 'reporter',
    authorIsBot: false,
    authorAssociation: 'NONE',
    createdAt: daysAgo(2),
    updatedAt: daysAgo(1),
    body: 'It breaks. Repro: https://stackblitz.com/x',
    labels: [],
    assignees: [],
    timeline: [],
    ...overrides,
  }
}

export function makeDiscussion(
  overrides: Partial<DiscussionItem> = {},
): DiscussionItem {
  return {
    type: 'discussion',
    number: 300,
    title: 'How do I use tools?',
    url: 'https://github.com/TanStack/ai/discussions/300',
    author: 'asker',
    createdAt: daysAgo(3),
    updatedAt: daysAgo(3),
    isAnswered: false,
    category: 'Q&A',
    upvotes: 2,
    commentCount: 0,
    comments: [],
    ...overrides,
  }
}
