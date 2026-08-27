import { For, Show, createMemo, createSignal } from 'solid-js'
import { useAIStore } from '../../store/ai-context'
import { useStyles } from '../../styles/use-styles'
import { compactionEventsForHook } from '../../store/compaction-registry'
import type { Component } from 'solid-js'
import type { CompactionEventRecord } from '../../store/compaction-registry'
import type { HookRecord } from '../../store/hook-registry'

function formatTime(value: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString()
}

function strategyLabel(event: CompactionEventRecord): string {
  if (event.strategyKey) return event.strategyKey
  return event.reusedCheckpoint ? 'checkpoint' : 'compaction'
}

export const CompactionPanel: Component<{ hook: HookRecord }> = (props) => {
  const { state, clearCompaction } = useAIStore()
  const styles = useStyles()
  const [expandedId, setExpandedId] = createSignal<string | null>(null)

  const events = createMemo(() =>
    compactionEventsForHook(state.compaction, props.hook)
      .slice()
      .sort((a, b) => b.timestamp - a.timestamp),
  )

  return (
    <div
      class={styles().memoryPanel.container}
      data-testid="ai-devtools-compaction-panel"
    >
      <Show
        when={events().length > 0}
        fallback={
          <div class={styles().memoryPanel.empty}>
            No compaction yet. When the transcript passes maxTokens, each
            compact appears here with before and after counts.
          </div>
        }
      >
        <div class={styles().memoryPanel.toolbar}>
          <span class={styles().memoryPanel.badge}>
            {events().length} compact{events().length === 1 ? '' : 's'}
          </span>
          <button
            type="button"
            class={styles().memoryPanel.clearButton}
            onClick={() => {
              setExpandedId(null)
              clearCompaction()
            }}
          >
            Clear
          </button>
        </div>
        <div class={styles().memoryPanel.list}>
          <For each={events()}>
            {(event) => {
              const open = () => expandedId() === event.id
              return (
                <div
                  class={styles().memoryPanel.row}
                  data-testid="ai-devtools-compaction-event"
                >
                  <button
                    type="button"
                    class={styles().memoryPanel.rowHeader}
                    style={{
                      cursor: 'pointer',
                      border: 'none',
                      background: 'transparent',
                      width: '100%',
                      'text-align': 'left',
                    }}
                    onClick={() => setExpandedId(open() ? null : event.id)}
                  >
                    <span class={styles().memoryPanel.badge}>
                      {strategyLabel(event)}
                    </span>
                    <span>
                      {event.messagesBefore} → {event.messagesAfter} msgs
                    </span>
                    <span>
                      {event.before} → {event.after} tokens
                    </span>
                    <Show when={event.maxTokens !== undefined}>
                      <span>budget {event.maxTokens}</span>
                    </Show>
                    <Show when={event.reusedCheckpoint}>
                      <span>checkpoint</span>
                    </Show>
                    <span class={styles().memoryPanel.time}>
                      {formatTime(event.timestamp)}
                    </span>
                  </button>
                  <Show when={open()}>
                    <div class={styles().memoryPanel.section}>
                      <div class={styles().memoryPanel.sectionTitle}>
                        Dropped ({event.dropped?.length ?? 0})
                      </div>
                      <Show
                        when={(event.dropped?.length ?? 0) > 0}
                        fallback={
                          <div class={styles().memoryPanel.sectionEmpty}>
                            Nothing was dropped. The model still sees the
                            previous compacted prefix.
                          </div>
                        }
                      >
                        <For each={event.dropped ?? []}>
                          {(preview) => (
                            <div class={styles().memoryPanel.rowText}>
                              {preview.role} ({preview.tokens} tok):{' '}
                              {preview.text}
                            </div>
                          )}
                        </For>
                      </Show>
                      <div class={styles().memoryPanel.sectionTitle}>
                        Sent to model ({event.result?.length ?? 0})
                      </div>
                      <Show
                        when={(event.result?.length ?? 0) > 0}
                        fallback={
                          <div class={styles().memoryPanel.sectionEmpty}>
                            No compacted transcript on this event.
                          </div>
                        }
                      >
                        <For each={event.result ?? []}>
                          {(preview) => (
                            <div class={styles().memoryPanel.rowText}>
                              {preview.role} ({preview.tokens} tok):{' '}
                              {preview.text}
                            </div>
                          )}
                        </For>
                      </Show>
                    </div>
                  </Show>
                </div>
              )
            }}
          </For>
        </div>
      </Show>
    </div>
  )
}
