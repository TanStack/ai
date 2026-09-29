import {
  composePersistence,
  memoryPersistence,
  retrieveBlob,
} from '@tanstack/ai-persistence'
import { fileCredentials } from './credentials'
import type { ByokProvider } from '@tanstack/ai/byok'

/** Sign-ins and the model keys you save with `/connect`, kept in a file. */
const credentials = fileCredentials()

/**
 * Everything in memory, except sign-ins and keys, which are kept in a file.
 * The memory stores also keep media: the files you send and the files agents
 * make.
 */
export const persistence = composePersistence(memoryPersistence(), {
  overrides: { credentials },
})

/** The bytes of a stored media file, or `undefined` when it is gone. */
export async function mediaBytes(id: string) {
  const blob = await retrieveBlob(persistence, id)
  return blob ? new Uint8Array(await blob.arrayBuffer()) : undefined
}

/** The value of the first env var of `provider` that is set, or `null`. */
export function envKey(provider: ByokProvider) {
  const names = provider.env ?? []
  const name = names.find((env) => Boolean(process.env[env]))
  return name ? (process.env[name] ?? null) : null
}

/**
 * The key for `provider` that the session of `threadId` uses: the one you
 * saved with `/connect <id>`, else its env var, else `null`. The CLI opens
 * its session without a user, so the scope is the thread only.
 */
export async function providerKey(provider: ByokProvider, threadId: string) {
  const saved = await credentials.get({ threadId }, provider.id)
  if (saved?.type === 'api_key') return saved.value
  return envKey(provider)
}
