import {
  isBotLogin,
  isRosterMaintainer,
} from '../../scripts/maintainer/config.ts'
import type { ToolsetConfig } from '../../scripts/maintainer/types.ts'

type SkipInput = {
  mode: 'auto' | 'manual'
  isDraft: boolean
  authorLogin: string | null
  headCommitAuthorLogin: string | null
  headSha: string
  alreadyReviewedSha: string | null
  machineUserLogin: string
  config: ToolsetConfig
}

/**
 * Decide whether this AI review run should skip, and why.
 *
 * Auto mode skips drafts, bot PR authors, roster maintainers, machine-user
 * head commits, and a head SHA that was already reviewed, in that order.
 * Manual mode never skips.
 */
export function shouldSkip(input: SkipInput) {
  if (input.mode === 'manual') {
    return { skip: false, reason: null }
  }

  if (input.isDraft) {
    return { skip: true, reason: 'draft' }
  }

  if (isBotLogin(input.authorLogin, input.config)) {
    return { skip: true, reason: 'bot-author' }
  }

  if (isRosterMaintainer(input.authorLogin, input.config)) {
    return { skip: true, reason: 'maintainer-author' }
  }

  const isBotHeadCommit =
    input.headCommitAuthorLogin !== null &&
    input.headCommitAuthorLogin.toLowerCase() ===
      input.machineUserLogin.toLowerCase()
  if (isBotHeadCommit) {
    return { skip: true, reason: 'bot-head-commit' }
  }

  if (input.alreadyReviewedSha === input.headSha) {
    return { skip: true, reason: 'same-sha' }
  }

  return { skip: false, reason: null }
}
