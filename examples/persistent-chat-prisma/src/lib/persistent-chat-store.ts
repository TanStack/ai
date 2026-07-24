import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3'
import { prismaPersistence } from '@tanstack/ai-persistence-prisma'
import { PrismaClient } from '../generated/prisma/client'

let instance: ReturnType<typeof prismaPersistence> | undefined

/**
 * One Prisma (SQLite) persistence store, shared by the POST handler (writes the
 * transcript, run records, and interrupts) and the GET handler (durability
 * replay / `reconstructChat`).
 *
 * Prisma 7 talks to SQLite through the `@prisma/adapter-better-sqlite3` driver
 * adapter. The tables come from the committed Prisma migrations in
 * `prisma/migrations` (applied by `prisma migrate deploy`, which `predev` runs).
 * `prismaPersistence` types its client structurally, so the v7 generated client
 * (imported from the generator `output` path, not `@prisma/client`) wires in
 * without a type mismatch. `.data/` is gitignored.
 */
export function persistentChatPersistence() {
  if (instance) return instance
  const adapter = new PrismaBetterSqlite3({
    url: process.env.DATABASE_URL || 'file:./.data/persistent-chat.db',
  })
  const prisma = new PrismaClient({ adapter })
  return (instance = prismaPersistence(prisma))
}
