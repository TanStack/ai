import { describe, expect, it } from 'vitest'
import { classifyDiscussion, classifyIssue, classifyPR } from './classify'
import { ACK_MARKER, REPRO_MARKER } from './comments'
import {
  NOW,
  comment,
  commit,
  config,
  daysAgo,
  hoursAgo,
  makeDiscussion,
  makeIssue,
  makePR,
  review,
} from './fixtures'

describe('classifyPR — waiting-on state machine', () => {
  it('brand-new PR with no maintainer response waits on maintainer', () => {
    const t = classifyPR(makePR({ createdAt: hoursAgo(3) }), config, NOW)
    expect(t.waitingOn).toBe('maintainer')
    expect(t.waitingReason).toBe('no-response')
    expect(t.unansweredSince).toBe(hoursAgo(3))
    expect(t.slaBreached).toBe(false) // 3h < 24h first-response SLA
  })

  it('breaches first-response SLA after 24h of silence', () => {
    const t = classifyPR(makePR({ createdAt: hoursAgo(30) }), config, NOW)
    expect(t.slaBreached).toBe(true)
    expect(t.unansweredHours).toBeCloseTo(30, 0)
  })

  it('maintainer replied last → waiting on author, SLA clock cleared', () => {
    const t = classifyPR(
      makePR({
        createdAt: daysAgo(3),
        timeline: [
          comment('contributor', daysAgo(2), 'please review'),
          comment('alem', daysAgo(1), 'looking at it'),
        ],
      }),
      config,
      NOW,
    )
    expect(t.waitingOn).toBe('author')
    expect(t.waitingReason).toBe('maintainer-replied')
    expect(t.unansweredSince).toBeNull()
    expect(t.slaBreached).toBe(false)
    expect(t.firstResponseHours).toBeCloseTo(48, 0)
  })

  it('author replied after maintainer → back to waiting on maintainer (follow-up SLA)', () => {
    const t = classifyPR(
      makePR({
        createdAt: daysAgo(6),
        timeline: [
          comment('alem', daysAgo(5), 'needs changes'),
          comment('contributor', daysAgo(3), 'done, please re-check'),
        ],
      }),
      config,
      NOW,
    )
    expect(t.waitingOn).toBe('maintainer')
    expect(t.waitingReason).toBe('author-replied')
    expect(t.freshContributorReply).toBe(true)
    expect(t.unansweredSince).toBe(daysAgo(3))
    expect(t.slaBreached).toBe(true) // 72h > 48h follow-up SLA
  })

  it('the PR author being a maintainer does not count as a response', () => {
    const t = classifyPR(
      makePR({
        author: 'tom',
        createdAt: hoursAgo(30),
        timeline: [comment('tom', hoursAgo(29), 'self-note')],
      }),
      config,
      NOW,
    )
    expect(t.rosterAuthor).toBe(true)
    expect(t.lastMaintainerResponseAt).toBeNull()
    // roster-authored PRs are exempt from the SLA clock
    expect(t.slaBreached).toBe(false)
  })

  it('bot comments never count as maintainer responses', () => {
    const t = classifyPR(
      makePR({
        createdAt: hoursAgo(30),
        timeline: [comment('github-actions[bot]', hoursAgo(29), 'ack', true)],
      }),
      config,
      NOW,
    )
    expect(t.lastMaintainerResponseAt).toBeNull()
    expect(t.slaBreached).toBe(true)
  })

  it('approved + green + conflict-free → ready to merge, waiting on maintainer', () => {
    const t = classifyPR(
      makePR({ reviewDecision: 'APPROVED', ciState: 'success' }),
      config,
      NOW,
    )
    expect(t.readyToMerge).toBe(true)
    expect(t.waitingOn).toBe('maintainer')
    expect(t.waitingReason).toBe('ready-to-merge')
  })

  it('conflicts beat CI and last-mover: waiting on author', () => {
    const t = classifyPR(
      makePR({
        mergeable: 'CONFLICTING',
        timeline: [comment('contributor', hoursAgo(2), 'ping?')],
      }),
      config,
      NOW,
    )
    expect(t.waitingOn).toBe('author')
    expect(t.waitingReason).toBe('merge-conflicts')
    // …but the unanswered-message clock still runs independently
    expect(t.unansweredSince).not.toBeNull()
  })

  it('failing CI → waiting on author', () => {
    const t = classifyPR(makePR({ ciState: 'failure' }), config, NOW)
    expect(t.waitingOn).toBe('author')
    expect(t.waitingReason).toBe('ci-failing')
  })

  it('outstanding changes-requested waits on author; author push flips it back', () => {
    const requested = classifyPR(
      makePR({
        reviewDecision: 'CHANGES_REQUESTED',
        timeline: [review('alem', daysAgo(2), 'CHANGES_REQUESTED')],
      }),
      config,
      NOW,
    )
    expect(requested.waitingOn).toBe('author')
    expect(requested.waitingReason).toBe('changes-requested')

    const pushed = classifyPR(
      makePR({
        reviewDecision: 'CHANGES_REQUESTED',
        timeline: [
          review('alem', daysAgo(2), 'CHANGES_REQUESTED'),
          commit('contributor', daysAgo(1)),
        ],
      }),
      config,
      NOW,
    )
    expect(pushed.waitingOn).toBe('maintainer')
  })

  it('drafts wait on author and never breach SLA', () => {
    const t = classifyPR(
      makePR({ isDraft: true, createdAt: daysAgo(10) }),
      config,
      NOW,
    )
    expect(t.waitingOn).toBe('author')
    expect(t.waitingReason).toBe('draft')
    expect(t.slaBreached).toBe(false)
  })

  it('goes stale after author silence beyond the threshold', () => {
    const t = classifyPR(
      makePR({
        createdAt: daysAgo(30),
        mergeable: 'CONFLICTING',
        timeline: [
          comment('alem', daysAgo(20), 'please rebase'),
          comment('contributor', daysAgo(16), 'will do'),
        ],
      }),
      config,
      NOW,
    )
    expect(t.waitingOn).toBe('author')
    expect(t.staleAuthor).toBe(true)
  })
})

