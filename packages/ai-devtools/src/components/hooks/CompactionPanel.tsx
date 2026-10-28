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

function kindLabel(kind: CompactionEventRecord['kind']): string {
  if (kind === 'started') return 'Started'
  if (kind === 'ended') return 'Ended'
  return 'State'
}

const CompactEvent: Component<{
  event: CompactionEventRecord
  defaultOpen?: boolean
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [expanded, setExpanded] = createSignal(props.defaultOpen === true)
  const event = () => props.event
  const isState = () => event().kind === 'state'

  const stats = () => ({
    kind: event().kind,
    before: event().before,
    after: event().after,
    messagesBefore: event().messagesBefore,
    messagesAfter: event().messagesAfter,
    maxTokens: event().maxTokens,
    strategyKey: event().strategyKey,
    reusedCheckpoint: event().reusedCheckpoint,
    durationMs: event().durationMs,
  })

  const countLabel = () => {
    if (event().kind === 'started') {
      return `${event().messagesBefore ?? 0} msgs · ${event().before ?? 0} tok`
    }
    if (event().kind === 'ended') {
      return `${event().messagesAfter ?? 0} msgs · ${event().after ?? 0} tok`
    }
    return `${event().messagesBefore ?? 0} → ${event().messagesAfter ?? 0} msgs`
  }

  return (
    <>
      <div
        class={s().step}
        data-testid="ai-devtools-compaction-event"
        data-kind={event().kind}
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded())}
      >
        <span class={`${s().stepPrefix} ${s().stepPrefixMiddleware}`}>
          {kindLabel(event().kind)}
        </span>
        <span class={`${s().mwBadge} ${s().mwBadgeTransform}`}>
          {shortStrategy(event())}
        </span>
        <span class={s().mwHook}>{countLabel()}</span>
        <Show when={event().kind === 'state'}>
          <span class={s().stepDuration}>
            {event().before} → {event().after} tok
          </span>
        </Show>
        <Show when={event().durationMs !== undefined}>
          <span class={s().stepDuration}>{event().durationMs}ms</span>
        </Show>
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
        <Show when={isState()}>
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
      </Show>
    </>
  )
}

export const CompactionPanel: Component<{ hook: HookRecord }> = (props) => {
  const { state, clearCompaction } = useAIStore()
  const styles = useStyles()
  const s = () => styles().iterationTimeline

  const events = createMemo(() =>
    compactionEventsForHook(state.compaction, props.hook),
  )
  const lastStateIndex = createMemo(() => {
    const list = events()
    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i]?.kind === 'state') return i
    }
    return -1
  })

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
            {events().length} event{events().length === 1 ? '' : 's'}
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
          <For each={events()}>
            {(event, index) => (
              <CompactEvent
                event={event}
                defaultOpen={
                  event.kind === 'state' && index() === lastStateIndex()
                }
              />
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
