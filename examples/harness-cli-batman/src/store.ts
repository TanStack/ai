import {
  defineAIPersistence,
  memoryPersistence,
  retrieveBlob,
} from '@tanstack/ai-persistence'
import { fileCredentials } from './credentials'
import { sessionLog, sessionMetadata } from './sessions'
import type { ByokProvider } from '@tanstack/ai/byok'

/** Sign-ins and the model keys you save with `/connect`, kept in a file. */
const credentials = fileCredentials()
const memory = memoryPersistence().stores

/**
 * The sessions, their settings, and the sign-ins and keys are kept in files,
 * so `--resume <id>` and `/resume` continue a session after a restart. The
 * rest is in memory: the run records, the approvals, and the media (the
 * files you send and the files agents make).
 */
export const persistence = defineAIPersistence({
  stores: {
    log: sessionLog,
    metadata: sessionMetadata,
    credentials,
    runs: memory.runs,
    interrupts: memory.interrupts,
    generationRuns: memory.generationRuns,
    artifacts: memory.artifacts,
    blobs: memory.blobs,
  },
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
 * The key for `provider`: the one you saved with `/connect <id>`, else its
 * env var, else `null`. The CLI opens its sessions without a user, so every
 * session uses the same saved keys.
 */
export async function providerKey(provider: ByokProvider, threadId: string) {
  const saved = await credentials.get({ threadId }, provider.id)
  if (saved?.type === 'api_key') return saved.value
  return envKey(provider)
}
