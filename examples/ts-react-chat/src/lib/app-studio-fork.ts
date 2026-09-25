import {
  SandboxCheckpointWriterConflictError,
  SandboxSnapshotError,
} from '@tanstack/ai-sandbox'
import type {
  SandboxSnapshots,
  SaveSandboxSnapshotInput,
} from '@tanstack/ai-sandbox'

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