describe('classifyPR — hygiene and flags', () => {
  it('flags missing changeset and missing E2E only for published-source PRs', () => {
    const src = classifyPR(
      makePR({ files: ['packages/ai/src/core/chat.ts'] }),
      config,
      NOW,
    )
    expect(src.missingChangeset).toBe(true)
    expect(src.missingE2E).toBe(true)

    const covered = classifyPR(
      makePR({
        files: [
          'packages/ai/src/core/chat.ts',
          '.changeset/two-dogs-run.md',
          'testing/e2e/tests/chat.spec.ts',
        ],
      }),
      config,
      NOW,
    )
    expect(covered.missingChangeset).toBe(false)
    expect(covered.missingE2E).toBe(false)

    const docsOnly = classifyPR(
      makePR({ files: ['docs/guide.md'] }),
      config,
      NOW,
    )
    expect(docsOnly.missingChangeset).toBe(false)
    expect(docsOnly.missingE2E).toBe(false)
  })

  it('suspects spam only when all three signals align', () => {
    const spam = classifyPR(
      makePR({
        authorAccountCreatedAt: daysAgo(5),
        additions: 2,
        deletions: 1,
        linkedIssues: [],
        authorAssociation: 'NONE',
      }),
      config,
      NOW,
    )
    expect(spam.suspectedSpam).toBe(true)
    expect(spam.spamReasons).toHaveLength(3)

    const youngButSubstantial = classifyPR(
      makePR({
        authorAccountCreatedAt: daysAgo(5),
        additions: 400,
        deletions: 100,
        linkedIssues: [],
        authorAssociation: 'NONE',
      }),
      config,
      NOW,
    )
    expect(youngButSubstantial.suspectedSpam).toBe(false)

    const collaborator = classifyPR(
      makePR({
        authorAccountCreatedAt: daysAgo(5),
        additions: 2,
        deletions: 1,
        linkedIssues: [],
        authorAssociation: 'COLLABORATOR',
      }),
      config,
      NOW,
    )
    expect(collaborator.suspectedSpam).toBe(false)
  })

  it('detects a prior ack comment via the marker', () => {
    const t = classifyPR(
      makePR({
        timeline: [
          comment(
            'github-actions[bot]',
            daysAgo(1),
            `Thanks!\n${ACK_MARKER}`,
            true,
          ),
        ],
      }),
      config,
      NOW,
    )
    expect(t.hasAckComment).toBe(true)
  })

  it('flags first-time contributors', () => {
    const t = classifyPR(
      makePR({ authorAssociation: 'FIRST_TIME_CONTRIBUTOR' }),
      config,
      NOW,
    )
    expect(t.firstTimeContributor).toBe(true)
  })
})

describe('classifyIssue', () => {
  it('needs repro when the body has no link or code fence', () => {
    const bare = classifyIssue(
      makeIssue({ body: 'it just breaks, please fix' }),
      config,
      NOW,
      new Set(),
    )
    expect(bare.needsRepro).toBe(true)

    const withLink = classifyIssue(makeIssue(), config, NOW, new Set())
    expect(withLink.needsRepro).toBe(false)

    const withCode = classifyIssue(
      makeIssue({ body: 'crash:\n```ts\nchat()\n```' }),
      config,
      NOW,
      new Set(),
    )
    expect(withCode.needsRepro).toBe(false)
  })

  it('links issues to open PRs that close them', () => {
    const t = classifyIssue(
      makeIssue({ number: 50 }),
      config,
      NOW,
      new Set([50]),
    )
    expect(t.hasOpenPR).toBe(true)
  })

  it('detects a prior repro-request comment via the marker', () => {
    const t = classifyIssue(
      makeIssue({
        body: 'no repro here',
        timeline: [
          comment(
            'github-actions[bot]',
            daysAgo(1),
            `Repro?\n${REPRO_MARKER}`,
            true,
          ),
        ],
      }),
      config,
      NOW,
      new Set(),
    )
    expect(t.hasReproComment).toBe(true)
  })

  it('runs the same response SLA as PRs', () => {
    const t = classifyIssue(
      makeIssue({ createdAt: hoursAgo(30) }),
      config,
      NOW,
      new Set(),
    )
    expect(t.waitingOn).toBe('maintainer')
    expect(t.slaBreached).toBe(true)
  })
})

describe('classifyDiscussion', () => {
  it('needs attention when unanswered with no maintainer comment', () => {
    const t = classifyDiscussion(makeDiscussion(), config, NOW)
    expect(t.needsAttention).toBe(true)
    expect(t.waitingHours).toBeCloseTo(72, 0)
  })

  it('a maintainer comment clears the attention flag even if unanswered', () => {
    const t = classifyDiscussion(
      makeDiscussion({
        comments: [{ actor: 'jack', isBot: false, at: daysAgo(1) }],
      }),
      config,
      NOW,
    )
    expect(t.needsAttention).toBe(false)
  })
})
