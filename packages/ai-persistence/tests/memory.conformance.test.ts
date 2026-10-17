import { runPersistenceConformance } from '../src/testkit/conformance'
import {
  memoryLogBackend,
  memoryLogStore,
  memoryPersistence,
} from '../src/memory'
import { defineAIPersistence } from '../src/types'

// One log backend, so the twin's log store sees the same log as a second
// machine does.
const backend = memoryLogBackend()

// The log goes on the shared backend, so the twin can read it.
runPersistenceConformance(
  'memory',
  () =>
    defineAIPersistence({
      stores: {
        ...memoryPersistence().stores,
        log: memoryLogStore({ backend }),
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
