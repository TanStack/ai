/**
 * The wire contract for the ONE request that crosses the DO → container
 * boundary to start an agent run: `POST /run` on the in-container runner.
 *
 * Shared by both sides so the shape (and its narrowing guard) is defined once:
 * - `src/coordinator.ts` (DO) builds a {@link RunRequest} and POSTs it.
 * - `src/container-runner.ts` (container) validates the body with
 *   {@link parseRunRequest} before running `chat()`.
 *
 * Everything else the agent needs (the MCP transport, native stdin) stays on
 * the container's own localhost — see the README. The only fields here are the
 * run identity, the conversation, the serialized host-tool descriptors, and the
 * callback URL + token the in-container tool stubs use to reach back to the DO.
 */
import type { ModelMessage } from '@tanstack/ai'
import type { ToolDescriptor } from '@tanstack/ai-sandbox'

export interface RunRequest {
  runId: string
  threadId: string
  messages: Array<ModelMessage>
  /** Host-tool descriptors serialized by `toolDescriptors()` on the DO. */
  toolDescriptors: Array<ToolDescriptor>
  /** DO endpoint the in-container `httpRemoteToolExecutor` POSTs tool calls to. */
  toolExecUrl: string
  /** Per-run bearer token gating that tool-exec endpoint. */
  toolExecToken: string
}

function isToolDescriptor(value: unknown): value is ToolDescriptor {
  return (
    value !== null &&
    typeof value === 'object' &&
    'name' in value &&
    typeof value.name === 'string'
  )
}

/**
 * Narrow an unknown `POST /run` body into a {@link RunRequest} (project rule:
 * no `as`). The message and descriptor shapes are validated downstream by the
 * chat engine and the tool bridge; here we only assert enough to fail fast with
 * a clear error on a malformed request.
 */
export function parseRunRequest(value: unknown): RunRequest {
  if (value === null || typeof value !== 'object') {
    throw new Error('run request must be a JSON object')
  }
  if (!('runId' in value) || typeof value.runId !== 'string' || !value.runId) {
    throw new Error('run request: runId must be a non-empty string')
  }
  if (
    !('threadId' in value) ||
    typeof value.threadId !== 'string' ||
    !value.threadId
  ) {
    throw new Error('run request: threadId must be a non-empty string')
  }
  if (
    !('messages' in value) ||
    !Array.isArray(value.messages) ||
    value.messages.length === 0
  ) {
    throw new Error('run request: messages must be a non-empty array')
  }
  if (
    !('toolDescriptors' in value) ||
    !Array.isArray(value.toolDescriptors) ||
    !value.toolDescriptors.every(isToolDescriptor)
  ) {
    throw new Error('run request: toolDescriptors must be a ToolDescriptor[]')
  }
  if (
    !('toolExecUrl' in value) ||
    typeof value.toolExecUrl !== 'string' ||
    !value.toolExecUrl
  ) {
    throw new Error('run request: toolExecUrl must be a non-empty string')
  }
  if (
    !('toolExecToken' in value) ||
    typeof value.toolExecToken !== 'string' ||
    !value.toolExecToken
  ) {
    throw new Error('run request: toolExecToken must be a non-empty string')
  }
  return {
    runId: value.runId,
    threadId: value.threadId,
    messages: value.messages,
    toolDescriptors: value.toolDescriptors,
    toolExecUrl: value.toolExecUrl,
    toolExecToken: value.toolExecToken,
  }
}
