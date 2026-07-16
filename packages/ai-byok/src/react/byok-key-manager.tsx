import { useState } from 'react'
import { PROVIDER_IDS } from '../shared/providers'
import { useByok } from './use-byok'
import { ByokProviderRow } from './byok-provider-row'
import type {
  ByokOpenRouterLoginProps,
  ByokUiVariant,
} from './byok-provider-row'
import type { CSSProperties } from 'react'
import type { ProviderId } from '../shared/providers'

export interface ByokKeyManagerProps {
  /** Providers to show. Defaults to every registered provider. */
  providers?: Array<ProviderId>
  /**
   * Which providers already have a server env key (booleans only — never the
   * key values). Rows show "Server key" when true.
   */
  envStatus?: Partial<Record<ProviderId, boolean>>
  /** Highlight a provider row (e.g. after a missing-key prompt). */
  highlightProvider?: ProviderId | null
  /**
   * OpenRouter PKCE controls from `@tanstack/ai-byok/openrouter/react`. Omit
   * when OpenRouter sign-in is not needed.
   */
  openRouter?: ByokOpenRouterLoginProps & {
    completing?: boolean
    error?: string | null
  }
  variant?: ByokUiVariant
  className?: string
  style?: CSSProperties
}

/**
 * Drop-in settings UI for entering, validating, and clearing provider keys.
 *
 * Keys are write-only from this component's perspective: once saved, only the
 * last 4 characters are ever shown. The full key is never rendered back.
 */
export function ByokKeyManager({
  providers = PROVIDER_IDS,
  envStatus,
  highlightProvider,
  openRouter,
  variant = 'light',
  className,
  style,
}: ByokKeyManagerProps) {
  const { status, storage, locked, unlock } = useByok()
  const [unlocking, setUnlocking] = useState(false)
  const [unlockError, setUnlockError] = useState<string | null>(null)

  return (
    <div className={className} style={{ ...styles.root, ...style }}>
      {locked ? (
        <div style={styles.unlockBanner}>
          <span>Your saved keys are locked ({storage.label}).</span>
          <button
            type="button"
            style={styles.primaryButton}
            disabled={unlocking}
            onClick={() => {
              setUnlocking(true)
              setUnlockError(null)
              unlock()
                .catch((error: unknown) =>
                  setUnlockError(
                    error instanceof Error ? error.message : String(error),
                  ),
                )
                .finally(() => setUnlocking(false))
            }}
          >
            {unlocking ? 'Unlocking…' : 'Unlock'}
          </button>
        </div>
      ) : null}
      {unlockError ? <p style={styles.warning}>{unlockError}</p> : null}

      {storage.warning ? <p style={styles.warning}>{storage.warning}</p> : null}

      {openRouter?.completing ? (
        <p style={styles.hint}>Completing OpenRouter sign-in…</p>
      ) : null}
      {openRouter?.error ? (
        <p style={styles.warning}>{openRouter.error}</p>
      ) : null}

      {providers.map((provider) => (
        <ByokProviderRow
          key={provider}
          provider={provider}
          status={status[provider]}
          variant={variant}
          hasEnvKey={Boolean(envStatus?.[provider])}
          highlight={provider === highlightProvider}
          openRouter={
            provider === 'openrouter' && openRouter
              ? {
                  onLogin: openRouter.onLogin,
                  completing: openRouter.completing,
                  error: openRouter.error,
                }
              : undefined
          }
        />
      ))}
    </div>
  )
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: 16,
    fontFamily: 'system-ui, sans-serif',
    fontSize: 14,
    maxWidth: 480,
  },
  warning: { margin: 0, color: '#b45309', fontSize: 12, lineHeight: 1.4 },
  hint: { margin: 0, color: '#6b7280', fontSize: 12, lineHeight: 1.4 },
  unlockBanner: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: 12,
    borderRadius: 8,
    background: '#f3f4f6',
    border: '1px solid #e5e7eb',
  },
  primaryButton: {
    padding: '6px 12px',
    borderRadius: 6,
    border: 'none',
    background: '#111827',
    color: '#fff',
    cursor: 'pointer',
  },
} satisfies Record<string, CSSProperties>
