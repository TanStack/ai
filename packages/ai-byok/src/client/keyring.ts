import { PROVIDER_IDS, byokHeaderName } from '../shared/providers'
import type { ProviderId } from '../shared/providers'

/**
 * In-memory map of `provider → key`. The browser is the system of record for
 * keys; this is the shape held in client state and persisted (when a
 * persisting storage tier is selected).
 */
export type Keyring = Partial<Record<ProviderId, string>>

/**
 * Turns a keyring into request headers for the connection layer — one header
 * per present provider. Absent/empty keys are skipped.
 *
 * @example
 * ```ts
 * useChat({
 *   connection: fetchServerSentEvents('/api/chat', {
 *     headers: byokHeaders(keys),
 *   }),
 * })
 * ```
 */
export function byokHeaders(keys: Keyring): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const provider of PROVIDER_IDS) {
    const key = keys[provider]
    if (key) headers[byokHeaderName(provider)] = key
  }
  return headers
}
