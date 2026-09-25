import { describe, expect, it } from 'vitest'
import { classifyAll } from './classify'
import { buildScorecardEmbeds, chunkEmbeds } from './discord'
import { computeScorecard, formatDuration, percentile } from './metrics'
import {
  NOW,
  review,
  comment,
  config,
  daysAgo,
  hoursAgo,
  makeDiscussion,
  makeIssue,
  makePR,
} from './fixtures'
import type { RepoSnapshot } from './types'

function snapshotFixture(): RepoSnapshot {
  return {
    codeowners: '',
    owner: 'TanStack',
    repo: 'ai',
    takenAt: NOW.toISOString(),
    prs: [
      // breached: no response for 3 days
      makePR({ number: 1, createdAt: daysAgo(3) }),
      // ready to merge, assigned to tom, created 10 days ago
      makePR({
        number: 2,
        createdAt: daysAgo(10),
        reviewDecision: 'APPROVED',
        assignees: ['tom'],
        timeline: [comment('alem', daysAgo(9), 'lgtm')],
      }),
      // assigned to tom with a fresh contributor reply
      makePR({
        number: 3,
        createdAt: daysAgo(10),
        assignees: ['tom'],
        timeline: [
          comment('tom', daysAgo(5), 'please change x'),
          comment('contributor', daysAgo(1), 'done!'),
        ],
      }),
      // new PR in the last 24h from a first-time contributor
      makePR({
        number: 4,
        author: 'newbie',
        createdAt: hoursAgo(5),
        authorAssociation: 'FIRST_TIME_CONTRIBUTOR',
      }),
      // bot PR — excluded from human metrics
      makePR({ number: 5, author: 'renovate[bot]', authorIsBot: true }),
      // stale: conflicts, author silent 20 days
      makePR({
        number: 6,
        createdAt: daysAgo(40),
        mergeable: 'CONFLICTING',
        author: 'clusterguy',
        timeline: [
          comment('alem', daysAgo(25), 'rebase please'),
          comment('clusterguy', daysAgo(20), 'ok'),
        ],
      }),
      // cluster: same author, three open PRs
      makePR({ number: 7, author: 'clusterguy', createdAt: daysAgo(2) }),
      makePR({ number: 8, author: 'clusterguy', createdAt: daysAgo(2) }),
    ],
    issues: [
      makeIssue({ number: 20, createdAt: hoursAgo(50) }), // breached
    ],
    discussions: [
      makeDiscussion({ number: 30 }),
      makeDiscussion({
        number: 31,
        comments: [{ actor: 'jack', isBot: false, at: daysAgo(1) }],
      }),
    ],
    recentlyClosed: [
      {
        type: 'pr',
        number: 90,
        title: 'merged yesterday',
        url: 'https://github.com/TanStack/ai/pull/90',
        author: 'contributor',
        authorIsBot: false,
        createdAt: daysAgo(3),
        closedAt: hoursAgo(10),
        mergedAt: hoursAgo(10),
        timeline: [comment('alem', daysAgo(2), 'nice')],
      },
      {
        type: 'issue',
        number: 91,
        title: 'closed 5 days ago',
        url: 'https://github.com/TanStack/ai/issues/91',
        author: 'contributor',
        authorIsBot: false,
        createdAt: daysAgo(12),
        closedAt: daysAgo(5),
        mergedAt: null,
        timeline: [],
      },
    ],
  }
}

