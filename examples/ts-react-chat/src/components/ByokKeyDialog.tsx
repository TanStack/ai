import { useState } from 'react'
import { KeyRound, X } from 'lucide-react'
import { useByok } from '@tanstack/ai-react'
import { byok, KEYED_PROVIDERS, KEY_GROUPS } from '@/lib/byok'
import type { KeyStatus } from '@tanstack/ai-client/byok'
import type { ProviderId } from '@tanstack/ai/byok'
import type { ReactNode } from 'react'

export type ByokKeyDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  envStatus?: Record<string, boolean>
  activeProvider?: ProviderId | null
  highlightProvider?: ProviderId | null
  openRouter?: {
    onLogin: () => void
    completing?: boolean
    error?: string | null
  }
  trigger?: ReactNode
  description?: string
}

const STATUS_LABEL: Record<
  KeyStatus['state'],
  { label: string; className: string }
> = {
  empty: { label: 'Not set', className: 'text-gray-500' },
  set: { label: 'Saved', className: 'text-gray-400' },
  locked: { label: 'Locked', className: 'text-amber-400' },
  error: { label: 'Check failed', className: 'text-red-400' },
}

export function ByokKeyDialog({
  open,
  onOpenChange,
  envStatus,
  activeProvider = null,
  highlightProvider = null,
  openRouter,
  trigger,
  description = 'Keys stay in your browser and are sent per-request in a header — never stored on the server. Providers with a server key already work without one.',
}: ByokKeyDialogProps) {
  const snapshot = useByok(byok)
  const [unlocking, setUnlocking] = useState(false)
  const [actionError, setActionError] = useState('')

  const activeStatus = activeProvider
    ? snapshot.status[activeProvider]
    : undefined
  const activeNeedsKey =
    activeProvider != null &&
    !envStatus?.[activeProvider] &&
    (!activeStatus || activeStatus.state === 'empty')

  return (
    <>
      {trigger ?? (
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
      )}

      {open ? (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/60"
          onClick={() => onOpenChange(false)}
        >
          <div className="flex min-h-full items-center justify-center p-4">
            <div
              className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-xl border border-gray-700 bg-gray-900 p-5 shadow-2xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-1 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">API keys</h2>
                <button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  aria-label="Close"
                  className="text-2xl leading-none text-gray-400 hover:text-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mb-4 text-sm leading-snug text-gray-400">
                {description}
              </p>

              {snapshot.locked ? (
                <div className="mb-4 flex items-center justify-between gap-2 rounded-lg border border-gray-700 bg-gray-800 p-3 text-sm text-gray-200">
                  <span>
                    Your saved keys are locked ({byok.storage.label}).
                  </span>
                  <button
                    type="button"
                    disabled={unlocking}
                    className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                    onClick={() => {
                      setUnlocking(true)
                      setActionError('')
                      void byok
                        .unlock()
                        .catch((error: unknown) =>
                          setActionError(
                            error instanceof Error
                              ? error.message
                              : 'Could not unlock keys',
                          ),
                        )
                        .finally(() => setUnlocking(false))
                    }}
                  >
                    {unlocking ? 'Unlocking…' : 'Unlock'}
                  </button>
                </div>
              ) : null}

              {byok.storage.warning ? (
                <p className="mb-3 text-xs text-amber-400">
                  {byok.storage.warning}
                </p>
              ) : null}
              {snapshot.storageError ? (
                <p className="mb-3 text-xs text-red-400">
                  {snapshot.storageError}
                </p>
              ) : null}
              {actionError ? (
                <p className="mb-3 text-xs text-red-400">{actionError}</p>
              ) : null}
              {openRouter?.completing ? (
                <p className="mb-3 text-xs text-gray-400">
                  Completing OpenRouter sign-in…
                </p>
              ) : null}
              {openRouter?.error ? (
                <p className="mb-3 text-xs text-red-400">{openRouter.error}</p>
              ) : null}

              <div className="flex flex-col gap-4">
                {KEYED_PROVIDERS.map((provider) => {
                  const group = KEY_GROUPS.find((g) =>
                    g.fields.some((f) => f.provider.id === provider.id),
                  )
                  if (group) {
                    // Render the group once, where its first field sits.
                    if (group.fields[0].provider.id !== provider.id) return null
                    return (
                      <GroupRow
                        key={group.id}
                        label={group.label}
                        fields={group.fields}
                        statuses={snapshot.status}
                        locked={snapshot.locked}
                        envStatus={envStatus}
                        highlight={group.fields.some(
                          (f) => f.provider.id === highlightProvider,
                        )}
                      />
                    )
                  }
                  return (
                    <ProviderRow
                      key={provider.id}
                      id={provider.id}
                      label={provider.label}
                      status={snapshot.status[provider.id]}
                      locked={snapshot.locked}
                      hasEnvKey={Boolean(envStatus?.[provider.id])}
                      highlight={provider.id === highlightProvider}
                      openRouter={
                        provider.id === 'openrouter' ? openRouter : undefined
                      }
                    />
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}

function ProviderRow({
  id,
  label,
  status,
  locked,
  hasEnvKey,
  highlight,
  openRouter,
}: {
  id: ProviderId
  label: string
  status: KeyStatus | undefined
  locked: boolean
  hasEnvKey: boolean
  highlight: boolean
  openRouter?: ByokKeyDialogProps['openRouter']
}) {
  const [draft, setDraft] = useState('')
  const [rowError, setRowError] = useState('')
  const state = status?.state ?? 'empty'
  const masked = status && 'masked' in status ? status.masked : undefined
  const isLocked = locked || state === 'locked'
  const hasKey = state !== 'empty'

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        highlight
          ? 'border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.4)]'
          : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white">{label}</span>
        <PresenceBadge
          state={state}
          hasKey={hasKey}
          isLocked={state === 'locked'}
          hasEnvKey={hasEnvKey}
        />
      </div>

      {hasKey && masked ? (
        <div className="flex items-center justify-between gap-2">
          <code className="font-mono tracking-wider text-gray-300">
            {masked}
          </code>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isLocked}
              className="rounded-md border border-gray-600 bg-gray-800 px-2.5 py-1 text-sm text-gray-200 disabled:opacity-50"
              onClick={() => {
                setRowError('')
                void byok
                  .clear(id)
                  .catch((error: unknown) =>
                    setRowError(
                      error instanceof Error
                        ? error.message
                        : 'Could not clear key',
                    ),
                  )
              }}
            >
              Clear
            </button>
          </div>
        </div>
      ) : null}

      {id === 'openrouter' && openRouter && !hasKey ? (
        <button
          type="button"
          className="w-full rounded-md border border-gray-600 bg-gray-800 px-3 py-2 text-sm font-semibold text-white"
          onClick={openRouter.onLogin}
        >
          Sign in with OpenRouter
        </button>
      ) : null}

      {state === 'error' && status && 'message' in status ? (
        <p className="text-xs text-red-400">{status.message}</p>
      ) : null}
      {rowError ? <p className="text-xs text-red-400">{rowError}</p> : null}

      <form
        className="flex gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          const next = draft.trim()
          if (!next || isLocked) return
          setRowError('')
          void byok
            .update(id, next)
            .then(() => setDraft(''))
            .catch((error: unknown) =>
              setRowError(
                error instanceof Error ? error.message : 'Could not save key',
              ),
            )
        }}
      >
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          disabled={isLocked}
          placeholder={
            isLocked
              ? 'Unlock to replace…'
              : hasKey
                ? 'Replace key…'
                : `Paste ${label} key…`
          }
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="flex-1 rounded-md border border-gray-600 bg-gray-950 px-2 py-1.5 text-sm text-white placeholder-gray-500 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isLocked}
          className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </form>
    </div>
  )
}

/**
 * One card for a credential made of several stored values (for example
 * Cloudflare's account id + API token). Each field saves to its own id.
 */
function GroupRow({
  label,
  fields,
  statuses,
  locked,
  envStatus,
  highlight,
}: {
  label: string
  fields: ReadonlyArray<{
    provider: { id: ProviderId; label: string }
    label: string
    secret: boolean
  }>
  statuses: Record<string, KeyStatus | undefined>
  locked: boolean
  envStatus?: Record<string, boolean>
  highlight: boolean
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [rowError, setRowError] = useState('')
  const states = fields.map((f) => statuses[f.provider.id]?.state ?? 'empty')
  const allSet = states.every((s) => s !== 'empty')
  const anyLocked = locked || states.some((s) => s === 'locked')
  const allEnv = fields.every((f) => Boolean(envStatus?.[f.provider.id]))
  const state: KeyStatus['state'] = anyLocked
    ? 'locked'
    : states.includes('error')
      ? 'error'
      : allSet
        ? 'set'
        : 'empty'
  const filled = fields.filter((f) => drafts[f.provider.id]?.trim())

  return (
    <div
      className={`flex flex-col gap-2 rounded-lg border p-3 ${
        highlight
          ? 'border-amber-400/60 shadow-[0_0_0_1px_rgba(251,191,36,0.4)]'
          : 'border-gray-700 bg-gray-800/50'
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-semibold text-white">{label}</span>
        <PresenceBadge
          state={state}
          hasKey={allSet}
          isLocked={state === 'locked'}
          hasEnvKey={allEnv}
        />
      </div>

      {rowError ? <p className="text-xs text-red-400">{rowError}</p> : null}

      <form
        className="flex flex-col gap-1.5"
        onSubmit={(event) => {
          event.preventDefault()
          if (filled.length === 0 || anyLocked) return
          setRowError('')
          // One at a time: passkey-backed storage runs a WebAuthn ceremony
          // per write, and the browser rejects a second concurrent request.
          void (async () => {
            for (const f of filled) {
              await byok.update(f.provider.id, drafts[f.provider.id]!.trim())
            }
          })()
            .then(() => setDrafts({}))
            .catch((error: unknown) =>
              setRowError(
                error instanceof Error ? error.message : 'Could not save keys',
              ),
            )
        }}
      >
        {fields.map((field) => {
          const status = statuses[field.provider.id]
          const masked =
            status && 'masked' in status ? status.masked : undefined
          const hasKey = (status?.state ?? 'empty') !== 'empty'
          return (
            <label
              key={field.provider.id}
              className="flex items-center gap-2 text-xs text-gray-400"
            >
              <span className="w-24 shrink-0">{field.label}</span>
              <input
                type={field.secret ? 'password' : 'text'}
                autoComplete="off"
                spellCheck={false}
                disabled={anyLocked}
                placeholder={
                  anyLocked
                    ? 'Unlock to replace…'
                    : hasKey && masked
                      ? masked
                      : `Paste ${field.label}…`
                }
                value={drafts[field.provider.id] ?? ''}
                onChange={(event) =>
                  setDrafts((prev) => ({
                    ...prev,
                    [field.provider.id]: event.target.value,
                  }))
                }
                className="flex-1 rounded-md border border-gray-600 bg-gray-950 px-2 py-1.5 text-sm text-white placeholder-gray-500 disabled:opacity-50"
              />
            </label>
          )
        })}
        <div className="flex justify-end gap-1.5">
          {allSet ? (
            <button
              type="button"
              disabled={anyLocked}
              className="rounded-md border border-gray-600 bg-gray-800 px-2.5 py-1 text-sm text-gray-200 disabled:opacity-50"
              onClick={() => {
                setRowError('')
                void (async () => {
                  for (const f of fields) await byok.clear(f.provider.id)
                })().catch((error: unknown) =>
                  setRowError(
                    error instanceof Error
                      ? error.message
                      : 'Could not clear keys',
                  ),
                )
              }}
            >
              Clear
            </button>
          ) : null}
          <button
            type="submit"
            disabled={filled.length === 0 || anyLocked}
            className="rounded-md bg-orange-500 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  )
}

function PresenceBadge({
  state,
  hasKey,
  isLocked,
  hasEnvKey,
}: {
  state: KeyStatus['state']
  hasKey: boolean
  isLocked: boolean
  hasEnvKey: boolean
}) {
  if (hasKey && !isLocked) {
    return (
      <span className="text-xs font-semibold text-emerald-400">Your key</span>
    )
  }
  if (isLocked) {
    return <span className="text-xs font-semibold text-amber-400">Locked</span>
  }
  if (hasEnvKey) {
    return (
      <span className="text-xs font-semibold text-gray-400">Server key</span>
    )
  }
  const { label, className } = STATUS_LABEL[state]
  return <span className={`text-xs font-semibold ${className}`}>{label}</span>
}
