import {
  SandboxCheckpointWriterConflictError,
  SandboxSnapshotError,
} from '@tanstack/ai-sandbox'
import type {
  SandboxSnapshots,
  SaveSandboxSnapshotInput,
} from '@tanstack/ai-sandbox'

export function previewUrlFrom(output: unknown): string | null {
  let value: unknown = output
  if (typeof output === 'string') {
    try {
      value = JSON.parse(output)
    } catch {
      return /^https?:\/\//.test(output) ? output : null
    }
  }
  if (value !== null && typeof value === 'object' && 'url' in value) {
    const url = value.url
    return typeof url === 'string' ? url : null
  }
  return null
}

export const DEFAULT_COMPARE_PROMPT =
  'Keep the same product. Change only the visual direction.'

export function comparePrompt(userText: string): string {
  const trimmed = userText.trim()
  return trimmed.length > 0 ? trimmed : DEFAULT_COMPARE_PROMPT
}

export function variantPrompt(userText: string, variant: 'A' | 'B'): string {
  const prompt = comparePrompt(userText)
  if (variant === 'A') {
    return `${prompt}\n\nThis is variant A. Keep the same product. Use a bold, high-contrast, compact visual direction.`
  }
  return `${prompt}\n\nThis is variant B. Keep the same product. Use a soft, spacious, calm visual direction.`
}

export function threadIdsFromForkBody(body: unknown): Array<string> {
  if (body === null || typeof body !== 'object') return []
  const forks = Reflect.get(body, 'forks')
  if (!Array.isArray(forks)) return []
  return forks.flatMap((fork) => {
    if (fork === null || typeof fork !== 'object') return []
    const id = Reflect.get(fork, 'threadId')
    return typeof id === 'string' && id.length > 0 ? [id] : []
  })
}

export function errorMessageFromBody(body: unknown, fallback: string): string {
  if (body !== null && typeof body === 'object' && 'error' in body) {
    const error = body.error
    if (typeof error === 'string' && error.length > 0) return error
  }
  return fallback
}

function canUseSavedHead(error: unknown): boolean {
  if (error instanceof SandboxSnapshotError) {
    return (
      error.code === 'SANDBOX_SNAPSHOT_MISSING_SANDBOX' ||
      error.code === 'SANDBOX_SNAPSHOT_MISSING_INSTANCES' ||
      error.code === 'SANDBOX_SNAPSHOT_MISSING_REUSABLE_SANDBOX' ||
      error.code === 'SANDBOX_SNAPSHOT_REUSE_NONE'
    )
  }
  return error instanceof SandboxCheckpointWriterConflictError
}

export async function forkStudioThreads(input: {
  snapshots: SandboxSnapshots
  threadId: string
  runId: string
  count: 1 | 2
  label?: string
  sandbox?: SaveSandboxSnapshotInput['sandbox']
  instances?: SaveSandboxSnapshotInput['instances']
  locks?: SaveSandboxSnapshotInput['locks']
}): Promise<{
  sourceCheckpointId: string
  forks: Array<{ threadId: string; checkpointId: string }>
}> {
  let sourceCheckpointId: string | null = null
  try {
    const saved = await input.snapshots.save({
      threadId: input.threadId,
      runId: input.runId,
      label: input.label ?? 'studio-fork',
      ...(input.sandbox === undefined ? {} : { sandbox: input.sandbox }),
      ...(input.instances === undefined ? {} : { instances: input.instances }),
      ...(input.locks === undefined ? {} : { locks: input.locks }),
    })
    sourceCheckpointId = saved.id
  } catch (error) {
    if (!canUseSavedHead(error)) throw error
    sourceCheckpointId = await input.snapshots.checkpoints.getHead(
      input.threadId,
    )
  }
  if (sourceCheckpointId === null) {
    throw new Error('Build the app first. Then you can fork or compare.')
  }

  const forks: Array<{ threadId: string; checkpointId: string }> = []
  for (let index = 0; index < input.count; index++) {
    const destinationThreadId = `studio-${crypto.randomUUID()}`
    const checkpoint = await input.snapshots.fork({
      threadId: input.threadId,
      checkpointId: sourceCheckpointId,
      destinationThreadId,
    })
    forks.push({
      threadId: destinationThreadId,
      checkpointId: checkpoint.id,
    })
  }
  return { sourceCheckpointId, forks }
}
