import { randomUUID } from 'node:crypto'
import { SecureMcpError } from './types'

/** The envelope a tool returns instead of acting, when approval is needed. */
export interface ApprovalRequired {
  status: 'approval_required'
  proposalId: string
  summary: string
  expiresAt: number
}

interface Proposal {
  owner: string
  summary: string
  run: () => Promise<unknown>
  expiresAt: number
}

/**
 * Holds pending two-phase approvals. A tool call proposes an action and gets a
 * {@link ApprovalRequired} envelope. A later confirm, by the same client, runs
 * the action.
 *
 * The store is in memory and fail-closed: a restart drops every proposal, so a
 * ghost approval cannot run after a crash. Each proposal is single-use and
 * expires.
 */
export interface ApprovalStore {
  propose: (input: {
    owner: string
    summary: string
    run: () => Promise<unknown>
  }) => ApprovalRequired
  confirm: (proposalId: string, owner: string) => Promise<unknown>
  pendingCount: () => number
}

export function createApprovalStore(options?: {
  /** How long a proposal stays valid, 300000 ms (5 minutes) by default. */
  ttlMs?: number
  /** A clock in ms, for tests. */
  now?: () => number
  /** An id source, for tests. */
  newId?: () => string
}): ApprovalStore {
  const ttlMs = options?.ttlMs ?? 300_000
  const now = options?.now ?? (() => Date.now())
  const newId = options?.newId ?? (() => randomUUID())
  const proposals = new Map<string, Proposal>()

  return {
    propose: ({ owner, summary, run }) => {
      const proposalId = newId()
      const expiresAt = now() + ttlMs
      proposals.set(proposalId, { owner, summary, run, expiresAt })
      return { status: 'approval_required', proposalId, summary, expiresAt }
    },

    confirm: async (proposalId, owner) => {
      const proposal = proposals.get(proposalId)
      // Do not tell a caller whether an id exists for another owner.
      if (proposal === undefined || proposal.owner !== owner) {
        throw new SecureMcpError(
          'not_found',
          'No pending proposal with that id.',
        )
      }
      if (now() >= proposal.expiresAt) {
        proposals.delete(proposalId)
        throw new SecureMcpError('proposal_expired', 'The proposal expired.')
      }
      // Single-use: remove before running, so a failed action cannot be
      // retried by replaying the same id.
      proposals.delete(proposalId)
      return proposal.run()
    },

    pendingCount: () => proposals.size,
  }
}
