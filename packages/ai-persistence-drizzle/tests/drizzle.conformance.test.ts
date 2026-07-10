import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlitePersistence } from '../src/sqlite'

runPersistenceConformance('drizzle-sqlite', () =>
  sqlitePersistence({ url: ':memory:', migrate: true }),
)
