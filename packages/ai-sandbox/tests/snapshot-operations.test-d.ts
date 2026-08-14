import { expectTypeOf } from 'vitest'
import { memorySandboxSnapshots, SandboxSnapshotError } from '../src'
import type { SandboxSnapshotErrorCode, SandboxSnapshots } from '../src'

type ExpectedSandboxSnapshotErrorCode =
  | 'SANDBOX_SNAPSHOT_MISSING_SANDBOX'
  | 'SANDBOX_SNAPSHOT_MISSING_INSTANCES'
  | 'SANDBOX_SNAPSHOT_MISSING_PERSISTENCE_STORES'
  | 'SANDBOX_SNAPSHOT_MISSING_REUSABLE_SANDBOX'
  | 'SANDBOX_SNAPSHOT_REUSE_NONE'
  | 'SANDBOX_SNAPSHOT_MISSING_CHECKPOINT_ARTIFACT'
  | 'SANDBOX_SNAPSHOT_FOREIGN_CHECKPOINT_ARTIFACT'
  | 'SANDBOX_SNAPSHOT_INVALID_ARTIFACT_BYTES'
  | 'SANDBOX_SNAPSHOT_FORK_UNAVAILABLE'
  | 'SANDBOX_SNAPSHOT_INVALID_PATH'
  | 'SANDBOX_SNAPSHOT_INVALID_WORKSPACE'
  | 'SANDBOX_SNAPSHOT_LSTAT_REQUIRED'
  | 'SANDBOX_SNAPSHOT_UNSUPPORTED_ENTRY'
  | 'SANDBOX_SNAPSHOT_MISSING_BLOB'
  | 'SANDBOX_SNAPSHOT_INVALID_BLOB'
  | 'SANDBOX_SNAPSHOT_ARTIFACT_SUPPORT_REQUIRED'
  | 'SANDBOX_SNAPSHOT_MISSING_ARTIFACT_BLOB'

expectTypeOf<SandboxSnapshotErrorCode>().toEqualTypeOf<ExpectedSandboxSnapshotErrorCode>()
const sourceError = new SandboxSnapshotError(
  'SANDBOX_SNAPSHOT_MISSING_REUSABLE_SANDBOX',
  'missing',
)
expectTypeOf(sourceError.code).toEqualTypeOf<SandboxSnapshotErrorCode>()

async function assignActualMemorySnapshots(): Promise<void> {
  const snapshots = await memorySandboxSnapshots()
  const structuralSnapshots: SandboxSnapshots = snapshots
  expectTypeOf(snapshots.save).toBeFunction()
  expectTypeOf(snapshots.fork).toBeFunction()
  expectTypeOf(snapshots.readArtifact).toBeFunction()
  void structuralSnapshots
}
void assignActualMemorySnapshots
