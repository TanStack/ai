import { For, Show, createMemo } from 'solid-js'
import { useAIStore } from '../../store/ai-context'
import { useStyles } from '../../styles/use-styles'
import { getHookUnseenEventCount } from '../../store/hook-registry'
import {
  getHookDisplayName,
  groupHooksByCategory,
  isHookRunning,
} from './hook-dashboard-model'
import type { HookRecord } from '../../store/hook-registry'
import type { Component } from 'solid-js'

export const HookDashboard: Component = () => {
  const { state, selectHook, selectConversation, clearHooks } = useAIStore()
  const styles = useStyles()

  const hooks = createMemo(() =>
    Object.values(state.hooks.hooks).sort(
      (a, b) => a.registeredAt - b.registeredAt,
    ),
  )
  const hookGroups = createMemo(() => groupHooksByCategory(hooks()))

  const activeCount = createMemo(() => hooks().length)
  const toolCount = createMemo(() =>
    hooks().reduce((count, hook) => count + hook.tools.length, 0),
  )
  const messageCount = createMemo(() =>
    Object.values(state.conversations).reduce(
      (count, conversation) => count + conversation.messages.length,
      0,
    ),
  )
  const runCount = createMemo(() => Object.keys(state.hooks.runs).length)
  const totalTokens = createMemo(() =>
    Object.values(state.conversations).reduce(
      (count, conversation) => count + (conversation.usage?.totalTokens ?? 0),
      0,
    ),
  )
  const runningCount = createMemo(
    () =>
      Object.values(state.hooks.runs).filter(
        (run) => run.status === 'started' || run.status === 'updated',
      ).length,
  )
  const unseenUpdateCount = createMemo(() =>
    hooks().reduce(
      (count, hook) => count + getHookUnseenEventCount(state.hooks, hook.id),
      0,
    ),
  )

  const handleSelect = (hook: HookRecord) => {
    selectHook(hook.id)
    if (state.conversations[hook.id]) {
      selectConversation(hook.id)
    }
  }

  return (
    <div
      class={styles().hookDashboard.container}
      data-testid="ai-devtools-hook-sidebar"
    >
      <div class={styles().hookDashboard.summary}>
        <div
          class={styles().hookDashboard.summaryItem}
          data-testid="ai-devtools-sidebar-active-hooks"
        >
          <span class={styles().hookDashboard.summaryValue}>
            {activeCount()}
          </span>
          <span class={styles().hookDashboard.summaryLabel}>active</span>
        </div>
        <div
          class={styles().hookDashboard.summaryItem}
          data-testid="ai-devtools-sidebar-tools"
        >
          <span class={styles().hookDashboard.summaryValue}>{toolCount()}</span>
          <span class={styles().hookDashboard.summaryLabel}>tools</span>
        </div>
        <div
          class={styles().hookDashboard.summaryItem}
          data-testid="ai-devtools-sidebar-runs"
        >
          <span class={styles().hookDashboard.summaryValue}>{runCount()}</span>
          <span class={styles().hookDashboard.summaryLabel}>runs</span>
        </div>
        <div
          class={styles().hookDashboard.summaryItem}
          data-testid="ai-devtools-sidebar-messages"
        >
          <span class={styles().hookDashboard.summaryValue}>
            {messageCount()}
          </span>
          <span class={styles().hookDashboard.summaryLabel}>messages</span>
        </div>
        <div
          class={styles().hookDashboard.summaryItem}
          data-testid="ai-devtools-sidebar-tokens"
        >
          <span class={styles().hookDashboard.summaryValue}>
            {totalTokens()}
          </span>
          <span class={styles().hookDashboard.summaryLabel}>tokens</span>
        </div>
        <div
          class={styles().hookDashboard.summaryItem}
          data-testid="ai-devtools-sidebar-running-hooks"
        >
          <span class={styles().hookDashboard.summaryValue}>
            {runningCount()}
          </span>
          <span class={styles().hookDashboard.summaryLabel}>running</span>
        </div>
        <div class={styles().hookDashboard.summaryItem}>
          <span class={styles().hookDashboard.summaryValue}>
            {unseenUpdateCount()}
          </span>
          <span class={styles().hookDashboard.summaryLabel}>updates</span>
        </div>
        <button
          class={styles().hookDashboard.clearButton}
          type="button"
          onClick={clearHooks}
          disabled={hooks().length === 0}
        >
          Clear
        </button>
      </div>

      <Show
        when={hooks().length > 0}
        fallback={
          <div class={styles().hookDashboard.empty}>
            No AI hooks registered yet.
          </div>
        }
      >
        <div class={styles().hookDashboard.list}>
          <button
            type="button"
            data-testid="ai-devtools-dashboard-row"
            class={`${styles().hookDashboard.row} ${
              state.hooks.activeHookId === null
                ? styles().hookDashboard.rowSelected
                : ''
            }`}
            onClick={() => selectHook(null)}
          >
            <div class={styles().hookDashboard.rowMain}>
              <div class={styles().hookDashboard.rowTitleLine}>
                <span class={styles().hookDashboard.rowTitle}>Dashboard</span>
              </div>
              <span class={styles().hookDashboard.rowId}>All hooks</span>
            </div>
            <div class={styles().hookDashboard.rowMeta}>
              <span class={styles().hookDashboard.countBadge}>
                {hookGroups().length} categories
              </span>
              <span class={styles().hookDashboard.countBadge}>
                {hooks().length} hooks
              </span>
            </div>
          </button>
          <For each={hookGroups()}>
            {(group) => (
              <section
                class={styles().hookDashboard.categorySection}
                data-testid="ai-devtools-hook-category"
                data-category={group.id}
              >
                <div class={styles().hookDashboard.categoryHeader}>
                  <span class={styles().hookDashboard.categoryLabel}>
                    {group.label}
                  </span>
                  <span class={styles().hookDashboard.categoryCount}>
                    {group.hooks.length}
                  </span>
                </div>
                <div class={styles().hookDashboard.categoryRows}>
                  <For each={group.hooks}>
                    {(hook) => {
                      const isSelected = createMemo(
                        () => state.hooks.activeHookId === hook.id,
                      )
                      const unseenCount = createMemo(() =>
                        getHookUnseenEventCount(state.hooks, hook.id),
                      )
                      const running = createMemo(() =>
                        isHookRunning(hook, state.hooks.runs),
                      )
                      const hasUnseenUpdates = createMemo(
                        () => unseenCount() > 0 && !isSelected(),
                      )
                      const hasBackgroundActivity = createMemo(
                        () => running() && !isSelected(),
                      )

                      return (
                        <button
                          type="button"
                          data-testid="ai-devtools-hook-row"
                          data-hook-id={hook.id}
                          data-hook-name={hook.hookName}
                          data-display-name={getHookDisplayName(hook)}
                          class={`${styles().hookDashboard.row} ${
                            isSelected()
                              ? styles().hookDashboard.rowSelected
                              : ''
                          } ${
                            hasBackgroundActivity()
                              ? styles().hookDashboard.rowLive
                              : ''
                          } ${
                            hasUnseenUpdates()
                              ? styles().hookDashboard.rowUpdating
                              : ''
                          }`}
                          onClick={() => handleSelect(hook)}
                        >
                          <div class={styles().hookDashboard.rowMain}>
                            <div class={styles().hookDashboard.rowTitleLine}>
                              <span
                                class={styles().hookDashboard.rowTitle}
                                data-testid="ai-devtools-hook-display-name"
                              >
                                {getHookDisplayName(hook)}
                              </span>
                              <Show when={hasBackgroundActivity()}>
                                <span
                                  class={styles().hookDashboard.liveIndicator}
                                  aria-label="Hook is receiving updates"
                                />
                              </Show>
                              <Show when={hasUnseenUpdates()}>
                                <span
                                  class={styles().hookDashboard.updateBadge}
                                >
                                  {unseenCount()} new
                                </span>
                              </Show>
                            </div>
                            <span class={styles().hookDashboard.rowId}>
                              <Show when={hook.displayName} fallback={hook.id}>
                                {hook.hookName} - {hook.id}
                              </Show>
                            </span>
                          </div>
                          <div class={styles().hookDashboard.rowMeta}>
                            <span
                              class={`${styles().hookDashboard.lifecycleBadge} ${
                                hook.lifecycle === 'streaming'
                                  ? styles().hookDashboard.lifecycleStreaming
                                  : hook.lifecycle === 'errored'
                                    ? styles().hookDashboard.lifecycleErrored
                                    : ''
                              }`}
                            >
                              {hook.lifecycle}
                            </span>
                            <Show when={hook.outputKind}>
                              <span class={styles().hookDashboard.kindBadge}>
                                {hook.outputKind}
                              </span>
                            </Show>
                            <Show when={hook.tools.length > 0}>
                              <span class={styles().hookDashboard.countBadge}>
                                {hook.tools.length} tools
                              </span>
                            </Show>
                            <Show when={hook.runIds.length > 0}>
                              <span class={styles().hookDashboard.countBadge}>
                                {hook.runIds.length} runs
                              </span>
                            </Show>
                          </div>
                        </button>
                      )
                    }}
                  </For>
                </div>
              </section>
            )}
          </For>
        </div>
      </Show>
    </div>
  )
}
