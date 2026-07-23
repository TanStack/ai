import { runSandboxStoreConformance } from '../src/testkit/conformance'
import { InMemorySandboxStore } from '../src/store'

// The reference in-memory store must satisfy the same contract the durable
// backends are held to.
runSandboxStoreConformance('in-memory', () => new InMemorySandboxStore())
