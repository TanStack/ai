import type { AIPersistenceStores } from '../src/types'
import type { PersistenceConformanceOptions } from '../src/testkit/conformance'
import { runPersistenceConformance } from '../src/testkit/conformance'
import { pool } from './harness/custom-pg'
import { db as pgDb } from './harness/pg'
import { db as sqliteDb } from './harness/sqlite'
import { loadCustomRecipe, loadDrizzleRecipe } from './load-recipe'

// Open the throwaway databases before the extracted recipes import them.
void pool
void pgDb
void sqliteDb

const skip: Array<keyof AIPersistenceStores> = [
  'activities',
  'generationRuns',
  'artifacts',
  'blobs',
]

const drizzleSqlite = await loadDrizzleRecipe('drizzle-sqlite')
const drizzlePg = await loadDrizzleRecipe('drizzle-pg')
const customPg = await loadCustomRecipe()

const options: PersistenceConformanceOptions = {
  skip,
  checks: ['messages.metadata'],
}

runPersistenceConformance('drizzle-sqlite', () => drizzleSqlite, options)
runPersistenceConformance('drizzle-pg', () => drizzlePg, options)
runPersistenceConformance('custom-pg', () => customPg, options)
