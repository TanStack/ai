/**
 * Prisma backend (bring-your-own). Persists over a `PrismaClient`'s raw SQL
 * escape hatches — `$queryRawUnsafe(sql, ...params)` for reads and
 * `$executeRawUnsafe(sql, ...params)` for writes — which take a positional-
 * parameter SQL string, exactly matching the shared `SqlDriver` contract.
 *
 * The tables are the same as the raw SQL backend; add the documented Prisma
 * models to your `schema.prisma` and run `prisma migrate`, or opt in to lazy
 * backend migrations with `migrate: true`.
 */
import { createSqlPersistence } from '@tanstack/ai-persistence-sql'
import type {
  Dialect,
  SqlDriver,
  SqlPersistence,
  SqlRow,
} from '@tanstack/ai-persistence-sql'
import type { PersistenceMode } from '@tanstack/ai-persistence'

/** The PrismaClient surface this adapter relies on. */
export interface PrismaRawClient {
  $queryRawUnsafe: <T = unknown>(
    sql: string,
    ...params: Array<unknown>
  ) => Promise<T>
  $executeRawUnsafe: (sql: string, ...params: Array<unknown>) => Promise<number>
  $transaction: <T>(fn: (tx: PrismaRawClient) => Promise<T>) => Promise<T>
}

/** Build a {@link SqlDriver} over a PrismaClient. */
export function createPrismaDriver(
  prisma: PrismaRawClient,
  dialect: Dialect,
): SqlDriver {
  const driver: SqlDriver = {
    dialect,
    async exec(sql, params = []) {
      await prisma.$executeRawUnsafe(sql, ...params)
    },
    async query<T extends SqlRow = SqlRow>(
      sql: string,
      params: ReadonlyArray<unknown> = [],
    ) {
      return prisma.$queryRawUnsafe<Array<T>>(sql, ...params)
    },
    async transaction(fn) {
      return prisma.$transaction((tx) => fn(createPrismaDriver(tx, dialect)))
    },
  }
  return driver
}

export interface PrismaPersistenceOptions {
  prisma: PrismaRawClient
  dialect: Dialect
  mode?: PersistenceMode
  /** Run migrations on first use (default false). */
  migrate?: boolean
}

/** Prisma-backed {@link SqlPersistence}. */
export function prismaPersistence(
  opts: PrismaPersistenceOptions,
): SqlPersistence {
  const driver = createPrismaDriver(opts.prisma, opts.dialect)
  return createSqlPersistence(driver, {
    mode: opts.mode,
    migrate: opts.migrate,
  })
}
