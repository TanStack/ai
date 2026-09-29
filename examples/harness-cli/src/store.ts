import {
  composePersistence,
  memoryPersistence,
  retrieveBlob,
} from '@tanstack/ai-persistence'
import { fileCredentials } from './credentials'

/**
 * Everything in memory, except sign-ins, which are kept in a file. The
 * memory stores also keep media: the files you send and the files agents make.
 */
export const persistence = composePersistence(memoryPersistence(), {
  overrides: { credentials: fileCredentials() },
})

/** The bytes of a stored media file, or `undefined` when it is gone. */
export async function mediaBytes(id: string) {
  const blob = await retrieveBlob(persistence, id)
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}
