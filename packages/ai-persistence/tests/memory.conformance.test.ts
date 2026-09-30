import { runPersistenceConformance } from '../src/testkit/conformance'
import { memoryLogStore, memoryPersistence } from '../src/memory'
import { defineAIPersistence } from '../src/types'

runPersistenceConformance('memory', () => memoryPersistence(), {
  checks: ['messages.metadata', 'runs.listByThread.state'],
})

// memoryPersistence() has no log, so the log cases run in their own suite.
runPersistenceConformance(
  'memory + log',
  () =>
    defineAIPersistence({
      stores: { ...memoryPersistence().stores, log: memoryLogStore() },
    }),
  { checks: ['messages.metadata', 'runs.listByThread.state'] },
)
