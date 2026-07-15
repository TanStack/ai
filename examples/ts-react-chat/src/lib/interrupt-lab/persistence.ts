import { composePersistence } from '@tanstack/ai-persistence'
import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

type InterruptLabPersistence = ReturnType<
  typeof createInterruptLabPersistenceBackend
>

let persistence: InterruptLabPersistence | undefined

function createInterruptLabPersistenceBackend(url: string) {
  const sqlite = sqlitePersistence({
    url,
    migrate: true,
  })
  const composed = composePersistence(sqlite, {
    overrides: {
      metadata: false,
      locks: false,
      artifacts: false,
      blobs: false,
    },
  })
  return {
    ...composed,
    close: () => sqlite.close(),
  }
}

function cacheInterruptLabPersistence(
  instance: InterruptLabPersistence,
): InterruptLabPersistence {
  let closed = false
  const cached: InterruptLabPersistence = {
    ...instance,
    close() {
      if (closed) return
      closed = true
      try {
        instance.close()
      } finally {
        if (persistence === cached) {
          persistence = undefined
        }
      }
    },
  }
  return cached
}

/** Dedicated durable-state namespace for the interrupt manual lab. */
export function createInterruptLabPersistence(options?: {
  url?: string
}): InterruptLabPersistence {
  if (options?.url !== undefined) {
    return createInterruptLabPersistenceBackend(options.url)
  }
  persistence ??= cacheInterruptLabPersistence(
    createInterruptLabPersistenceBackend(
      process.env.INTERRUPT_LAB_DB_URL ?? 'file:./interrupt-lab-persistence.db',
    ),
  )
  return persistence
}
