/**
 * Server-side approval controller over an {@link ApprovalStore}.
 *
 * Approvals ride the existing deny-and-replay flow: a harness emits an
 * `approval-requested` CUSTOM event (persisted automatically via the event log),
 * the client POSTs a decision which `resolve()` records durably, and the next
 * run reads the decisions via `decisionsForThread()` to build the engine's
 * `TextOptions.approvals` map. This makes approvals durable and multi-device
 * without the (deferred) true mid-run suspend.
 */
import type { ApprovalRecord, ApprovalStore } from './types'

export interface ApprovalController {
  /** Record a client decision for an approval (durably). */
  resolve: (approvalId: string, granted: boolean) => Promise<void>
  /** Register a pending approval (usually emitted by the harness/event log). */
  request: (
    record: Omit<ApprovalRecord, 'status' | 'resolvedAt'>,
  ) => Promise<void>
  /**
   * Decisions for a thread as an `approvalId → granted` map, ready to pass as
   * `chat({ approvals })` on the next/resumed run.
   */
  decisionsForThread: (threadId: string) => Promise<Map<string, boolean>>
}

export function createApprovalController(opts: {
  store: ApprovalStore
}): ApprovalController {
  const { store } = opts
  return {
    resolve: (approvalId, granted) => store.resolve(approvalId, granted),
    request: (record) =>
      store.create({
        ...record,
        status: 'pending',
      }),
    decisionsForThread: (threadId) => store.decisionsForThread(threadId),
  }
}