describe('computeScorecard', () => {
  const snapshot = snapshotFixture()
  const triage = classifyAll(snapshot, config, NOW)
  const scorecard = computeScorecard(snapshot, triage, config, NOW, 3)

  it('surfaces SLA breaches sorted by longest wait', () => {
    const numbers = scorecard.answerThese.map((t) => t.item.number)
    expect(numbers).toContain(1)
    expect(numbers).toContain(20)
    const hours = scorecard.answerThese.map((t) => t.unansweredHours ?? 0)
    expect(hours).toEqual([...hours].sort((a, b) => b - a))
  })

  it('finds ready-to-merge PRs', () => {
    expect(scorecard.readyToMerge.map((t) => t.item.number)).toEqual([2])
  })

  it('builds per-maintainer queues with fresh replies', () => {
    const tom = scorecard.perMaintainer.find((q) => q.github === 'tom')!
    expect(tom.assignedPRs.map((t) => t.item.number).sort()).toEqual([2, 3])
    expect(tom.freshReplies.map((t) => t.item.number)).toContain(3)
  })

  it('lists new items and flags first-time contributors', () => {
    expect(scorecard.newPRs.map((t) => t.item.number)).toEqual([4])
    expect(scorecard.newPRs[0]!.firstTimeContributor).toBe(true)
  })

  it('detects stale items and same-author clusters', () => {
    expect(scorecard.stale.map((t) => t.item.number)).toContain(6)
    expect(scorecard.clusters).toContainEqual({
      author: 'clusterguy',
      count: 3,
    })
  })

  it('excludes bots from open counts but reports them', () => {
    expect(scorecard.stats.openPRs).toBe(7)
    expect(scorecard.stats.botPRs).toBe(1)
  })

  it('computes 7-day open deltas from created/closed timestamps', () => {
    // PRs open 7d ago: #1..#3 no (created <7d? #1 3d→no)… recompute:
    // created ≤ 7d ago and still open: #2, #3, #6 → 3; closed-after: none
    // (PR #90 created 3d ago). Now open: 7 → delta +4.
    expect(scorecard.stats.openPRsDelta7d).toBe(4)
    // Issues: open now 1 (created 50h ago). 7d ago: #91 was open → 1. Delta 0.
    expect(scorecard.stats.openIssuesDelta7d).toBe(0)
  })

  it('counts merges and closes in the last 24h', () => {
    expect(scorecard.stats.mergedLast24h).toBe(1)
    expect(scorecard.stats.issuesClosedLast24h).toBe(0)
  })

  it('computes first-response stats over items created in the last 7 days', () => {
    // Samples: PR #90 closed (24h response). Open items created <7d with a
    // response: none. Awaiting: #1, #4, #7, #8, #20.
    expect(scorecard.stats.firstResponseSampleSize).toBe(1)
    expect(scorecard.stats.medianFirstResponseHours).toBeCloseTo(24, 0)
    expect(scorecard.stats.awaitingFirstResponse).toBe(5)
  })

  it('reports unanswered discussions and pending changesets', () => {
    expect(scorecard.stats.unansweredDiscussions).toBe(1)
    expect(scorecard.stats.pendingChangesets).toBe(3)
  })

  it('does not mark PRs unassignable when the old caps are reached', () => {
    // Generous caps: everything unassigned routes somewhere.
    expect(scorecard.unassignable).toHaveLength(0)

    const tinyCaps = {
      ...config,
      maintainers: config.maintainers.map((m) => ({
        ...m,
        maxOpenAssignments: 1,
      })),
    }
    const capped = computeScorecard(snapshot, triage, tinyCaps, NOW, 3)
    expect(capped.unassignable).toHaveLength(0)
  })
})

describe('helpers', () => {
  it('percentile', () => {
    expect(percentile([], 50)).toBeNull()
    expect(percentile([5], 90)).toBe(5)
    expect(percentile([1, 2, 3, 4], 50)).toBe(2)
    expect(percentile([1, 2, 3, 4, 100], 90)).toBe(100)
  })

  it('formatDuration', () => {
    expect(formatDuration(0.4)).toBe('<1h')
    expect(formatDuration(30)).toBe('30h')
    expect(formatDuration(72)).toBe('3d')
  })
})

