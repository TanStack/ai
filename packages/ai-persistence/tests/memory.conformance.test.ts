import { runPersistenceConformance } from '../src/testkit/conformance'
import {
  memoryLeaseStore,
  memoryLogStore,
  memoryPersistence,
} from '../src/memory'
import { defineAIPersistence } from '../src/types'

// memoryPersistence() has no log, so add one to run the log cases too.
runPersistenceConformance(
  'memory',
  () =>
    defineAIPersistence({
      stores: {
        ...memoryPersistence().stores,
        log: memoryLogStore(),
        leases: memoryLeaseStore(),
      },
    }),
  { checks: ['messages.metadata', 'runs.listByThread.state'] },
)
