import { For, Show, createMemo, createSignal } from 'solid-js'
import { useAIStore } from '../../store/ai-context'
import { useStyles } from '../../styles/use-styles'
import type { Component } from 'solid-js'
import type {
  MemoryEventRecord,
  MemoryScopeState,
} from '../../store/memory-registry'

/**
 * DevTools "Memory" tab. Memory is per-scope (sessionId), not per-hook, so this
 * panel reads the whole `state.memory` registry and lets the user pick a scope
 * (defaulting to the most recently active). It renders two things:
 *   1. Live contents — the latest `inspect()` records + `listFacts()` facts,
 *      pushed via `memory:snapshot` (only for adapters that support inspection).
 *   2. Operations timeline — the `memory:*` recall/save/error events (always
 *      available, even when the adapter has no introspection).
 */

/** Shape of a record inside the built-in adapters' `inspect()` payload. */
interface MemoryRecordRow {
  id: string
  text: string
  kind: string
  role?: string
  createdAt?: number
  importance?: number
}

/** Best-effort extraction of `{ records: [...] }` from the opaque snapshot data. */
function extractRecords(data: unknown): Array<MemoryRecordRow> {
  if (!data || typeof data !== 'object') return []
  const records = (data as { records?: unknown }).records
  if (!Array.isArray(records)) return []
  return records.filter(
    (r): r is MemoryRecordRow =>
      Boolean(r) &&
      typeof r === 'object' &&
      typeof (r as MemoryRecordRow).id === 'string' &&
      typeof (r as MemoryRecordRow).text === 'string',
  )
}

function formatTime(value: number | string | undefined): string {
  if (value === undefined) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString()
}

function eventSummary(event: MemoryEventRecord): string {
  switch (event.type) {
    case 'retrieve:started':
      return `recall "${event.query ?? ''}"`
    case 'retrieve:completed':
      return `recalled ${event.fragmentCount ?? 0} fragment(s), ${
        event.systemPromptChars ?? 0
      } prompt chars${event.hasTools ? ', +tools' : ''} (${event.durationMs ?? 0}ms)`
    case 'persist:started':
      return 'save started'
    case 'persist:completed':
      return `saved ${event.okCount ?? 0}/${event.receiptCount ?? 0} receipt(s) (${
        event.durationMs ?? 0
      }ms)`
    case 'error':
      return `${event.phase ?? ''} error: ${event.error?.message ?? 'unknown'}`
    default:
      return event.type
  }
}

