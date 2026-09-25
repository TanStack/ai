import { describe, expect, it } from 'vitest'
import { executeMutations, planLabelChanges } from './actions'
import { ACK_MARKER, REPRO_MARKER, buildAckComment } from './comments'
import { classifyPR } from './classify'
import { planSweep } from './sweep'
import {
  NOW,
  review,
  comment,
  config,
  daysAgo,
  hoursAgo,
  makeIssue,
  makePR,
} from './fixtures'
import type { RepoSnapshot } from './types'

function makeSnapshot(overrides: Partial<RepoSnapshot> = {}): RepoSnapshot {
  return {
    codeowners: '',
    owner: 'TanStack',
    repo: 'ai',
    takenAt: NOW.toISOString(),
    prs: [],
    issues: [],
    discussions: [],
    recentlyClosed: [],
    ...overrides,
  }
}

describe('planSweep', () => {
  it('assigns, acks, and labels a fresh unassigned PR', () => {
    const snapshot = makeSnapshot({
      prs: [makePR({ files: ['packages/ai-sandbox/src/x.ts'] })],
    })
    const plan = planSweep(snapshot, config)
    const kinds = plan.mutations.map((m) => m.kind)
    expect(kinds).toContain('assign')
    expect(plan.mutations).toContainEqual({
      kind: 'request-review',
      number: 100,
      reviewer: 'tom',
    })
    expect(kinds).toContain('comment')
    expect(kinds).toContain('add-labels')

    const assign = plan.mutations.find((m) => m.kind === 'assign')
    expect(assign).toMatchObject({ number: 100, assignee: 'tom' })
    const ack = plan.mutations.find((m) => m.kind === 'comment')
    expect(ack && 'body' in ack && ack.body).toContain(ACK_MARKER)
    expect(ack && 'body' in ack && ack.body).toContain('@tom')
  })

  it('is idempotent: assigned + already-acked + correctly-labeled PR → no mutations', () => {
    const snapshot = makeSnapshot({
      prs: [
        makePR({
          assignees: ['alem'],
          requestedReviewers: ['ALEM'],
          labels: ['waiting-on: maintainer'],
          timeline: [
            comment(
              'github-actions[bot]',
              daysAgo(1),
              `hi\n${ACK_MARKER}`,
              true,
            ),
          ],
        }),
      ],
    })
    expect(planSweep(snapshot, config).mutations).toHaveLength(0)
  })

  it('leaves suspected-spam PRs completely untouched', () => {
    const snapshot = makeSnapshot({
      prs: [
        makePR({
          authorAccountCreatedAt: daysAgo(3),
          additions: 1,
          deletions: 1,
          linkedIssues: [],
          authorAssociation: 'NONE',
        }),
      ],
    })
    const plan = planSweep(snapshot, config)
    expect(plan.mutations).toHaveLength(0)
    expect(plan.skippedAsSpam).toEqual([100])
  })

  it('skips drafts and bot PRs', () => {
    const snapshot = makeSnapshot({
      prs: [
        makePR({ number: 1, isDraft: true }),
        makePR({ number: 2, author: 'renovate[bot]', authorIsBot: true }),
      ],
    })
    expect(planSweep(snapshot, config).mutations).toHaveLength(0)
  })

  it('assigns roster-authored PRs to someone else without acking', () => {
    const snapshot = makeSnapshot({
      prs: [
        makePR({
          author: 'tom',
          authorAssociation: 'COLLABORATOR',
          files: ['packages/ai-sandbox/src/x.ts'],
        }),
      ],
    })
    const plan = planSweep(snapshot, config)
    const assign = plan.mutations.find((m) => m.kind === 'assign')
    expect(assign && 'assignee' in assign && assign.assignee).not.toBe('tom')
    expect(plan.mutations.some((m) => m.kind === 'comment')).toBe(false)
  })

  it('asks for a repro once, labels needs-repro and has-pr', () => {
    const snapshot = makeSnapshot({
      prs: [makePR({ linkedIssues: [200], assignees: ['alem'] })],
      issues: [
        makeIssue({ body: 'no links or code here', assignees: ['alem'] }),
      ],
    })
    const plan = planSweep(snapshot, config)
    const reproComment = plan.mutations.find(
      (m) => m.kind === 'comment' && m.body.includes(REPRO_MARKER),
    )
    expect(reproComment).toBeDefined()
    const labels = plan.mutations.find(
      (m) => m.kind === 'add-labels' && m.number === 200,
    )
    expect(labels && 'labels' in labels && labels.labels).toEqual(
      expect.arrayContaining(['needs-repro', 'has-pr']),
    )

    // second sweep: repro comment already present → no repeat
    const acked = makeSnapshot({
      prs: snapshot.prs,
      issues: [
        makeIssue({
          body: 'no links or code here',
          assignees: ['alem'],
          labels: ['needs-repro', 'has-pr', 'waiting-on: maintainer'],
          timeline: [
            comment(
              'github-actions[bot]',
              hoursAgo(3),
              `x\n${REPRO_MARKER}`,
              true,
            ),
          ],
        }),
      ],
    })
    const second = planSweep(acked, config)
    expect(
      second.mutations.filter((m) => m.kind === 'comment' && m.number === 200),
    ).toHaveLength(0)
  })

  it('caps comments per run and reports the overflow', () => {
    const tinyCap = { ...config, maxCommentsPerRun: 2 }
    const snapshot = makeSnapshot({
      prs: [1, 2, 3, 4].map((n) => makePR({ number: n, assignees: ['alem'] })),
    })
    const plan = planSweep(snapshot, tinyCap)
    expect(plan.mutations.filter((m) => m.kind === 'comment')).toHaveLength(2)
    expect(plan.commentsSuppressedByCap).toBe(2)
  })

  it('spreads fallback assignments across maintainers', () => {
    const snapshot = makeSnapshot({
      prs: [11, 12, 13].map((n) => makePR({ number: n, files: ['README.md'] })),
    })
    const plan = planSweep(snapshot, config)
    const assignees = plan.mutations
      .filter((m) => m.kind === 'assign')
      .map((m) => (m as { assignee: string }).assignee)
    expect(new Set(assignees).size).toBeGreaterThan(1)
  })
})

