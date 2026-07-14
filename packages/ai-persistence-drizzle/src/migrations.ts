import initialMigrationSql from './assets/0000_tanstack_ai_initial.sql?raw'
import interruptBatchesMigrationSql from './assets/0001_tanstack_ai_interrupt_batches.sql?raw'

/** A canonical SQLite migration bundled with the adapter. */
export interface SqliteMigration {
  /** Stable identifier recorded in the TanStack AI migration table. */
  id: string
  /** Filename used by the migration copy CLI. */
  filename: string
  /** SQL applied atomically with its migration bookkeeping row. */
  sql: string
}

/** Ordered canonical migrations for the TanStack AI SQLite schema. */
export const sqliteMigrations: ReadonlyArray<SqliteMigration> = [
  {
    id: '0000_tanstack_ai_initial',
    filename: '0000_tanstack_ai_initial.sql',
    sql: initialMigrationSql,
  },
  {
    id: '0001_tanstack_ai_interrupt_batches',
    filename: '0001_tanstack_ai_interrupt_batches.sql',
    sql: interruptBatchesMigrationSql,
  },
]
