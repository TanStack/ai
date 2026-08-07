import { runSandboxInstanceStoreConformance } from '../src/testkit/conformance'
import { InMemorySandboxInstanceStore } from '../src/instance-store'

runSandboxInstanceStoreConformance(
  'InMemorySandboxInstanceStore',
  () => new InMemorySandboxInstanceStore(),
)
