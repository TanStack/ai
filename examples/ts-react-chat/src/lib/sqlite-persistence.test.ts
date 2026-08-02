/**
 * Proves the in-example `node:sqlite` backend satisfies the full
 * `AIPersistence` contract by running the shared conformance testkit from
 * `@tanstack/ai-persistence`. This is exactly how you would verify your own
 * hand-rolled adapter: point the testkit at your factory and keep it green.
 */
import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from './sqlite-persistence'

// All seven stores are provided — the four chat state stores plus
// `generationRuns` + `artifacts` + `blobs` — so nothing is skipped. (Locks are
// not a store and the suite does not cover them — this backend has no
// distributed lock primitive, which is a separate `withLocks` concern.)
runPersistenceConformance('ts-react-chat example (node:sqlite)', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