export const MemoryPanel: Component = () => {
  const { state, clearMemory } = useAIStore()
  const styles = useStyles()
  const [override, setOverride] = createSignal<string | null>(null)

  // Scope keys sorted most-recently-active first.
  const scopeKeys = createMemo(() =>
    Object.values(state.memory.scopes)
      .slice()
      .sort((a, b) => b.lastActivity - a.lastActivity)
      .map((s) => s.key),
  )

  const selectedKey = createMemo(() => {
    const chosen = override()
    if (chosen && state.memory.scopes[chosen]) return chosen
    return scopeKeys()[0] ?? null
  })

  const scope = createMemo((): MemoryScopeState | undefined => {
    const key = selectedKey()
    return key ? state.memory.scopes[key] : undefined
  })

  const records = createMemo(() => extractRecords(scope()?.snapshot?.data))
  const facts = createMemo(() => scope()?.snapshot?.facts ?? [])
  // Timeline newest-first.
  const events = createMemo(() =>
    (scope()?.events ?? []).slice().sort((a, b) => b.timestamp - a.timestamp),
  )

  return (
    <div
      class={styles().memoryPanel.container}
      data-testid="ai-devtools-memory-panel"
    >
      <Show
        when={scope()}
        fallback={
          <div class={styles().memoryPanel.empty}>
            No memory activity yet. Send a message through a chat wired with
            <code> memoryMiddleware</code> and recall/save events will appear
            here.
          </div>
        }
      >
        {(activeScope) => (
          <>
            <div class={styles().memoryPanel.toolbar}>
              <div class={styles().memoryPanel.scopeControls}>
                <Show
                  when={scopeKeys().length > 1}
                  fallback={
                    <span class={styles().memoryPanel.badge}>
                      {activeScope().adapter ?? 'memory'}
                    </span>
                  }
                >
                  <select
                    class={styles().memoryPanel.scopeSelect}
                    value={selectedKey() ?? ''}
                    onChange={(e) => setOverride(e.currentTarget.value)}
                    data-testid="ai-devtools-memory-scope-select"
                  >
                    <For each={scopeKeys()}>
                      {(key) => (
                        <option value={key}>
                          {state.memory.scopes[key]?.adapter
                            ? `${state.memory.scopes[key].adapter} · `
                            : ''}
                          {key.slice(0, 12)}
                        </option>
                      )}
                    </For>
                  </select>
                </Show>
              </div>
              <button
                type="button"
                class={styles().memoryPanel.clearButton}
                onClick={() => {
                  setOverride(null)
                  clearMemory()
                }}
              >
                Clear
              </button>
            </div>

            {/* Live contents (inspect + listFacts) */}
            <section class={styles().memoryPanel.section}>
              <div class={styles().memoryPanel.sectionTitle}>
                Stored records ({records().length})
                <Show when={activeScope().snapshot}>
                  {(snap) => (
                    <span class={styles().memoryPanel.time}>
                      snapshot {formatTime(snap().takenAt)}
                    </span>
                  )}
                </Show>
              </div>
              <Show
                when={records().length > 0}
                fallback={
                  <div class={styles().memoryPanel.sectionEmpty}>
                    {activeScope().snapshot
                      ? 'Snapshot is empty.'
                      : 'This adapter does not expose inspect() — see the timeline below for activity.'}
                  </div>
                }
              >
                <div class={styles().memoryPanel.list}>
                  <For each={records()}>
                    {(rec) => (
                      <div
                        class={styles().memoryPanel.row}
                        data-testid="ai-devtools-memory-record"
                      >
                        <div class={styles().memoryPanel.rowHeader}>
                          <span class={styles().memoryPanel.badge}>
                            {rec.kind}
                          </span>
                          <Show when={rec.role}>
                            <span>{rec.role}</span>
                          </Show>
                          <Show when={rec.importance !== undefined}>
                            <span>importance {rec.importance?.toFixed(2)}</span>
                          </Show>
                          <span class={styles().memoryPanel.time}>
                            {formatTime(rec.createdAt)}
                          </span>
                        </div>
                        <div class={styles().memoryPanel.rowText}>
                          {rec.text}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            {/* Facts */}
            <section class={styles().memoryPanel.section}>
              <div class={styles().memoryPanel.sectionTitle}>
                listFacts() ({facts().length})
              </div>
              <Show
                when={facts().length > 0}
                fallback={
                  <div class={styles().memoryPanel.sectionEmpty}>No facts.</div>
                }
              >
                <div class={styles().memoryPanel.list}>
                  <For each={facts()}>
                    {(fact) => (
                      <div class={styles().memoryPanel.row}>
                        <div class={styles().memoryPanel.rowText}>
                          <Show when={fact.source}>
                            <span class={styles().memoryPanel.rowHeader}>
                              {fact.source}:{' '}
                            </span>
                          </Show>
                          {fact.text}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>

            {/* Operations timeline */}
            <section class={styles().memoryPanel.section}>
              <div class={styles().memoryPanel.sectionTitle}>
                Operations ({events().length})
              </div>
              <Show
                when={events().length > 0}
                fallback={
                  <div class={styles().memoryPanel.sectionEmpty}>
                    No operations recorded.
                  </div>
                }
              >
                <div class={styles().memoryPanel.list}>
                  <For each={events()}>
                    {(event) => (
                      <div
                        class={`${styles().memoryPanel.row} ${
                          event.type === 'error'
                            ? styles().memoryPanel.rowError
                            : ''
                        }`}
                        data-testid="ai-devtools-memory-event"
                      >
                        <div class={styles().memoryPanel.rowHeader}>
                          <span class={styles().memoryPanel.badge}>
                            {event.type}
                          </span>
                          <span class={styles().memoryPanel.time}>
                            {formatTime(event.timestamp)}
                          </span>
                        </div>
                        <div class={styles().memoryPanel.rowText}>
                          {eventSummary(event)}
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </section>
          </>
        )}
      </Show>
    </div>
  )
}
