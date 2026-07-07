import { useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { BYOK_PROVIDERS, useByok } from '@tanstack/ai-byok/react'
import type { ProviderId } from '@tanstack/ai-byok/react'

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
  /** The provider for the currently selected model, highlighted when keyless. */
  activeProvider: ProviderId | null
}

/**
 * Key-icon button + modal for entering per-provider BYOK keys. Keys stay in the
 * browser (session-only here) and are attached per-request by the caller. Only
 * the last 4 characters are ever shown back.
 */
export function ByokKeyDialog({
  envStatus,
  activeProvider,
}: ByokKeyDialogProps) {
  const { keys } = useByok()
  const [open, setOpen] = useState(false)

  const activeNeedsKey =
    activeProvider != null &&
    !envStatus[activeProvider] &&
    !keys[activeProvider]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
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
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">API keys</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
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

            <div className="flex flex-col gap-3">
              {PROVIDERS.map((provider) => (
                <ProviderKeyRow
                  key={provider}
                  provider={provider}
                  hasEnvKey={Boolean(envStatus[provider])}
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
}: {
  provider: ProviderId
  hasEnvKey: boolean
}) {
  const { keys, setKey, clearKey } = useByok()
  const [draft, setDraft] = useState('')
  const yourKey = keys[provider]

  return (
    <div className="rounded-lg border border-gray-700 bg-gray-800/50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-white">
          {BYOK_PROVIDERS[provider].label}
        </span>
        {yourKey ? (
          <span className="text-xs font-medium text-emerald-400">
            Your key ··{yourKey.slice(-4)}
          </span>
        ) : hasEnvKey ? (
          <span className="text-xs font-medium text-gray-400">Server key</span>
        ) : (
          <span className="text-xs font-medium text-amber-400">No key</span>
        )}
      </div>
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
