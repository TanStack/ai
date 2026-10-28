/**
 * Catalog of well-known AG-UI `CUSTOM` event names used by the sandbox/agent
 * layers, plus their payload shapes.
 *
 * The persisted run log is the AG-UI `StreamChunk` stream itself — there is no
 * separate `RunEvent` type. Agent activity that has no first-class AG-UI event
 * (process output, file diffs, ports, approvals, artifacts, sandbox lifecycle)
 * rides on `CUSTOM` events carrying one of these names. Centralizing the names +
 * payloads here keeps emitters (harness adapters, sandbox) and consumers
 * (persistence projections, devtools, diff/terminal panels) in agreement without
 * inventing a parallel event union.
 */
import { EventType } from './types'
import type { CustomEvent, StreamChunk } from './types'

/** Well-known CUSTOM event names. */
export const CUSTOM_EVENT = {
  FILE_CHANGED: 'file.changed',
  PROCESS_STDOUT: 'process.stdout',
  PROCESS_STDERR: 'process.stderr',
  PORT_OPENED: 'port.opened',
  APPROVAL_REQUESTED: 'approval.requested',
  APPROVAL_RESOLVED: 'approval.resolved',
  ARTIFACT_CREATED: 'artifact.created',
  SANDBOX_CREATED: 'sandbox.created',
  SANDBOX_RESUMED: 'sandbox.resumed',
} as const

/** Union of the well-known CUSTOM event name literals. */
export type WellKnownCustomEventName =
  (typeof CUSTOM_EVENT)[keyof typeof CUSTOM_EVENT]

// ---- Payload shapes ----

export interface FileChangedPayload {
  type: 'create' | 'change' | 'delete'
  /** Absolute path inside the sandbox (under the workspace root). */
  path: string
  /** Unified diff, when the harness can produce one. */
  diff?: string
  timestamp: number
}

export interface ProcessOutputPayload {
  /** Stable id for the spawned process whose output this is. */
  processId: string
  /** A chunk of stdout/stderr text. */
  chunk: string
}

export interface PortOpenedPayload {
  port: number
  /** Externally reachable URL, when the provider exposes one. */
  url?: string
}

export interface ApprovalRequestedPayload {
  approvalId: string
  title: string
  /** Free-form detail describing the action awaiting approval. */
  [key: string]: unknown
}

export interface ApprovalResolvedPayload {
  approvalId: string
  granted: boolean
}

export interface ArtifactCreatedPayload {
  artifactId: string
  name: string
  mimeType: string
  size: number
}

export interface SandboxLifecyclePayload {
  sandboxId: string
  provider: string
}

/** Maps each well-known name to its payload type. */
export interface CustomEventPayloads {
  [CUSTOM_EVENT.FILE_CHANGED]: FileChangedPayload
  [CUSTOM_EVENT.PROCESS_STDOUT]: ProcessOutputPayload
  [CUSTOM_EVENT.PROCESS_STDERR]: ProcessOutputPayload
  [CUSTOM_EVENT.PORT_OPENED]: PortOpenedPayload
  [CUSTOM_EVENT.APPROVAL_REQUESTED]: ApprovalRequestedPayload
  [CUSTOM_EVENT.APPROVAL_RESOLVED]: ApprovalResolvedPayload
  [CUSTOM_EVENT.ARTIFACT_CREATED]: ArtifactCreatedPayload
  [CUSTOM_EVENT.SANDBOX_CREATED]: SandboxLifecyclePayload
  [CUSTOM_EVENT.SANDBOX_RESUMED]: SandboxLifecyclePayload
}

/** A CUSTOM event narrowed to a specific well-known name and its payload. */
export type WellKnownCustomEvent<TName extends WellKnownCustomEventName> =
  CustomEvent & { name: TName; value: CustomEventPayloads[TName] }

/**
 * Type guard: is `chunk` a CUSTOM event with the given well-known `name`?
 * Narrows the payload type when true, so consumers read `chunk.value` typed.
 */
export function isCustomEvent<TName extends WellKnownCustomEventName>(
  chunk: StreamChunk,
  name: TName,
): chunk is WellKnownCustomEvent<TName> {
  return chunk.type === EventType.CUSTOM && chunk.name === name
}
