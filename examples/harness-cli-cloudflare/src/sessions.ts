import { randomUUID } from 'node:crypto'
import { workerSessions, workerStores } from './cloudflare-stores'
import { currentWorker } from './worker-config'

/** A new session id: short, so it is easy to type after `--resume`. */
export const newSessionId = () => randomUUID().slice(0, 8)

/** Is `threadId` a saved session in your Worker? */
export async function hasSession(threadId: string) {
  const { log } = workerStores(currentWorker())
  return (await log.read(threadId, { limit: 1 })).length > 0
}

/**
 * The saved sessions in your Worker, newest first, with what the user said
 * first. A session with no message yet is left out.
 */
export function listSessions(limit = 20) {
  return workerSessions(currentWorker(), limit)
}
