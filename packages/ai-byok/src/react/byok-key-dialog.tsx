import { ByokKeyManager } from './byok-key-manager'
import { useByok } from './use-byok'
import type { ByokKeyManagerProps } from './byok-key-manager'
import type { CSSProperties, ReactNode } from 'react'
import type { ProviderId } from '../shared/providers'

export interface ByokKeyDialogProps extends Omit<
  ByokKeyManagerProps,
  'className' | 'style'
> {
  /** Controlled open state. */
  open: boolean
  onOpenChange: (open: boolean) => void
  /**
   * Provider for the currently selected model. When it needs a key, the trigger
   * shows an attention indicator.
   */
  activeProvider?: ProviderId | null
  /** Custom trigger; defaults to a key-icon button with an attention dot. */
  trigger?: ReactNode
  title?: string
  description?: string
  overlayClassName?: string
  panelClassName?: string
  panelStyle?: CSSProperties
}

/**
 * Modal wrapper around {@link ByokKeyManager} with a trigger button. Use when
 * keys should live behind a dialog instead of inline on the page.
 */
export function ByokKeyDialog({
  open,
  onOpenChange,
  activeProvider = null,
  envStatus,
  trigger,
  title = 'API keys',
  description = 'Keys stay in your browser and are sent per-request in a header — never stored on the server.',
  overlayClassName,
  panelClassName,
  panelStyle,
  ...managerProps
}: ByokKeyDialogProps) {
  const { keys } = useByok()

  const activeNeedsKey =
    activeProvider != null &&
    !envStatus?.[activeProvider] &&
    !keys[activeProvider]

  return (
    <>
      {trigger ?? (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          title="API keys"
          aria-label="API keys"
          style={styles.trigger}
        >
          <KeyIcon />
          {activeNeedsKey ? <span style={styles.attentionDot} /> : null}
        </button>
      )}

      {open ? (
        <div
          className={overlayClassName}
          style={overlayClassName ? undefined : styles.overlay}
          onClick={() => onOpenChange(false)}
        >
          <div
            className={panelClassName}
            style={
              panelClassName ? panelStyle : { ...styles.panel, ...panelStyle }
            }
            onClick={(event) => event.stopPropagation()}
          >
            <div style={styles.panelHeader}>
              <h2
                style={
                  managerProps.variant === 'dark' || panelClassName
                    ? styles.titleDark
                    : styles.title
                }
              >
                {title}
              </h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                aria-label="Close"
                style={
                  managerProps.variant === 'dark' || panelClassName
                    ? styles.closeButtonDark
                    : styles.closeButton
                }
              >
                ×
              </button>
            </div>
            {description ? (
              <p
                style={
                  managerProps.variant === 'dark' || panelClassName
                    ? styles.descriptionDark
                    : styles.description
                }
              >
                {description}
              </p>
            ) : null}
            <ByokKeyManager
              {...managerProps}
              envStatus={envStatus}
              highlightProvider={managerProps.highlightProvider}
              variant={
                managerProps.variant ?? (panelClassName ? 'dark' : 'light')
              }
              style={{
                maxWidth: 'none',
                color: panelClassName ? '#e5e7eb' : undefined,
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

function KeyIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m21 2-2 2" />
      <path d="m15 15 3.3 3.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L18 12" />
      <path d="m2 22 5.5-1.5L21 7 16 2 2.5 14.5z" />
    </svg>
  )
}

const styles = {
  trigger: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    borderRadius: 8,
    border: '1px solid #e5e7eb',
    background: '#f9fafb',
    color: '#374151',
    cursor: 'pointer',
  },
  attentionDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: '#fbbf24',
    boxShadow: '0 0 0 2px #fff',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 50,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    background: 'rgba(0, 0, 0, 0.6)',
  },
  panel: {
    width: '100%',
    maxWidth: 480,
    padding: 20,
    borderRadius: 12,
    border: '1px solid #e5e7eb',
    background: '#fff',
    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
  },
  panelHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  title: { margin: 0, fontSize: 18, fontWeight: 600 },
  titleDark: { margin: 0, fontSize: 18, fontWeight: 600, color: '#fff' },
  closeButton: {
    border: 'none',
    background: 'transparent',
    fontSize: 24,
    lineHeight: 1,
    cursor: 'pointer',
    color: '#6b7280',
  },
  closeButtonDark: {
    border: 'none',
    background: 'transparent',
    fontSize: 24,
    lineHeight: 1,
    cursor: 'pointer',
    color: '#9ca3af',
  },
  description: {
    margin: '0 0 16px',
    fontSize: 14,
    color: '#6b7280',
    lineHeight: 1.4,
  },
  descriptionDark: {
    margin: '0 0 16px',
    fontSize: 14,
    color: '#9ca3af',
    lineHeight: 1.4,
  },
} satisfies Record<string, CSSProperties>
