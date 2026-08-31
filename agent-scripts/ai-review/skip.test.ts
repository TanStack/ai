import { describe, expect, it } from 'vitest'
import { config } from '../../scripts/maintainer/fixtures.ts'
import { shouldSkip } from './skip'

const SHA = 'abc123def456'
const MACHINE = 'tanstack-ai-bot'

function reviewSkip(
  overrides: {
    mode?: 'auto' | 'manual'
    isDraft?: boolean
    authorLogin?: string | null
    headCommitAuthorLogin?: string | null
    headSha?: string
    alreadyReviewedSha?: string | null
    machineUserLogin?: string
  } = {},
) {
  return shouldSkip({
    mode: 'auto',
    isDraft: false,
    authorLogin: 'alice',
    headCommitAuthorLogin: 'alice',
    headSha: SHA,
    alreadyReviewedSha: null,
    machineUserLogin: MACHINE,
    config,
    ...overrides,
  })
}

describe('shouldSkip', () => {
  describe('auto', () => {
    it('does not skip an open human PR with a new head SHA', () => {
      expect(reviewSkip()).toEqual({ skip: false, reason: null })
    })

    it('skips a draft', () => {
      expect(reviewSkip({ isDraft: true })).toEqual({
        skip: true,
        reason: 'draft',
      })
    })

    it('skips a bot PR author', () => {
      expect(reviewSkip({ authorLogin: 'renovate' })).toEqual({
        skip: true,
        reason: 'bot-author',
      })
    })

    it('skips when the head commit is from the machine user', () => {
      expect(reviewSkip({ headCommitAuthorLogin: 'TanStack-AI-Bot' })).toEqual({
        skip: true,
        reason: 'bot-head-commit',
      })
    })

    it('skips when this head SHA was already reviewed', () => {
      expect(reviewSkip({ alreadyReviewedSha: SHA })).toEqual({
        skip: true,
        reason: 'same-sha',
      })
    })

    it('does not skip a different already-reviewed SHA', () => {
      expect(reviewSkip({ alreadyReviewedSha: 'oldsha' })).toEqual({
        skip: false,
        reason: null,
      })
    })

    it('does not treat a null author as a bot', () => {
      expect(reviewSkip({ authorLogin: null })).toEqual({
        skip: false,
        reason: null,
      })
    })

    it('does not treat a null head-commit author as the machine user', () => {
      expect(reviewSkip({ headCommitAuthorLogin: null })).toEqual({
        skip: false,
        reason: null,
      })
    })

    it('prefers draft over bot-author', () => {
      expect(reviewSkip({ isDraft: true, authorLogin: 'renovate' })).toEqual({
        skip: true,
        reason: 'draft',
      })
    })

    it('prefers bot-author over bot-head-commit', () => {
      expect(
        reviewSkip({
          authorLogin: 'renovate',
          headCommitAuthorLogin: MACHINE,
        }),
      ).toEqual({ skip: true, reason: 'bot-author' })
    })

    it('prefers bot-head-commit over same-sha', () => {
      expect(
        reviewSkip({
          headCommitAuthorLogin: MACHINE,
          alreadyReviewedSha: SHA,
        }),
      ).toEqual({ skip: true, reason: 'bot-head-commit' })
    })
  })

  describe('manual', () => {
    it('never skips for draft, bot author, bot head commit, or same SHA', () => {
      expect(
        reviewSkip({
          mode: 'manual',
          isDraft: true,
          authorLogin: 'renovate',
          headCommitAuthorLogin: MACHINE,
          alreadyReviewedSha: SHA,
        }),
      ).toEqual({ skip: false, reason: null })
    })
  })
})
