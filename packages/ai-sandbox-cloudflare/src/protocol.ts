/**
 * The wire contract for the ONE request that crosses the DO → container boundary
 * to start a run: `POST /run` on the in-container runner.
 *
 * Defined ONCE here so both sides import the same shape AND the same narrowing
 * guard, with NO runtime-specific imports (no `cloudflare:*`, no `node:*`):
 *  - the `ContainerSandboxCoordinator` (Workers side) builds a
 *    {@link ContainerRunRequest} and POSTs it (re-exported from `/agent`);
 *  - the in-container `runInContainerHarness` (Node side) validates the body
 *    with {@link parseContainerRunRequest} before running `chat()` (imported
 *    from `/runner`).
 *
 * It carries the run identity + conversation + serialized host-tool descriptors
 * + the tool-exec callback, plus the `harness`/`model`/`workspace` the runner
 * needs to build the right adapter and sandbox.
 *
 * NOTE: the workspace's secret VALUES do NOT cross this boundary — `createSecrets`
 * stores them under a non-enumerable symbol, so JSON-serializing the workspace
 * carries only the secret NAMES. The runner reconstructs runtime secrets from
 * the container env (the DO injects them via `sandbox.setEnvVars`).
 */
import type { ModelMessage } from '@tanstack/ai'
import type { ToolDescriptor, WorkspaceDefinition } from '@tanstack/ai-sandbox'

/**
 * The in-sandbox harnesses the runner can spawn. Single source of truth: the
 * {@link HarnessId} type is DERIVED from this list, and {@link isHarnessId}
 * validates against it — so the runtime guard and the compile-time type can
 * never drift.
 */
const HARNESS_IDS = ['claude-code', 'codex', 'antigravity-cli', 'opencode'] as const

/**
 * Identifier for the in-sandbox harness the runner spawns. The runner maps this
 * to the matching `*Text` adapter (via the caller's `resolveAdapter`); the DO
 * never imports the adapter packages.
 */
export type HarnessId = (typeof HARNESS_IDS)[number]

/**
 * The body of `POST /run`: the run identity + conversation + serialized
 * host-tool descriptors + the tool-exec callback, plus the harness/model/
 * workspace the runner needs to build the right adapter.
 */
export interface ContainerRunRequest {
  runId: string
  threadId: string
  messages: Array<ModelMessage>
  harness: HarnessId
  model: string
  workspace: WorkspaceDefinition
  /** Host-tool descriptors serialized by `toolDescriptors()` on the DO. */
  toolDescriptors: Array<ToolDescriptor>
  /** DO endpoint the in-container `httpRemoteToolExecutor` POSTs tool calls to. */
  toolExecUrl: string
  /** Per-run bearer token gating that tool-exec endpoint. */
  toolExecToken: string
}

function isHarnessId(value: unknown): value is HarnessId {
  return (
    typeof value === 'string' &&
    (HARNESS_IDS as ReadonlyArray<string>).includes(value)
  )
}

function isToolDescriptor(value: unknown): value is ToolDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

function isWorkspaceDefinition(value: unknown): value is WorkspaceDefinition {
  return (
    value !== null &&
    typeof value === 'object' &&
    'source' in value &&
    value.source !== null &&
    typeof value.source === 'object'
  )
}

/**
 * Assert enough of a message to fail fast on garbage (a non-empty `role` and a
 * `content` field). The chat engine validates the full shape downstream; this
 * narrows the array element to {@link ModelMessage} without a cast.
 */
function isModelMessage(value: unknown): value is ModelMessage {
  return (
    value !== null &&
    typeof value === 'object' &&
    'role' in value &&
    typeof value.role === 'string' &&
    'content' in value
  )
}

/** Narrow `unknown` to an indexable record (a predicate, not a cast). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object'
}

function requireNonEmptyString(
  value: Record<string, unknown>,
  key: string,
): string {
  const found = value[key]
  if (typeof found !== 'string' || found === '') {
    throw new Error(`run request: ${key} must be a non-empty string`)
  }
  return found
}

/**
 * Narrow an unknown `POST /run` body into a {@link ContainerRunRequest} (project
 * rule: no `as`). The message and descriptor shapes are validated downstream by
 * the chat engine and the tool bridge; here we only assert enough to fail fast
 * with a clear error on a malformed request.
 */
export function parseContainerRunRequest(value: unknown): ContainerRunRequest {
  if (!isRecord(value)) {
    throw new Error('run request must be a JSON object')
  }
  const runId = requireNonEmptyString(value, 'runId')
  const threadId = requireNonEmptyString(value, 'threadId')
  const model = requireNonEmptyString(value, 'model')
  const toolExecUrl = requireNonEmptyString(value, 'toolExecUrl')
  const toolExecToken = requireNonEmptyString(value, 'toolExecToken')

  const messages = value['messages']
  if (
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !messages.every(isModelMessage)
  ) {
    throw new Error('run request: messages must be a non-empty ModelMessage[]')
  }

  const harness = value['harness']
  if (!isHarnessId(harness)) {
    throw new Error('run request: harness must be a known harness id')
  }

  const workspace = value['workspace']
  if (!isWorkspaceDefinition(workspace)) {
    throw new Error('run request: workspace must be a WorkspaceDefinition')
  }

  const toolDescriptors = value['toolDescriptors']
  if (
    !Array.isArray(toolDescriptors) ||
    !toolDescriptors.every(isToolDescriptor)
  ) {
    throw new Error('run request: toolDescriptors must be a ToolDescriptor[]')
  }

  return {
    runId,
    threadId,
    messages,
    harness,
    model,
    workspace,
    toolDescriptors,
    toolExecUrl,
    toolExecToken,
  }
}
