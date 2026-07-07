import { useContext } from 'react'
import { ByokContext } from './byok-context'
import type { ByokContextValue } from './byok-context'

/**
 * Access the BYOK keyring and controls. Must be called under a
 * {@link ByokProvider}.
 *
 * @example
 * ```tsx
 * const { keys } = useByok()
 * useChat({
 *   connection: fetchServerSentEvents('/api/chat', {
 *     headers: byokHeaders(keys),
 *   }),
 * })
 * ```
 */
export function useByok(): ByokContextValue {
  const context = useContext(ByokContext)
  if (!context) {
    throw new Error('useByok must be used within a <ByokProvider>')
  }
  return context
}
