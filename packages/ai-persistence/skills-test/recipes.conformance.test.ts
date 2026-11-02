import type { AIPersistenceStores } from '../src/types'
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

runPersistenceConformance('drizzle-sqlite', () => drizzleSqlite, { skip })
runPersistenceConformance('drizzle-pg', () => drizzlePg, { skip })
runPersistenceConformance('custom-pg', () => customPg, { skip })
