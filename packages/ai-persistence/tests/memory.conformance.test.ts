import { runPersistenceConformance } from '../src/testkit/conformance'
import { memoryPersistence } from '../src/memory'

runPersistenceConformance('memory', () => memoryPersistence())