describe('planLabelChanges', () => {
  it('only touches managed labels', () => {
    const mutations = planLabelChanges(
      1,
      ['bug', 'waiting-on: author', 'help wanted'],
      ['waiting-on: maintainer'],
    )
    expect(mutations).toEqual([
      { kind: 'add-labels', number: 1, labels: ['waiting-on: maintainer'] },
      { kind: 'remove-label', number: 1, label: 'waiting-on: author' },
    ])
  })

  it('produces nothing when labels already match', () => {
    expect(
      planLabelChanges(1, ['bug', 'ready-to-merge'], ['ready-to-merge']),
    ).toEqual([])
  })
})

describe('buildAckComment', () => {
  it('renders warnings for missing changeset/E2E and conflicts', () => {
    const t = classifyPR(
      makePR({
        files: ['packages/ai/src/core/chat.ts'],
        mergeable: 'CONFLICTING',
      }),
      config,
      NOW,
    )
    const body = buildAckComment(t, 'alem')
    expect(body).toContain('⚠️ No changeset found')
    expect(body).toContain('⚠️ No E2E test changes')
    expect(body).toContain('⚠️ Merge conflicts')
    expect(body).toContain('✅ CI passing')
    expect(body).toContain(ACK_MARKER)
  })
})

describe('routing and review requests', () => {
  it('routes core PRs first and balances PR/issue loads separately above the old caps', () => {
    const roster = {
      ...config,
      maintainers: config.maintainers.map((m) => ({
        ...m,
        github: m.github === 'alem' ? 'AlemTuzlak' : m.github,
        maxOpenAssignments: 0,
      })),
    }
    const snapshot = makeSnapshot({
      codeowners: 'scripts/ @TanStack/tanstack-core',
      prs: [
        makePR({ number: 1, files: ['README.md'] }),
        makePR({ number: 99, files: ['scripts/a.ts'] }),
        ...Array.from({ length: 10 }, (_, i) =>
          makePR({ number: 100 + i, files: ['README.md'] }),
        ),
      ],
      issues: Array.from({ length: 12 }, (_, i) =>
        makeIssue({ number: 200 + i, body: 'ai-sandbox', title: 'ai-sandbox' }),
      ),
    })
    const assignments = planSweep(snapshot, roster).mutations.filter(
      (m) => m.kind === 'assign',
    )
    expect(assignments).toHaveLength(24)
    expect(assignments[0]).toEqual({
      kind: 'assign',
      number: 99,
      assignee: 'AlemTuzlak',
    })
    for (const isPR of [true, false]) {
      const counts = roster.maintainers.map(
        (m) =>
          assignments.filter(
            (a) => a.number < 200 === isPR && a.assignee === m.github,
          ).length,
      )
      expect(counts).toEqual([4, 4, 4])
    }
  })

  it('repairs missing requests, preserves existing assignments, and does not re-request completed reviews or self-reviews', () => {
    const snapshot = makeSnapshot({
      prs: [
        makePR({ number: 1, assignees: ['tom'] }),
        makePR({
          number: 2,
          assignees: ['alem'],
          requestedReviewers: ['ALEM'],
        }),
        makePR({
          number: 3,
          assignees: ['jack'],
          timeline: [review('JACK', hoursAgo(2), 'CHANGES_REQUESTED')],
        }),
        makePR({ number: 4, author: 'tom', assignees: ['TOM'] }),
      ],
    })
    const mutations = planSweep(snapshot, config).mutations
    expect(mutations.filter((m) => m.kind === 'assign')).toEqual([])
    expect(mutations.filter((m) => m.kind === 'request-review')).toEqual([
      { kind: 'request-review', number: 1, reviewer: 'tom' },
    ])
  })

  it('sends assignment and reviewer requests to their separate REST endpoints', async () => {
    const calls: Array<unknown> = []
    const client = {
      graphql: async <T>() => {
        throw new Error('unexpected GraphQL')
      },
      rest: async (...args: Array<unknown>) => {
        calls.push(args)
      },
    }
    await executeMutations(
      client,
      'TanStack/ai',
      [
        { kind: 'assign', number: 1, assignee: 'tom' },
        { kind: 'request-review', number: 1, reviewer: 'tom' },
      ],
      { pacingMs: 0, sleepImpl: async () => {} },
    )
    expect(calls).toEqual([
      ['POST', '/repos/TanStack/ai/issues/1/assignees', { assignees: ['tom'] }],
      [
        'POST',
        '/repos/TanStack/ai/pulls/1/requested_reviewers',
        { reviewers: ['tom'] },
      ],
    ])
  })
})

