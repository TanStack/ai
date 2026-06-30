/**
 * Shared interactive-approval logic for harness adapters.
 *
 * Flow (rides chat()'s existing resume-based approval mechanism):
 *  1. The agent (inside the sandbox) asks to run a risky action; the harness's
 *     host-side permission callback fires.
 *  2. `resolveApproval` evaluates the sandbox policy: `allow`/`deny` are final;
 *     `ask` consults the client's approval decisions (threaded via
 *     `TextOptions.approvals`, keyed by a stable `approvalId`).
 *  3. On `ask` with no decision yet, the adapter emits an `approval-requested`
 *     CUSTOM event (carrying the `approvalId`) and denies the action this turn.
 *     The client shows UI, then re-runs chat() with the decision in the message;
 *     the engine surfaces it as `approvals`, and the next run allows it.
 *
 * `approvalId` is stable for a given (provider, kind, target) so a client grant
 * matches the same action on the resumed run.
 */
import { EventType } from '@tanstack/ai'
import { evaluateCommand } from './policy'
import type { SandboxPolicy } from './policy'
import type { StreamChunk } from '@tanstack/ai'

/** CUSTOM event name emitted when a harness action needs client approval. */
export const APPROVAL_REQUESTED_EVENT = 'approval-requested'

/** A stable, opaque approval id for a harness action. */
export function approvalId(input: {
  provider: string
  kind: 'command' | 'fileWrite' | 'network' | 'tool'
  target: string
}): string {
  return `${input.provider}:${input.kind}:${input.target}`
}

export interface ResolveApprovalInput {
  policy: SandboxPolicy | undefined
  /** Client approval decisions, keyed by `approvalId`. */
  approvals: ReadonlyMap<string, boolean> | undefined
  /** Precomputed approval id for this action. */
  id: string
  /** A shell command to match against `policy.commands`. */
  command?: string
  /** Named workspace scripts for policy alias resolution. */
  scripts?: Record<string, string>
  /** A coarse capability to match against `policy.capabilities`. */
  capability?: 'fileWrite' | 'network'
}

export interface ApprovalOutcome {
  decision: 'allow' | 'deny'
  /** True when policy said `ask` and the client hasn't decided yet. */
  needsApproval: boolean
}

/** Resolve a harness permission request against policy + client approvals. */
export function resolveApproval(input: ResolveApprovalInput): ApprovalOutcome {
  const base =
    input.command !== undefined
      ? evaluateCommand(input.command, input.policy, input.scripts)
      : input.capability !== undefined
        ? (input.policy?.capabilities?.[input.capability] ??
          input.policy?.default ??
          'ask')
        : (input.policy?.default ?? 'ask')

  if (base === 'allow') return { decision: 'allow', needsApproval: false }
  if (base === 'deny') return { decision: 'deny', needsApproval: false }

  // base === 'ask' — consult the client's decision.
  const granted = input.approvals?.get(input.id)
  if (granted === true) return { decision: 'allow', needsApproval: false }
  if (granted === false) return { decision: 'deny', needsApproval: false }
  return { decision: 'deny', needsApproval: true }
}

/** Build the AG-UI `approval-requested` CUSTOM event for a harness action. */
export function buildApprovalRequestedEvent(input: {
  approvalId: string
  title: string
  threadId: string
  runId: string
  detail?: Record<string, unknown>
}): StreamChunk {
  return {
    type: EventType.CUSTOM,
    name: APPROVAL_REQUESTED_EVENT,
    value: {
      approvalId: input.approvalId,
      title: input.title,
      ...(input.detail ?? {}),
    },
    timestamp: Date.now(),
    threadId: input.threadId,
    runId: input.runId,
  }
}
