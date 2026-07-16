import { useState } from 'react'
import { KeyRound, Lock, X } from 'lucide-react'
import { BYOK_PROVIDERS, useByok } from '@tanstack/ai-byok/react'
import type { KeyStatus, ProviderId } from '@tanstack/ai-byok/react'

// BYOK-supported providers in this example (see byok-config.ts).
const PROVIDERS: Array<ProviderId> = [
  'openai',
  'anthropic',
  'gemini',
  'grok',
  'groq',
  'openrouter',
]

interface ByokKeyDialogProps {
  /** Which providers have a key in the server env (never the key itself). */
  envStatus: Partial<Record<ProviderId, boolean>>
  /** The provider for the currently selected model, flagged on the icon when keyless. */
  activeProvider: ProviderId | null
  /** Controlled open state (the modal can be opened reactively, not just by the icon). */
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Provider row to highlight when opened reactively (e.g. a missing key). */
  highlightProvider?: ProviderId | null
  /** Start OpenRouter PKCE sign-in (parent runs auto-complete on return). */
  onOpenRouterLogin?: () => void
  openRouterCompleting?: boolean
  openRouterError?: string | null
}

/**
 * Key-icon button + modal for entering per-provider BYOK keys. Keys stay in the
 * browser (passkey-encrypted where supported, else session-only) and are
 * attached per-request by the caller. Only the last 4 characters are ever shown
 * back; saved-but-locked keys show a lock until unlocked.
 */
export function ByokKeyDialog({
  envStatus,
  activeProvider,
  open,
  onOpenChange,
  highlightProvider,
  onOpenRouterLogin,
  openRouterCompleting,
  openRouterError,
}: ByokKeyDialogProps) {
  const { keys, status, locked, unlock } = useByok()

  // Attention needed when the selected model's provider isn't usable right now
  // (no server key and no decrypted key — whether missing or saved-but-locked).
  const activeNeedsKey =
    activeProvider != null &&
    !envStatus[activeProvider] &&
    !keys[activeProvider]

  return (
    <>
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        title="API keys"
        aria-label="API keys"
        className="relative flex items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10 p-2 text-orange-400 transition-colors hover:bg-orange-500/20"
      >
        <KeyRound className="h-5 w-5" />
        {activeNeedsKey ? (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-amber-400 ring-2 ring-gray-800" />
        ) : null}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => onOpenChange(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">API keys</h2>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-gray-400 hover:bg-gray-800 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-sm text-gray-400">
              Keys stay in your browser and are sent per-request in a header —
              never stored on the server. Providers with a server key already
              work without one.
            </p>

            {locked ? (
              <button
                type="button"
                onClick={() => void unlock()}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm font-medium text-amber-300 hover:bg-amber-400/20"
              >
                <Lock className="h-4 w-4" />
                Unlock saved keys
              </button>
            ) : null}

            {openRouterCompleting ? (
              <p className="mb-3 text-sm text-gray-400">
                Completing OpenRouter sign-in…
              </p>
            ) : null}
            {openRouterError ? (
              <p className="mb-3 text-sm text-red-400">{openRouterError}</p>
            ) : null}

            <div className="flex flex-col gap-3">
              {PROVIDERS.map((provider) => (
                <ProviderKeyRow
                  key={provider}
                  provider={provider}
                  hasEnvKey={Boolean(envStatus[provider])}
                  status={status[provider]}
                  highlight={provider === highlightProvider}
                  onOpenRouterLogin={
                    provider === 'openrouter' ? onOpenRouterLogin : undefined
                  }
                />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function ProviderKeyRow({
  provider,
  hasEnvKey,
  status,
  highlight,
  onOpenRouterLogin,
}: {
  provider: ProviderId
  hasEnvKey: boolean
  status: KeyStatus
  highlight?: boolean
  onOpenRouterLogin?: () => void
}) {
  const { keys, setKey, clearKey } = useByok()
  const [draft, setDraft] = useState('')
  const yourKey = keys[provider]
  // Saved-but-not-decrypted this session (persistent storage after a refresh).
  const lockedLast4 = status.state === 'locked' ? status.masked.slice(-4) : null

  return (
    <div
      className={`rounded-lg border bg-gray-800/50 p-3 ${
        highlight
          ? 'border-amber-400/60 ring-1 ring-amber-400/40'
          : 'border-gray-700'
      }`}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-white">
          {BYOK_PROVIDERS[provider].label}
        </span>
        {yourKey ? (
          <span className="text-xs font-medium text-emerald-400">
            Your key ··{yourKey.slice(-4)}
          </span>
        ) : lockedLast4 ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-300">
            <Lock className="h-3 w-3" />
            ··{lockedLast4}
          </span>
        ) : hasEnvKey ? (
          <span className="text-xs font-medium text-gray-400">Server key</span>
        ) : (
          <span className="text-xs font-medium text-amber-400">No key</span>
        )}
      </div>
      {provider === 'openrouter' &&
      onOpenRouterLogin &&
      !yourKey &&
      status.state === 'empty' ? (
        <button
          type="button"
          onClick={onOpenRouterLogin}
          className="mb-2 w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          Sign in with OpenRouter
        </button>
      ) : null}

      <form
        className="flex gap-2"
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
          placeholder={yourKey ? 'Replace key…' : `Paste ${provider} key…`}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="min-w-0 flex-1 rounded-md border border-gray-600 bg-gray-900 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
        />
        <button
          type="submit"
          disabled={!draft}
          className="rounded-md bg-orange-500 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-orange-600 disabled:opacity-40"
        >
          Save
        </button>
        {yourKey ? (
          <button
            type="button"
            onClick={() => void clearKey(provider)}
            className="rounded-md border border-gray-600 px-3 py-1 text-sm text-gray-300 hover:bg-gray-700"
          >
            Clear
          </button>
        ) : null}
      </form>
    </div>
  )
}
