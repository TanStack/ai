import initialMigrationSql from './assets/0000_tanstack_ai_initial.sql?raw'
import interruptBatchesMigrationSql from './assets/0001_tanstack_ai_interrupt_batches.sql?raw'

export interface D1Migration {
  id: string
  filename: string
  sql: string
}

/** Ordered D1 migrations for messages, runs, interrupts, and metadata. */
export const d1Migrations: ReadonlyArray<D1Migration> = [
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
