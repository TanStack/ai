import { runSandboxStoreConformance } from '@tanstack/ai-sandbox/testkit'
import { createDrizzleSandboxStore } from '../src/index'
import { sqlitePersistence } from '../src/sqlite'

// A fresh in-memory database per store keeps each conformance case isolated.
runSandboxStoreConformance('drizzle-sqlite', () => {
  const persistence = sqlitePersistence({ url: ':memory:', migrate: true })
  return createDrizzleSandboxStore(persistence.db)
})
