import { EventType, withTanstackMetadata } from '@tanstack/ai'
import { evaluateCommand } from './policy'
import type { SandboxPolicy } from './policy'
import type { StreamChunk } from '@tanstack/ai'

/** CUSTOM event name emitted when a harness action needs client approval. */
export const /** CUSTOM event name emitted when a harness action needs client approval. */
APPROVAL_REQUESTED_EVENT = 'approval-requested'

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
  /** A stable, opaque approval id for a harness action. */
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