describe('discord rendering', () => {
  const snapshot = snapshotFixture()
  const triage = classifyAll(snapshot, config, NOW)
  const scorecard = computeScorecard(snapshot, triage, config, NOW, 3)

  it('builds all six embeds with links and mentions', () => {
    const embeds = buildScorecardEmbeds(scorecard, 'TanStack/ai')
    expect(embeds).toHaveLength(6)
    const all = embeds.map((e) => `${e.title}\n${e.description}`).join('\n')
    expect(all).toContain('https://github.com/TanStack/ai/pull/1')
    expect(all).toContain('<@111>') // tom's discord mention
    expect(all).toContain('first-time contributor')
    expect(all).toContain('PR clusters')
  })

  it('escapes markdown in untrusted titles (no masked links)', () => {
    const hostile = structuredClone(scorecard)
    hostile.readyToMerge = [
      {
        ...hostile.readyToMerge[0]!,
        item: {
          ...hostile.readyToMerge[0]!.item,
          title: '[urgent: click](https://evil.com) `x` **y**',
        },
      },
    ]
    const embeds = buildScorecardEmbeds(hostile, 'TanStack/ai')
    const ready = embeds[1]!.description
    expect(ready).not.toContain('[urgent: click](https://evil.com)')
    expect(ready).toContain('\\[urgent: click\\]\\(https://evil.com\\)')
    expect(ready).toContain('\\`x\\` \\*\\*y\\*\\*')
    // the real item link is still a working masked link
    expect(ready).toMatch(/\[#\d+\]\(https:\/\/github\.com\//)
  })

  it('chunks embeds under Discord message limits', () => {
    const big = Array.from({ length: 13 }, (_, i) => ({
      title: `t${i}`,
      description: 'x'.repeat(2000),
      color: 0,
    }))
    const chunks = chunkEmbeds(big)
    expect(chunks.length).toBeGreaterThan(1)
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(10)
      const chars = chunk.reduce(
        (sum, e) => sum + e.title.length + e.description.length,
        0,
      )
      expect(chars).toBeLessThanOrEqual(5500)
    }
    expect(chunks.flat()).toHaveLength(13)
  })
})

it('computes per-maintainer velocity from submitted reviews and request recipients, not actors', () => {
  const snapshot = snapshotFixture()
  const assigned = {
    kind: 'assigned' as const,
    actor: 'github-actions[bot]',
    subject: 'TOM',
    isBot: true,
    at: hoursAgo(72),
  }
  snapshot.prs = [
    makePR({
      timeline: [
        assigned,
        { ...assigned, kind: 'review-requested', at: hoursAgo(70) },
        review('tom', hoursAgo(48), 'CHANGES_REQUESTED'),
        review('tom', hoursAgo(24), 'APPROVED'),
        review('tom', hoursAgo(1), 'PENDING'),
        review('tom', hoursAgo(-1), 'APPROVED'),
        { ...review('tom', hoursAgo(1), 'COMMENTED'), isBot: true },
        comment('alem', hoursAgo(1), 'not a review'),
      ],
    }),
    makePR({
      number: 101,
      author: 'TOM',
      timeline: [assigned, review('tom', hoursAgo(1), 'APPROVED')],
    }),
  ]
  snapshot.recentlyClosed = [
    {
      ...snapshot.recentlyClosed[0]!,
      timeline: [
        { ...assigned, kind: 'review-requested', at: hoursAgo(20) },
        review('tom', hoursAgo(8), 'COMMENTED'),
        review('alem', hoursAgo(6), 'APPROVED'), // counts throughput, no invented latency
        review('jack', daysAgo(8), 'APPROVED'),
      ],
    },
  ]
  const card = computeScorecard(
    snapshot,
    classifyAll(snapshot, config, NOW),
    config,
    NOW,
    0,
  )
  expect(card.perMaintainer[0]).toMatchObject({
    reviewsCompleted7d: 3,
    medianTimeToFirstReviewHours: 12,
    reviewLatencySampleSize: 2,
  })
  expect(card.perMaintainer[1]).toMatchObject({
    reviewsCompleted7d: 1,
    medianTimeToFirstReviewHours: null,
    reviewLatencySampleSize: 0,
  })
  expect(card.perMaintainer[2]).toMatchObject({
    reviewsCompleted7d: 0,
    medianTimeToFirstReviewHours: null,
  })
  const queue = buildScorecardEmbeds(card, config.repo)[2]!.description
  expect(queue).toContain('3 reviews/7d')
  expect(queue).toContain('median first review 12h (n=2)')
  expect(queue).toContain('no timed first reviews')
})
