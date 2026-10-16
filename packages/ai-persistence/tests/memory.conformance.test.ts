import { runPersistenceConformance } from '../src/testkit/conformance'
import {
  memoryLeaseStore,
  memoryLogBackend,
  memoryLogStore,
  memoryPersistence,
} from '../src/memory'
import { defineAIPersistence } from '../src/types'

// One log backend, so the twin's log store sees the same log as a second
// machine does.
const backend = memoryLogBackend()

// memoryPersistence() has no log, so add one to run the log cases too.
runPersistenceConformance(
  'memory',
  () =>
    defineAIPersistence({
      stores: {
        ...memoryPersistence().stores,
        log: memoryLogStore({ backend }),
        leases: memoryLeaseStore(),
      },
    }),
  {
    checks: ['messages.metadata', 'runs.listByThread.state'],
    // A second log store instance on the same backend. The other stores are
    // shared as they are.
    twin: (persistence) =>
      defineAIPersistence({
        stores: { ...persistence.stores, log: memoryLogStore({ backend }) },
      }),
  },
)
