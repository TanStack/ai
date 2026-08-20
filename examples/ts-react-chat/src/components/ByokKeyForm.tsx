import { useState } from 'react'
import { useByok } from '@tanstack/ai-react'
import { byok, toByokProvider } from '@/lib/byok'
import type { Provider } from '@/lib/model-selection'

export function ByokKeyForm({ provider }: { provider: Provider }) {
  const snapshot = useByok(byok)
  const [keyInput, setKeyInput] = useState('')
  const [error, setError] = useState('')
  const byokProvider = toByokProvider(provider)

  if (!byokProvider) {
    return (
      <p className="text-xs text-gray-500">
        This provider uses server auth, not a pasted API key.
      </p>
    )
  }

  const status = snapshot.status[byokProvider]
  const last4 = status && 'masked' in status ? status.masked : undefined

  const handleSave = async () => {
    const next = keyInput.trim()
    if (!next) return
    try {
      await byok.update(byokProvider, next)
      setKeyInput('')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save key')
    }
  }

  const handleAction = async (
    action: () => Promise<void>,
    fallback: string,
  ) => {
    try {
      await action()
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : fallback)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm text-gray-400 block">
        {byokProvider} API key (saved in this browser)
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          autoComplete="off"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder={last4 ? `Saved ••••${last4}` : 'Paste a key'}
          className="flex-1 min-w-[12rem] rounded-lg border border-orange-500/20 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={!keyInput.trim()}
          className="px-3 py-2 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-400 hover:bg-orange-500/20 disabled:opacity-50 text-sm font-medium"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => {
            void handleAction(
              () => byok.clear(byokProvider),
              'Could not clear key',
            )
          }}
          disabled={!status}
          className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-50 text-sm font-medium"
        >
          Clear
        </button>
        {snapshot.locked && (
          <button
            type="button"
            onClick={() =>
              void handleAction(() => byok.unlock(), 'Could not unlock keys')
            }
            className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 text-sm font-medium"
          >
            Unlock
          </button>
        )}
        {last4 && (
          <span className="text-xs text-gray-400">last 4: {last4}</span>
        )}
      </div>
      {byok.storage.warning && (
        <p className="text-xs text-gray-500">{byok.storage.warning}</p>
      )}
      {snapshot.storageError && (
        <p className="text-xs text-red-400">{snapshot.storageError}</p>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {snapshot.prompt && (
        <p className="text-xs text-amber-400">
          Need a {snapshot.prompt.provider} key ({snapshot.prompt.reason})
        </p>
      )}
    </div>
  )
}
