import { sqlitePersistence } from '@tanstack/ai-persistence-drizzle/sqlite'

/** Stable thread id for the single-conversation demo. */
export const PERSISTENT_CHAT_THREAD_ID = 'persistent-chat'

let instance: ReturnType<typeof sqlitePersistence> | undefined

/**
 * One SQLite-backed persistence store for the persistent-chat demo, shared by
 * the API route (POST writes the transcript, GET replays / reconstructs it) and
 * the history server function the page loader calls. Lazily opened so importing
 * this module (e.g. from a server-fn module that a client route also imports)
 * never opens the database in the browser bundle.
 *
 * Uses the stock default schema and runtime table bootstrap (not a shipped
 * migration journal). Production apps should emit a schema with
 * `tanstack-ai-drizzle-schema` and migrate via their own drizzle-kit journal.
 * `.data/` is gitignored.
 */
export function persistentChatPersistence() {
  return (instance ??= sqlitePersistence({
    url: './.data/persistent-chat.db',
  }))
}

/**
 * In-process registry of detached runs currently generating, keyed by runId
 * (value = threadId). Shared by the API route (which registers/unregisters a
 * run around its detached lifetime) and the history loader (which asks whether
 * a thread has a live run to hand a fresh client for tailing).
 *
 * Process-local, like the `memoryStream` delivery log it mirrors: if the server
 * restarts mid-run the run is gone anyway and the loader simply reports none.
 * A production delivery backend would answer "active run for this thread" from
 * shared storage instead.
 */
const activeRunsByThread = new Map<string, string>()

export function markRunActive(runId: string, threadId: string): void {
  activeRunsByThread.set(runId, threadId)
}

export function markRunDone(runId: string): void {
  activeRunsByThread.delete(runId)
}

export function isRunActive(runId: string): boolean {
  return activeRunsByThread.has(runId)
}

/** The runId of a live run for `threadId`, or undefined if none is generating. */
export function activeRunForThread(threadId: string): string | undefined {
  for (const [runId, tid] of activeRunsByThread) {
    if (tid === threadId) return runId
  }
  return undefined
}
