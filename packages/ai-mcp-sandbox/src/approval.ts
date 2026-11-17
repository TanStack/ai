import { createHash, randomBytes } from 'node:crypto'
import { canonicalize } from './manifest'

/**
 * Host-agnostic two-phase approval for lasting (Tier-3) writes. Approval never
 * happens inside the isolate: a Tier-3 tool calls `propose()` first (phase 1,
 * returns a proposalId), and a second call with that id `consume()`s it
 * (phase 2) to run the write. Hash-bound, single-use, 5-minute expiry,
 * fail-closed (a restart drops every pending proposal).
 *
 * ponytail: in-memory Map. Swap for a shared store if you run more than one
 * server process.
 */
export interface Proposal {
  id: string
  clientId: string
  /** The exact action to perform in phase 2. */
  action: unknown
  /** SHA-256 of the canonical action — detects tampering between phases. */
  actionHash: string
  expiresAtMs: number
}

export class ProposalExpiredError extends Error {
  constructor() {
    // Unknown / expired / replayed are indistinguishable on purpose.
    super('proposal_expired')
    this.name = 'ProposalExpiredError'
  }
}

export interface ApprovalStore {
  propose: (
    clientId: string,
    action: unknown,
  ) => { proposalId: string; actionHash: string; expiresAtMs: number }
  consume: (clientId: string, proposalId: string) => unknown
}

const TTL_MS = 5 * 60 * 1000

export function createApprovalStore(ttlMs: number = TTL_MS): ApprovalStore {
  const pending = new Map<string, Proposal>()
  const now = () => Date.now()

  const prune = () => {
    const t = now()
    for (const [id, p] of pending) {
      if (p.expiresAtMs < t) pending.delete(id)
    }
  }

  return {
    propose(clientId, action) {
      prune() // bound the map: expired proposals never linger
      // Snapshot the action so a later mutation of the caller's object cannot
      // change what phase 2 runs. The hash describes this snapshot.
      const snapshot = structuredClone(action)
      const id = randomBytes(18).toString('hex')
      const actionHash = createHash('sha256')
        .update(canonicalize({ clientId, action: snapshot }), 'utf8')
        .digest('hex')
      const expiresAtMs = now() + ttlMs
      pending.set(id, {
        id,
        clientId,
        action: snapshot,
        actionHash,
        expiresAtMs,
      })
      return { proposalId: id, actionHash, expiresAtMs }
    },
    consume(clientId, proposalId) {
      const p = pending.get(proposalId)
      pending.delete(proposalId) // single-use: gone whether or not it was valid
      if (!p || p.clientId !== clientId || p.expiresAtMs < now()) {
        throw new ProposalExpiredError()
      }
      return p.action
    },
  }
}
