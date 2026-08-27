import type { ModelMessage } from '@tanstack/ai'
import type { ToolDescriptor, WorkspaceDefinition } from '@tanstack/ai-sandbox'

const HARNESS_IDS = ['claude-code', 'codex', 'opencode'] as const

export type HarnessId = (typeof HARNESS_IDS)[number]

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
  if (typeof found === 'string' && found !== '') {
    return found
  }
  throw new Error(`run request: ${key} must be a non-empty string`)
}

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
    Array.isArray(messages) &&
    messages.length > 0 &&
    messages.every(isModelMessage)
  ) {
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
      Array.isArray(toolDescriptors) &&
      toolDescriptors.every(isToolDescriptor)
    ) {
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
    throw new Error('run request: toolDescriptors must be a ToolDescriptor[]')
  }

  throw new Error('run request: messages must be a non-empty ModelMessage[]')
}
