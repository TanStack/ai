import {
  defineAIPersistence,
  memoryPersistence,
} from '@tanstack/ai-persistence'
import { workerStores } from './cloudflare-stores'
import { currentWorker } from './worker-config'
import type { ByokProvider } from '@tanstack/ai/byok'

const memory = memoryPersistence().stores

/**
 * The stores of a session. Your Worker keeps the session log, the settings
 * and plugin state, the sign-ins and keys (encrypted), and the media, so
 * `--resume <id>` and `/resume` continue a session after a restart, and on
 * another PC. The run records and the approvals stay in memory.
 */
export function workerPersistence() {
  return defineAIPersistence({
    stores: {
      ...workerStores(currentWorker()),
      runs: memory.runs,
      interrupts: memory.interrupts,
      generationRuns: memory.generationRuns,
    },
  })
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
  const { credentials } = workerStores(currentWorker())
  const saved = await credentials.get({ threadId }, provider.id)
  if (saved?.type === 'api_key') return saved.value
  return envKey(provider)
}
