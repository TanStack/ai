import { InMemorySandboxCheckpointStore } from '../src/checkpoint-store'
import { runSandboxCheckpointStoreConformance } from '../src/testkit/checkpoint-conformance'
import { runSandboxCheckpointForkConformance } from '../src/testkit/checkpoint-fork-conformance'
import { memorySandboxSnapshots } from '../src/memory-snapshots'
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'

let now = 1_000
runSandboxCheckpointStoreConformance(
  'in-memory reference',
  (options) => new InMemorySandboxCheckpointStore(options),
  { now: () => now, leaseDurationMs: 100, renewAfterMs: 25 },
)

runSandboxCheckpointForkConformance('memory snapshots', memorySandboxSnapshots)
runPersistenceConformance('memory snapshots persistence', async () => {
  const { persistence } = await memorySandboxSnapshots()
  return persistence
})
