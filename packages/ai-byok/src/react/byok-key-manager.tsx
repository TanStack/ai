import { useState } from 'react'
import { BYOK_PROVIDERS, PROVIDER_IDS } from '../shared/providers'
import { useByok } from './use-byok'
import type { CSSProperties } from 'react'
import type { KeyStatus } from './byok-context'
import type { ProviderId } from '../shared/providers'

export interface ByokKeyManagerProps {
  /** Providers to show. Defaults to every registered provider. */
  providers?: Array<ProviderId>
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

      {providers.map((provider) => (
        <ProviderRow
          key={provider}
          provider={provider}
          status={status[provider]}
        />
      ))}
    </div>
  )
}

function ProviderRow({
  provider,
  status,
}: {
  provider: ProviderId
  status: KeyStatus
}) {
  const { setKey, clearKey, validateKey } = useByok()
  const [draft, setDraft] = useState('')
  const hasKey = status.state !== 'empty'

  return (
    <div style={styles.row}>
      <div style={styles.rowHeader}>
        <span style={styles.provider}>{BYOK_PROVIDERS[provider].label}</span>
        <StatusBadge status={status} />
      </div>

      {hasKey && 'masked' in status ? (
        <div style={styles.savedRow}>
          <code data-testid={`byok-masked-${provider}`} style={styles.masked}>
            {status.masked}
          </code>
          <div style={styles.actions}>
            <button
              type="button"
              style={styles.button}
              onClick={() => void validateKey(provider)}
            >
              Validate
            </button>
            <button
              type="button"
              style={styles.button}
              onClick={() => void clearKey(provider)}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      <form
        style={styles.inputRow}
        onSubmit={(event) => {
          event.preventDefault()
          if (!draft) return
          void setKey(provider, draft)
          setDraft('')
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          placeholder={hasKey ? 'Replace key…' : `Paste ${provider} key…`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          style={styles.input}
        />
        <button type="submit" style={styles.primaryButton} disabled={!draft}>
          Save
        </button>
      </form>
    </div>
  )
}

function StatusBadge({ status }: { status: KeyStatus }) {
  const config: Record<KeyStatus['state'], { label: string; color: string }> = {
    empty: { label: 'Not set', color: '#9ca3af' },
    set: { label: 'Saved', color: '#6b7280' },
    locked: { label: 'Locked', color: '#d97706' },
    validating: { label: 'Validating…', color: '#d97706' },
    valid: { label: 'Valid', color: '#059669' },
    invalid: { label: 'Invalid', color: '#dc2626' },
    unsupported: { label: 'Cannot verify', color: '#9ca3af' },
    error: { label: 'Check failed', color: '#dc2626' },
  }
  const { label, color } = config[status.state]
  const title = status.state === 'error' ? status.message : undefined
  return (
    <span style={{ ...styles.badge, color }} title={title}>
      {label}
    </span>
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
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  rowHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  provider: { fontWeight: 600 },
  savedRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  masked: {
    fontFamily: 'ui-monospace, monospace',
    color: '#374151',
    letterSpacing: 1,
  },
  actions: { display: 'flex', gap: 6 },
  inputRow: { display: 'flex', gap: 6 },
  input: {
    flex: 1,
    padding: '6px 8px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
  },
  badge: { fontSize: 12, fontWeight: 600 },
  button: {
    padding: '4px 10px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    background: '#fff',
    cursor: 'pointer',
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
