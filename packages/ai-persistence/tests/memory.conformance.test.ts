import { runPersistenceConformance } from '../src/testkit/conformance'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '../src/memory'
import { defineAIPersistence } from '../src/types'

// One log state, so the twin's log store sees the same log as a second
// machine does.
const state = memoryLogState()

// The log goes on the shared state, so the twin can read it.
runPersistenceConformance(
  'memory',
  () =>
    defineAIPersistence({
      stores: {
        ...memoryPersistence().stores,
        log: memoryLogStore({ state }),
      },
    }),
  {
    checks: ['messages.metadata', 'runs.listByThread.state'],
    // A second log store instance on the same state. The other stores are
    // shared as they are.
    twin: (persistence) =>
      defineAIPersistence({
        stores: { ...persistence.stores, log: memoryLogStore({ state }) },
      }),
  },
)
