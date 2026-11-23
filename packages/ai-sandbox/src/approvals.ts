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
 *     CUSTOM event (carrying the `approvalId`) and a `sandbox.approval`
 *     activity row with status `pending`, and denies the action this turn.
 *     The client shows UI, then re-runs chat() with the decision in the message;
 *     the engine surfaces it as `approvals`, and the next run allows it. At the
 *     start of that run, the adapter sets the row to `granted` or `denied`.
 *
 * `approvalId` is stable for a given (provider, kind, target) so a client grant
 * matches the same action on the resumed run.
 */
import {
  EventType,
  sandboxApprovalActivity,
  withTanstackMetadata,
} from '@tanstack/ai'
import { evaluateCommand } from './policy'
import type { SandboxPolicy } from './policy'
import type {
  ActivityDeltaEvent,
  ActivitySnapshotEvent,
  StreamChunk,
} from '@tanstack/ai'
import type { BridgeEventChannel } from './bridge-events'

/**
 * CUSTOM event name emitted when a harness action needs client approval.
 *
 * @deprecated Read the `sandbox.approval` activity row instead
 * (`buildApprovalActivity`). The event is still sent, and a later breaking
 * release removes it.
 */
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
  return withTanstackMetadata(
    {
      type: EventType.CUSTOM,
      name: APPROVAL_REQUESTED_EVENT,
      value: {
        approvalId: input.approvalId,
        title: input.title,
        ...(input.detail ?? {}),
      },
      timestamp: Date.now(),
    },
    { threadId: input.threadId, runId: input.runId },
  ) as StreamChunk
}

/** The id of the `sandbox.approval` activity row of an approval. */
function approvalActivityId(id: string) {
  return `sandbox.approval:${id}`
}

/**
 * Emit the pending `sandbox.approval` row and the deprecated
 * `approval-requested` event on a live bridge channel. Call this from a
 * permission callback so a crash or takeover still journals the row.
 */
export function emitPendingApproval(
  channel: Pick<BridgeEventChannel, 'emitCustomEvent' | 'emitActivity'>,
  input: {
    approvalId: string
    title: string
    detail?: Record<string, unknown>
  },
): void {
  channel.emitCustomEvent(APPROVAL_REQUESTED_EVENT, {
    approvalId: input.approvalId,
    title: input.title,
    ...(input.detail ?? {}),
  })
  channel.emitActivity(
    sandboxApprovalActivity,
    approvalActivityId(input.approvalId),
    {
      approvalId: input.approvalId,
      title: input.title,
      status: 'pending',
      ...(input.detail !== undefined && { detail: input.detail }),
    },
  )
}

/**
 * Build the `sandbox.approval` activity row for a harness action that waits
 * for a client decision. The status is `pending`. The row id is
 * `sandbox.approval:<approvalId>`, so a later run updates the same row.
 *
 * A harness adapter yields it right after the `approval-requested` event,
 * with the same input.
 */
export function buildApprovalActivity(input: {
  approvalId: string
  title: string
  threadId: string
  runId: string
  detail?: Record<string, unknown>
}): ActivitySnapshotEvent {
  return withTanstackMetadata(
    sandboxApprovalActivity.snapshot(approvalActivityId(input.approvalId), {
      approvalId: input.approvalId,
      title: input.title,
      status: 'pending',
      ...(input.detail !== undefined && { detail: input.detail }),
    }),
    { threadId: input.threadId, runId: input.runId },
  )
}

/**
 * Build one `ACTIVITY_DELTA` for each client decision of this provider. Each
 * delta sets the `status` of the `sandbox.approval:<approvalId>` row to
 * `granted` or `denied`.
 *
 * `approvals` holds every approval decision of the run, also the decisions
 * of normal tool calls. Only the ids that start with `<provider>:` (see
 * {@link approvalId}) make a delta. A harness adapter yields these right
 * after its `RUN_STARTED`.
 */
export function approvalDecisionActivities(
  approvals: ReadonlyMap<string, boolean> | undefined,
  meta: { provider: string; threadId: string; runId: string },
): Array<ActivityDeltaEvent> {
  const decisions = [...(approvals ?? [])].filter(([id]) =>
    id.startsWith(`${meta.provider}:`),
  )
  return decisions.map(([id, granted]) => {
    const delta: ActivityDeltaEvent = {
      type: EventType.ACTIVITY_DELTA,
      messageId: approvalActivityId(id),
      activityType: sandboxApprovalActivity.activityType,
      patch: [
        {
          op: 'replace',
          path: '/status',
          value: granted ? 'granted' : 'denied',
        },
      ],
      timestamp: Date.now(),
    }
    return withTanstackMetadata(delta, {
      threadId: meta.threadId,
      runId: meta.runId,
    })
  })
}