it('runs collection → routing → REST mutations → scorecard with paginated GitHub data', async () => {
  const { collectSnapshot } = await import('./collect')
  const { createGitHubClient } = await import('./github')
  const { classifyAll } = await import('./classify')
  const { computeScorecard } = await import('./metrics')
  const { buildScorecardEmbeds } = await import('./discord')
  const roster = {
    ...config,
    maintainers: config.maintainers.map((m) => ({
      ...m,
      github: m.github === 'alem' ? 'AlemTuzlak' : m.github,
    })),
  }
  const connection = (nodes: Array<unknown>, cursor: string | null = null) => ({
    nodes,
    pageInfo: { hasNextPage: cursor !== null, endCursor: cursor },
  })
  const writes: Array<unknown> = []
  const pages: Array<string> = []
  const client = createGitHubClient({
    token: 'test-only',
    fetchImpl: async (input, init) => {
      const body = JSON.parse(String(init?.body))
      if (String(input).endsWith('/graphql')) {
        const query: string = body.query
        let data: unknown
        if (query.includes('object(expression:')) {
          expect(query).toContain('HEAD:.github/CODEOWNERS')
          data = {
            repository: {
              object: { text: 'scripts/ @TanStack/tanstack-core' },
            },
          }
        } else if (query.includes('pullRequests(states:')) {
          data = {
            repository: {
              pullRequests: connection([
                {
                  ...makePR({ number: 1402 }),
                  author: { login: 'contributor', createdAt: daysAgo(400) },
                  files: connection(
                    Array.from({ length: 100 }, (_, i) => ({
                      path: `docs/${i}.md`,
                    })),
                    'files-page-1',
                  ),
                  reviewRequests: connection(
                    [{ requestedReviewer: null }],
                    'requests-page-1',
                  ),
                  timelineItems: connection(
                    [
                      {
                        __typename: 'IssueComment',
                        author: { login: 'contributor' },
                        createdAt: daysAgo(2),
                        body: 'hello',
                      },
                    ],
                    'timeline-page-1',
                  ),
                },
              ]),
            },
          }
        } else if (query.includes('pullRequest(number:')) {
          pages.push(body.variables.cursor)
          if (query.includes('files(first:')) {
            data = {
              repository: {
                pullRequest: {
                  files: connection([{ path: 'scripts/maintainer/sweep.ts' }]),
                },
              },
            }
          } else if (query.includes('reviewRequests(first:')) {
            data = {
              repository: {
                pullRequest: {
                  reviewRequests: connection([
                    { requestedReviewer: { login: 'tom' } },
                  ]),
                },
              },
            }
          } else {
            data = {
              repository: {
                pullRequest: {
                  timelineItems: connection([
                    {
                      __typename: 'AssignedEvent',
                      actor: {
                        login: 'github-actions[bot]',
                        __typename: 'Bot',
                      },
                      assignee: { login: 'tom' },
                      createdAt: hoursAgo(48),
                    },
                    {
                      __typename: 'ReviewRequestedEvent',
                      actor: { login: 'contributor' },
                      requestedReviewer: { login: 'tom' },
                      createdAt: hoursAgo(46),
                    },
                    {
                      __typename: 'PullRequestReview',
                      author: { login: 'tom' },
                      submittedAt: hoursAgo(24),
                      state: 'APPROVED',
                    },
                  ]),
                },
              },
            }
          }
        } else if (query.includes('issues(states:'))
          data = { repository: { issues: connection([]) } }
        else if (query.includes('discussions(first:'))
          data = { repository: { discussions: connection([]) } }
        else if (query.includes('search(query:'))
          data = { search: connection([]) }
        else throw new Error(`Unexpected query: ${query}`)
        return new Response(JSON.stringify({ data }), { status: 200 })
      }
      writes.push({ url: String(input), method: init?.method, body })
      return new Response('{}', { status: 200 })
    },
  })
  const snapshot = await collectSnapshot(client, roster, NOW)
  expect(snapshot.prs[0]!.files).toHaveLength(101)
  expect(snapshot.prs[0]!.requestedReviewers).toEqual(['tom'])
  expect(pages).toEqual(['files-page-1', 'requests-page-1', 'timeline-page-1'])
  const plan = planSweep(snapshot, roster)
  expect(writes).toEqual([]) // collection and planning are read-only
  await executeMutations(client, roster.repo, plan.mutations, {
    pacingMs: 0,
    sleepImpl: async () => {},
  })
  expect(writes).toContainEqual({
    url: 'https://api.github.com/repos/TanStack/ai/issues/1402/assignees',
    method: 'POST',
    body: { assignees: ['AlemTuzlak'] },
  })
  expect(writes).toContainEqual({
    url: 'https://api.github.com/repos/TanStack/ai/pulls/1402/requested_reviewers',
    method: 'POST',
    body: { reviewers: ['AlemTuzlak'] },
  })
  const card = computeScorecard(
    snapshot,
    classifyAll(snapshot, roster, NOW),
    roster,
    NOW,
    0,
  )
  expect(card.perMaintainer[0]).toMatchObject({
    reviewsCompleted7d: 1,
    medianTimeToFirstReviewHours: 24,
  })
  expect(buildScorecardEmbeds(card, roster.repo)[2]!.description).toContain(
    'median first review 24h (n=1)',
  )
})

it('does not treat assignment or review-request events as contributor replies', () => {
  const timeline = [
    comment('tom', hoursAgo(48), 'please update'),
    comment('contributor', hoursAgo(24), 'updated'),
  ]
  const before = classifyPR(makePR({ timeline }), config, NOW)
  const after = classifyPR(
    makePR({
      timeline: [
        ...timeline,
        {
          kind: 'assigned',
          actor: 'contributor',
          subject: 'jack',
          isBot: false,
          at: hoursAgo(1),
        },
        {
          kind: 'review-requested',
          actor: null,
          subject: 'tom',
          isBot: false,
          at: hoursAgo(1),
        },
      ],
    }),
    config,
    NOW,
  )
  expect(after.lastContributorActivityAt).toBe(before.lastContributorActivityAt)
  expect(after.unansweredSince).toBe(before.unansweredSince)
  expect(after.firstResponseHours).toBe(before.firstResponseHours)
})
