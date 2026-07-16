import { useState } from 'react'
import { BYOK_PROVIDERS } from '../shared/providers'
import { useByok } from './use-byok'
import type { CSSProperties } from 'react'
import type { KeyStatus } from './byok-context'
import type { ProviderId } from '../shared/providers'

export interface ByokOpenRouterLoginProps {
  onLogin: () => void
  completing?: boolean
  error?: string | null
}

export type ByokUiVariant = 'light' | 'dark'

export interface ByokProviderRowProps {
  provider: ProviderId
  status: KeyStatus
  /** When true, the provider has a server env key and needs no BYOK key. */
  hasEnvKey?: boolean
  highlight?: boolean
  openRouter?: ByokOpenRouterLoginProps
  variant?: ByokUiVariant
  styles?: ByokRowStyles
}

export type ByokRowStyles = Record<string, CSSProperties>

export function ByokProviderRow({
  provider,
  status,
  hasEnvKey = false,
  highlight = false,
  openRouter,
  variant = 'light',
  styles,
}: ByokProviderRowProps) {
  const resolvedStyles = styles ?? (variant === 'dark' ? darkStyles : lightStyles)
  const { keys, setKey, clearKey, validateKey } = useByok()
  const [draft, setDraft] = useState('')
  const yourKey = keys[provider]
  const hasKey = status.state !== 'empty'
  const lockedLast4 =
    status.state === 'locked' && 'masked' in status
      ? status.masked.slice(-4)
      : null

  return (
    <div
      style={{
        ...resolvedStyles.row,
        ...(highlight ? resolvedStyles.rowHighlight : {}),
      }}
    >
      <div style={resolvedStyles.rowHeader}>
        <span style={resolvedStyles.provider}>
          {BYOK_PROVIDERS[provider].label}
        </span>
        <ProviderPresenceBadge
          status={status}
          yourKey={yourKey}
          lockedLast4={lockedLast4}
          hasEnvKey={hasEnvKey}
          styles={resolvedStyles}
        />
      </div>

      {hasKey && 'masked' in status ? (
        <div style={resolvedStyles.savedRow}>
          <code
            data-testid={`byok-masked-${provider}`}
            style={resolvedStyles.masked}
          >
            {status.masked}
          </code>
          <div style={resolvedStyles.actions}>
            <button
              type="button"
              style={resolvedStyles.button}
              onClick={() => void validateKey(provider)}
            >
              Validate
            </button>
            <button
              type="button"
              style={resolvedStyles.button}
              onClick={() => void clearKey(provider)}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {provider === 'openrouter' &&
      openRouter &&
      !yourKey &&
      status.state === 'empty' ? (
        <button
          type="button"
          style={resolvedStyles.oauthButton}
          onClick={openRouter.onLogin}
        >
          Sign in with OpenRouter
        </button>
      ) : null}

      <form
        style={resolvedStyles.inputRow}
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
          style={resolvedStyles.input}
        />
        <button
          type="submit"
          style={resolvedStyles.primaryButton}
          disabled={!draft}
        >
          Save
        </button>
      </form>
    </div>
  )
}

function ProviderPresenceBadge({
  status,
  yourKey,
  lockedLast4,
  hasEnvKey,
  styles,
}: {
  status: KeyStatus
  yourKey?: string
  lockedLast4: string | null
  hasEnvKey: boolean
  styles: ByokRowStyles
}) {
  if (yourKey) {
    return (
      <span style={{ ...styles.badge, color: '#059669' }}>Your key</span>
    )
  }
  if (lockedLast4) {
    return (
      <span style={{ ...styles.badge, color: '#d97706' }}>Locked</span>
    )
  }
  if (hasEnvKey) {
    return (
      <span style={{ ...styles.badge, color: '#6b7280' }}>Server key</span>
    )
  }
  return <StatusBadge status={status} styles={styles} />
}

function StatusBadge({
  status,
  styles,
}: {
  status: KeyStatus
  styles: ByokRowStyles
}) {
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

export const lightStyles = {
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    padding: 12,
    border: '1px solid #e5e7eb',
    borderRadius: 8,
  },
  rowHighlight: {
    border: '1px solid #fbbf24',
    boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.4)',
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
  oauthButton: {
    width: '100%',
    padding: '8px 12px',
    borderRadius: 6,
    border: '1px solid #d1d5db',
    background: '#fff',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: 13,
  },
} satisfies ByokRowStyles

export const darkStyles: ByokRowStyles = {
  ...lightStyles,
  row: {
    ...lightStyles.row,
    border: '1px solid #374151',
    background: 'rgba(31, 41, 55, 0.5)',
  },
  rowHighlight: {
    border: '1px solid rgba(251, 191, 36, 0.6)',
    boxShadow: '0 0 0 1px rgba(251, 191, 36, 0.4)',
  },
  provider: { ...lightStyles.provider, color: '#fff' },
  masked: { ...lightStyles.masked, color: '#d1d5db' },
  input: {
    ...lightStyles.input,
    border: '1px solid #4b5563',
    background: '#111827',
    color: '#fff',
  },
  button: {
    ...lightStyles.button,
    border: '1px solid #4b5563',
    background: '#1f2937',
    color: '#e5e7eb',
  },
  primaryButton: {
    ...lightStyles.primaryButton,
    background: '#ea580c',
  },
  oauthButton: {
    ...lightStyles.oauthButton,
    border: '1px solid #4b5563',
    background: '#1f2937',
    color: '#fff',
  },
}