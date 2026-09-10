import { describe, expect, it } from 'vitest'
import { parseReviewEvent } from './event'

describe('parseReviewEvent', () => {
  it('parses pull_request as auto', () => {
    expect(
      parseReviewEvent({
        eventName: 'pull_request',
        event: { pull_request: { number: 42 } },
      }),
    ).toEqual({
      prNumber: 42,
      mode: 'auto',
      commentAuthor: null,
      eventName: 'pull_request',
    })
  })

  it('parses workflow_dispatch string pr_number as manual', () => {
    expect(
      parseReviewEvent({
        eventName: 'workflow_dispatch',
        event: { inputs: { pr_number: '88' } },
      }),
    ).toEqual({
      prNumber: 88,
      mode: 'manual',
      commentAuthor: null,
      eventName: 'workflow_dispatch',
    })
  })

  it('parses workflow_dispatch numeric pr_number as manual', () => {
    expect(
      parseReviewEvent({
        eventName: 'workflow_dispatch',
        event: { inputs: { pr_number: 7 } },
      }),
    ).toEqual({
      prNumber: 7,
      mode: 'manual',
      commentAuthor: null,
      eventName: 'workflow_dispatch',
    })
  })

  it('parses issue_comment on a PR as manual', () => {
    expect(
      parseReviewEvent({
        eventName: 'issue_comment',
        event: {
          issue: {
            number: 12,
            pull_request: {
              url: 'https://api.github.com/repos/TanStack/ai/pulls/12',
            },
          },
          comment: { user: { login: 'alem' } },
        },
      }),
    ).toEqual({
      prNumber: 12,
      mode: 'manual',
      commentAuthor: 'alem',
      eventName: 'issue_comment',
    })
  })

  it('returns a null commentAuthor when the comment user is missing', () => {
    expect(
      parseReviewEvent({
        eventName: 'issue_comment',
        event: {
          issue: { number: 12, pull_request: {} },
          comment: {},
        },
      }),
    ).toEqual({
      prNumber: 12,
      mode: 'manual',
      commentAuthor: null,
      eventName: 'issue_comment',
    })
  })

  it('throws on an unknown event name', () => {
    expect(() => parseReviewEvent({ eventName: 'push', event: {} })).toThrow(
      'Unknown GitHub event: push',
    )
  })

  it('throws when workflow_dispatch has no valid pr_number', () => {
    expect(() =>
      parseReviewEvent({
        eventName: 'workflow_dispatch',
        event: { inputs: { pr_number: 'nope' } },
      }),
    ).toThrow('workflow_dispatch is missing a valid inputs.pr_number')
  })

  it('throws when issue_comment is not on a pull request', () => {
    expect(() =>
      parseReviewEvent({
        eventName: 'issue_comment',
        event: {
          issue: { number: 12 },
          comment: { user: { login: 'alem' } },
        },
      }),
    ).toThrow('issue_comment is not on a pull request')
  })

  it('throws when pull_request is missing a number', () => {
    expect(() =>
      parseReviewEvent({
        eventName: 'pull_request',
        event: { pull_request: {} },
      }),
    ).toThrow('pull_request event is missing pull_request.number')
  })
})
