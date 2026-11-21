import { randomUUID } from 'node:crypto'
import { SecureMcpError } from './types'

/** The envelope a tool returns instead of acting, when approval is needed. */
export interface ApprovalRequired {
  status: 'approval_required'
  proposalId: string
  summary: string
  expiresAt: number
}

interface Proposal<TContext> {
  owner: string
  summary: string
  run: (context: TContext) => Promise<unknown>
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
 *
 * `run` receives the context of the confirming call, not the proposing one.
 * The proposing request has ended by then, so its abort signal and its
 * request-bound hooks are dead.
 */
export interface ApprovalStore<TContext = void> {
  propose: (input: {
    owner: string
    summary: string
    run: (context: TContext) => Promise<unknown>
  }) => ApprovalRequired
  confirm: (
    proposalId: string,
    owner: string,
    context: TContext,
  ) => Promise<unknown>
  pendingCount: () => number
}

export function createApprovalStore<TContext = void>(options?: {
  /** How long a proposal stays valid, 300000 ms (5 minutes) by default. */
  ttlMs?: number
  /** The most pending proposals to hold at once, 1000 by default. */
  maxPending?: number
  /** A clock in ms, for tests. */
  now?: () => number
  /** An id source, for tests. */
  newId?: () => string
}): ApprovalStore<TContext> {
  const ttlMs = options?.ttlMs ?? 300_000
  const maxPending = options?.maxPending ?? 1000
  // A NaN or infinite `ttlMs` gives an expiry that no clock passes, and a NaN
  // `maxPending` never bounds the map. Refuse both at construction.
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || !(maxPending >= 1)) {
    throw new RangeError(
      `ttlMs must be a finite, positive number and maxPending at least 1, got ${ttlMs} and ${maxPending}`,
    )
  }
  const now = options?.now ?? (() => Date.now())
  const newId = options?.newId ?? (() => randomUUID())
  const proposals = new Map<string, Proposal<TContext>>()

  // Drop every proposal past its expiry. Called on each `propose` so an
  // unconfirmed proposal cannot pin its `run` closure (args, context) forever.
  const pruneExpired = () => {
    const at = now()
    for (const [id, proposal] of proposals) {
      if (at >= proposal.expiresAt) proposals.delete(id)
    }
  }

  return {
    propose: ({ owner, summary, run }) => {
      pruneExpired()
      // Bound the map even when nothing has expired: evict the oldest pending
      // proposal (Map preserves insertion order) so a flood cannot grow it.
      while (proposals.size >= maxPending) {
        const oldest = proposals.keys().next().value
        if (oldest === undefined) break
        proposals.delete(oldest)
      }
      const proposalId = newId()
      const expiresAt = now() + ttlMs
      proposals.set(proposalId, { owner, summary, run, expiresAt })
      return { status: 'approval_required', proposalId, summary, expiresAt }
    },

    confirm: async (proposalId, owner, context) => {
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
      return proposal.run(context)
    },

    pendingCount: () => {
      pruneExpired()
      return proposals.size
    },
  }
}
