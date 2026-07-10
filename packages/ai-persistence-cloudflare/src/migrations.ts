import initialMigrationSql from './assets/0000_tanstack_ai_initial.sql?raw'

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
]
