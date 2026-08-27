import { For, Show, createMemo, createSignal } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import { useAIStore } from '../../store/ai-context'
import { useStyles } from '../../styles/use-styles'
import { compactionEventsForHook } from '../../store/compaction-registry'
import type { Component } from 'solid-js'
import type {
  CompactionEventRecord,
  CompactionMessagePreview,
} from '../../store/compaction-registry'
import type { HookRecord } from '../../store/hook-registry'

function formatTime(value: number): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString()
}

function shortStrategy(event: CompactionEventRecord): string {
  const key = event.strategyKey
  if (!key) return event.reusedCheckpoint ? 'checkpoint' : 'compaction'
  const cut = key.indexOf(':maxTokens=')
  return cut === -1 ? key : key.slice(0, cut)
}

const PreviewMessage: Component<{
  preview: CompactionMessagePreview
}> = (props) => {
  const styles = useStyles()
  return (
    <div class={styles().hookDetails.message}>
      <div class={styles().hookDetails.messageRole}>
        {props.preview.role}
        <Show when={props.preview.tokens > 0}>
          {` · ${props.preview.tokens} tok`}
        </Show>
      </div>
      <div class={styles().hookDetails.messageContent}>
        {props.preview.text}
      </div>
    </div>
  )
}

const PreviewColumn: Component<{
  title: string
  previews: Array<CompactionMessagePreview>
  empty: string
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  return (
    <div class={s().stepJsonItem}>
      <div class={s().stepJsonItemLabel}>
        {props.title} ({props.previews.length})
      </div>
      <Show
        when={props.previews.length > 0}
        fallback={
          <div class={styles().hookDetails.emptySmall}>{props.empty}</div>
        }
      >
        <div class={styles().memoryPanel.list}>
          <For each={props.previews}>
            {(preview) => <PreviewMessage preview={preview} />}
          </For>
        </div>
      </Show>
    </div>
  )
}

const CompactEvent: Component<{ event: CompactionEventRecord }> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [expanded, setExpanded] = createSignal(false)
  const event = () => props.event

  const stats = () => ({
    before: event().before,
    after: event().after,
    messagesBefore: event().messagesBefore,
    messagesAfter: event().messagesAfter,
    maxTokens: event().maxTokens,
    strategyKey: event().strategyKey,
    reusedCheckpoint: event().reusedCheckpoint,
  })

  return (
    <>
      <div
        class={s().step}
        data-testid="ai-devtools-compaction-event"
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded())}
      >
        <span class={`${s().stepPrefix} ${s().stepPrefixMiddleware}`}>
          Compact
        </span>
        <span class={`${s().mwBadge} ${s().mwBadgeTransform}`}>
          {shortStrategy(event())}
        </span>
        <span class={s().mwHook}>
          {event().messagesBefore} → {event().messagesAfter} msgs
        </span>
        <span class={s().stepDuration}>
          {event().before} → {event().after} tok
        </span>
        <Show when={event().reusedCheckpoint}>
          <span class={s().mwSuffix}>checkpoint</span>
        </Show>
        <span class={s().stepDuration}>{formatTime(event().timestamp)}</span>
        <span class={`${s().chevron} ${expanded() ? s().chevronOpen : ''}`}>
          {'\u25B6'}
        </span>
      </div>
      <Show when={expanded()}>
        <div class={s().mwChangesContainer}>
          <JsonTree value={stats()} defaultExpansionDepth={1} copyable />
        </div>
        <div class={s().stepJsonItemsCompare}>
          <PreviewColumn
            title="Dropped"
            previews={event().dropped ?? []}
            empty="Nothing was dropped."
          />
          <PreviewColumn
            title="Sent to model"
            previews={event().result ?? []}
            empty="No compacted transcript on this event."
          />
        </div>
      </Show>
    </>
  )
}

export const CompactionPanel: Component<{ hook: HookRecord }> = (props) => {
  const { state, clearCompaction } = useAIStore()
  const styles = useStyles()
  const s = () => styles().iterationTimeline

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
          <div class={styles().hookDetails.emptySmall}>
            No compaction yet. When the transcript passes maxTokens, each
            compact appears here.
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
            onClick={() => clearCompaction()}
          >
            Clear
          </button>
        </div>
        <div class={s().iterCard}>
          <For each={events()}>{(event) => <CompactEvent event={event} />}</For>
        </div>
      </Show>
    </div>
  )
}
