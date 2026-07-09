import { runPersistenceConformance } from '@tanstack/ai-persistence/testkit'
import { sqlPersistence } from '../src/index'

runPersistenceConformance('drizzle-sqlite', () =>
  sqlPersistence({ dialect: 'sqlite', url: ':memory:', migrate: true }),
)
