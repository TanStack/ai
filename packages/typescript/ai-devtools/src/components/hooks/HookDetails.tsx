import { For, Show, createEffect, createMemo, createSignal } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import { useAIStore } from '../../store/ai-context'
import { useStyles } from '../../styles/use-styles'
import {
  createToolFixtureRecord,
  getHookUnseenEventCount,
} from '../../store/hook-registry'
import { IterationTimeline } from '../conversation'
import { FixtureNamePopover } from './FixtureNamePopover'
import { ToolFixtureForm } from './ToolFixtureForm'
import {
  createHookDashboardSummary,
  getHookDisplayName,
  groupHooksByCategory,
  isHookRunning,
  visibleHooks,
} from './hook-dashboard-model'
import {
  createHoverTarget,
  createHoverTargetFromDataAttributes,
  getHoverDataAttributes,
  hoverTargetMatchesElement,
  isMessageHighlighted,
  isMessageOrPartHighlighted,
  parseJsonishValue,
  structuredOutputJsonItems,
  structuredOutputPartId,
  toolCallPartId,
  toolResultPartId,
} from './preview-model'
import {
  hasStructuredOutputPreview,
  mergePreviewMessagesForUserView,
  partsToMessageText,
  visiblePreviewPartsForMessage,
} from './preview-messages'
import { GenerationPanel, GenerationPreview } from './GenerationPanel'
import type { HoverOrigin, HoverTarget, PreviewJsonItem } from './preview-model'
import type {
  HookRecord,
  RunRecord,
  ToolFixtureRecord,
  ToolFixtureMessage,
} from '../../store/hook-registry'
import type { Conversation, Message, ToolCall } from '../../store/ai-store'
import type { Component, Setter } from 'solid-js'

type DetailTab = 'conversation' | 'tools' | 'state'
type MessagePart = NonNullable<Message['parts']>[number]
const scrollAnimations = new WeakMap<HTMLElement, number>()

interface PreviewMessage {
  id: string
  role: string
  content: string
  parts: Array<PreviewPart>
  sourceMessage?: ToolFixtureMessage
}

interface PreviewPart {
  id: string
  label: string
  content?: string
  jsonItems?: Array<PreviewJsonItem>
  kind:
    | 'text'
    | 'thinking'
    | 'tool-call'
    | 'tool-result'
    | 'structured-output'
    | 'media'
  fixture?: PreviewToolFixture
}

interface PreviewToolFixture {
  toolName: string
  input: unknown
  output?: unknown
  toolCallId?: string
  messageId?: string
  errorText?: string
}

interface PreviewPartSource {
  id?: unknown
  type?: unknown
  toolCallId?: unknown
  name?: unknown
  input?: unknown
  arguments?: unknown
  output?: unknown
  content?: unknown
  text?: unknown
  error?: unknown
  toolName?: unknown
  approval?: unknown
  state?: unknown
  status?: unknown
  raw?: unknown
  partial?: unknown
  data?: unknown
  reasoning?: unknown
  errorMessage?: unknown
  source?: unknown
  metadata?: unknown
}

export const HookDetails: Component = () => {
  const { state, selectHook, selectConversation } = useAIStore()
  const styles = useStyles()
  const [activeTab, setActiveTab] = createSignal<DetailTab>('conversation')
  const [hoverTarget, setHoverTarget] = createSignal<HoverTarget | null>(null)
  let timelinePane: HTMLElement | undefined
  let previewPane: HTMLElement | undefined

  const hook = createMemo((): HookRecord | undefined => {
    const id = state.hooks.activeHookId
    const activeHook = id ? state.hooks.hooks[id] : undefined
    return activeHook?.lifecycle === 'unmounted' ? undefined : activeHook
  })

  const conversation = createMemo(() => {
    const activeHook = hook()
    if (!activeHook) return undefined
    return findConversationForHook(activeHook, state.conversations)
  })

  const runs = createMemo(() => {
    const activeHook = hook()
    if (!activeHook) return []
    return activeHook.runIds
      .map((id) => state.hooks.runs[id])
      .filter((run): run is RunRecord => Boolean(run))
      .sort((a, b) => a.updatedAt - b.updatedAt)
  })

  const isGenerationHook = createMemo(() => {
    const outputKind = hook()?.outputKind
    // 'structured' is a chat hook variant (useChat with outputSchema), not a
    // generation hook — it still has a conversation timeline and tool calls.
    return Boolean(
      outputKind && outputKind !== 'chat' && outputKind !== 'structured',
    )
  })

  createEffect(() => {
    if (isGenerationHook() && activeTab() === 'tools') {
      setActiveTab('conversation')
    }
  })

  const previewMessages = createMemo(() => {
    const activeHook = hook()
    if (!activeHook) return []
    const snapshotMessages = messagesFromSnapshot(activeHook.state)
    const conversationMessages = conversation()?.messages ?? []
    if (conversationMessages.length > 0) {
      return mergePreviewMessagesForUserView(
        conversationMessages.map(messageFromConversation),
        snapshotMessages,
      )
    }
    if (snapshotMessages.length > 0) return snapshotMessages
    return []
  })
  const showSecondaryPane = createMemo(() => {
    // Tools tab owns its own form/saved-fixtures layout that fills the
    // primary pane; the secondary "User View" preview squeezes the tool
    // detail column to zero width on narrower hookDetails widths.
    if (activeTab() === 'tools' && !isGenerationHook()) return false
    return isGenerationHook() || !hasStructuredOutputPreview(previewMessages())
  })

  createEffect(() => {
    const target = hoverTarget()
    if (!target) return

    const pane = target.origin === 'timeline' ? previewPane : timelinePane
    if (!pane) return

    const element = findMatchingHoverElement(pane, target)
    if (!element) return

    scrollElementIntoPaneView(pane, element, {
      align:
        target.origin === 'preview' && target.partIds.length === 0
          ? 'start'
          : 'nearest',
    })
  })

  return (
    <Show
      when={hook()}
      fallback={
        <HookOverview
          onSelectHook={(selectedHook) => {
            selectHook(selectedHook.id)
            if (state.conversations[selectedHook.id]) {
              selectConversation(selectedHook.id)
            }
          }}
        />
      }
    >
      {(activeHook) => (
        <div
          class={styles().hookDetails.container}
          data-testid="ai-devtools-hook-detail"
        >
          <HookHeader
            hook={activeHook()}
            runs={runs().length}
            messages={previewMessages().length}
            totalTokens={conversation()?.usage?.totalTokens ?? 0}
            isGenerationHook={isGenerationHook()}
          />

          <nav
            class={styles().hookDetails.tabs}
            data-testid="ai-devtools-hook-tabs"
          >
            <TabButton
              label={isGenerationHook() ? 'Generation' : 'Conversation'}
              tab="conversation"
              activeTab={activeTab()}
              onSelect={setActiveTab}
            />
            <Show when={!isGenerationHook()}>
              <TabButton
                label="Tools"
                tab="tools"
                activeTab={activeTab()}
                onSelect={setActiveTab}
              />
            </Show>
            <TabButton
              label="State"
              tab="state"
              activeTab={activeTab()}
              onSelect={setActiveTab}
            />
          </nav>

          <div
            class={`${styles().hookDetails.body} ${
              showSecondaryPane() ? '' : styles().hookDetails.bodySinglePane
            }`}
          >
            <main
              class={styles().hookDetails.primary}
              data-testid="ai-devtools-primary-pane"
              ref={(el) => {
                timelinePane = el
              }}
              onMouseOver={(event) =>
                setHoverTargetFromEvent(event, 'timeline', setHoverTarget)
              }
              onMouseLeave={() => setHoverTarget(null)}
            >
              <Show when={activeTab() === 'conversation'}>
                <Show
                  when={isGenerationHook()}
                  fallback={
                    <ConversationPanel
                      hook={activeHook()}
                      conversation={conversation()}
                      messages={previewMessages()}
                      hoverTarget={hoverTarget()}
                      onHoverTarget={setHoverTarget}
                    />
                  }
                >
                  <GenerationPanel
                    hook={activeHook()}
                    runs={runs()}
                    hoverTarget={hoverTarget()}
                  />
                </Show>
              </Show>
              <Show when={!isGenerationHook() && activeTab() === 'tools'}>
                <ToolsView hook={activeHook()} />
              </Show>
              <Show when={activeTab() === 'state'}>
                <JsonPanel value={activeHook().state} />
              </Show>
            </main>

            <Show when={showSecondaryPane()}>
              <aside
                class={styles().hookDetails.previewPane}
                data-testid="ai-devtools-preview-pane"
                ref={(el) => {
                  previewPane = el
                }}
                onMouseOver={(event) =>
                  setHoverTargetFromEvent(event, 'preview', setHoverTarget)
                }
                onMouseLeave={() => setHoverTarget(null)}
              >
                <div class={styles().hookDetails.previewHeader}>
                  {isGenerationHook() ? 'Generated Output' : 'User View'}
                </div>
                <Show
                  when={isGenerationHook()}
                  fallback={
                    <MessagesPreview
                      hook={activeHook()}
                      messages={previewMessages()}
                      hoverTarget={hoverTarget()}
                      onHoverTarget={setHoverTarget}
                    />
                  }
                >
                  <GenerationPreview
                    hook={activeHook()}
                    hoverTarget={hoverTarget()}
                  />
                </Show>
              </aside>
            </Show>
          </div>
        </div>
      )}
    </Show>
  )
}

const HookOverview: Component<{
  onSelectHook: (hook: HookRecord) => void
}> = (props) => {
  const { state } = useAIStore()
  const styles = useStyles()
  const hooks = createMemo(() =>
    visibleHooks(Object.values(state.hooks.hooks)).sort(
      (a, b) => a.registeredAt - b.registeredAt,
    ),
  )
  const groups = createMemo(() => groupHooksByCategory(hooks()))
  const summary = createMemo(() =>
    createHookDashboardSummary(hooks(), state.hooks.runs),
  )
  const totalMessages = createMemo(() =>
    Object.values(state.conversations).reduce(
      (count, conversation) => count + conversation.messages.length,
      0,
    ),
  )
  const totalTokens = createMemo(() =>
    Object.values(state.conversations).reduce(
      (count, conversation) => count + (conversation.usage?.totalTokens ?? 0),
      0,
    ),
  )

  return (
    <Show
      when={hooks().length > 0}
      fallback={
        <div class={styles().hookDetails.empty}>
          Open a page with TanStack AI hooks to inspect live state.
        </div>
      }
    >
      <div
        class={styles().hookDetails.overview}
        data-testid="ai-devtools-dashboard-overview"
      >
        <header class={styles().hookDetails.overviewHeader}>
          <div>
            <div class={styles().hookDetails.overviewTitle}>
              Hooks Dashboard
            </div>
            <div class={styles().hookDetails.overviewSubtitle}>
              Select a hook from the left or open one of the active hooks below.
            </div>
          </div>
        </header>

        <div class={styles().hookDetails.overviewMetricGrid}>
          <OverviewMetric label="active hooks" value={summary().active} />
          <OverviewMetric label="tools" value={summary().tools} />
          <OverviewMetric
            label="messages / runs"
            value={`${totalMessages()} / ${summary().runs}`}
          />
          <OverviewMetric
            label="tokens"
            value={formatMetricValue(totalTokens())}
          />
          <OverviewMetric label="hooks" value={summary().total} />
          <OverviewMetric label="active" value={summary().active} />
          <OverviewMetric label="running" value={summary().running} />
          <OverviewMetric label="categories" value={summary().categories} />
        </div>

        <div class={styles().hookDetails.overviewGroups}>
          <For each={groups()}>
            {(group) => (
              <section
                class={styles().hookDetails.overviewGroupCard}
                data-testid="ai-devtools-overview-category"
                data-category={group.id}
              >
                <div class={styles().hookDetails.overviewGroupHeader}>
                  <span>{group.label}</span>
                  <span>{group.hooks.length}</span>
                </div>
                <For each={group.hooks}>
                  {(hook) => {
                    const running = createMemo(() =>
                      isHookRunning(hook, state.hooks.runs),
                    )
                    const unseenCount = createMemo(() =>
                      getHookUnseenEventCount(state.hooks, hook.id),
                    )

                    return (
                      <button
                        type="button"
                        data-testid="ai-devtools-overview-hook"
                        data-hook-id={hook.id}
                        data-hook-name={hook.hookName}
                        data-display-name={getHookDisplayName(hook)}
                        class={styles().hookDetails.overviewHookButton}
                        onClick={() => props.onSelectHook(hook)}
                      >
                        <div class={styles().hookDetails.overviewHookMain}>
                          <span class={styles().hookDetails.overviewHookTitle}>
                            {getHookDisplayName(hook)}
                          </span>
                          <span class={styles().hookDetails.overviewHookId}>
                            <Show when={hook.displayName} fallback={hook.id}>
                              {hook.hookName} - {hook.id}
                            </Show>
                          </span>
                        </div>
                        <div class={styles().hookDetails.overviewHookMeta}>
                          <span class={styles().hookDetails.kind}>
                            {hook.outputKind ?? 'hook'}
                          </span>
                          <Show when={running()}>
                            <span class={styles().hookDetails.lifecycle}>
                              running
                            </span>
                          </Show>
                          <Show when={unseenCount() > 0}>
                            <span class={styles().hookDetails.kind}>
                              {unseenCount()} new
                            </span>
                          </Show>
                        </div>
                      </button>
                    )
                  }}
                </For>
              </section>
            )}
          </For>
        </div>
      </div>
    </Show>
  )
}

const OverviewMetric: Component<{ label: string; value: number | string }> = (
  props,
) => {
  const styles = useStyles()
  return (
    <div class={styles().hookDetails.overviewMetricCard}>
      <span class={styles().hookDetails.metricValue}>{props.value}</span>
      <span class={styles().hookDetails.metricLabel}>{props.label}</span>
    </div>
  )
}

const HookHeader: Component<{
  hook: HookRecord
  runs: number
  messages: number
  totalTokens: number
  isGenerationHook: boolean
}> = (props) => {
  const styles = useStyles()
  return (
    <header
      class={styles().hookDetails.header}
      data-testid="ai-devtools-hook-header"
      data-hook-id={props.hook.id}
      data-hook-name={props.hook.hookName}
      data-display-name={getHookDisplayName(props.hook)}
    >
      <div class={styles().hookDetails.headerMain}>
        <div class={styles().hookDetails.titleRow}>
          <span
            class={styles().hookDetails.title}
            data-testid="ai-devtools-hook-title"
          >
            {getHookDisplayName(props.hook)}
          </span>
          <span class={styles().hookDetails.lifecycle}>
            {props.hook.lifecycle}
          </span>
          <Show when={props.hook.outputKind}>
            <span class={styles().hookDetails.kind}>
              {props.hook.outputKind}
            </span>
          </Show>
        </div>
        <div class={styles().hookDetails.identity}>
          <Show when={props.hook.displayName}>
            <span data-testid="ai-devtools-hook-technical-name">
              {props.hook.hookName}
            </span>
          </Show>
          <span>{props.hook.id}</span>
          <Show when={props.hook.threadId}>
            <span>thread {props.hook.threadId}</span>
          </Show>
          <Show when={props.hook.framework}>
            <span>{props.hook.framework}</span>
          </Show>
        </div>
      </div>
      <div class={styles().hookDetails.metrics}>
        <Metric label="runs" value={props.runs} testId="runs" />
        <Show when={!props.isGenerationHook}>
          <Metric
            label="tools"
            value={props.hook.tools.length}
            testId="tools"
          />
          <Metric label="messages" value={props.messages} testId="messages" />
          <Metric
            label="tokens"
            value={formatMetricValue(props.totalTokens)}
            testId="tokens"
          />
        </Show>
      </div>
    </header>
  )
}

const Metric: Component<{
  label: string
  value: number | string
  testId?: string
}> = (props) => {
  const styles = useStyles()
  return (
    <div
      class={styles().hookDetails.metric}
      data-testid={
        props.testId ? `ai-devtools-hook-metric-${props.testId}` : undefined
      }
    >
      <span class={styles().hookDetails.metricValue}>{props.value}</span>
      <span class={styles().hookDetails.metricLabel}>{props.label}</span>
    </div>
  )
}

function formatMetricValue(value: number): string {
  return Intl.NumberFormat(undefined, { notation: 'compact' }).format(value)
}

const TabButton: Component<{
  label: string
  tab: DetailTab
  activeTab: DetailTab
  onSelect: Setter<DetailTab>
}> = (props) => {
  const styles = useStyles()
  return (
    <button
      type="button"
      data-testid="ai-devtools-hook-tab"
      data-tab={props.label}
      class={`${styles().hookDetails.tab} ${
        props.activeTab === props.tab ? styles().hookDetails.tabActive : ''
      }`}
      onClick={() => props.onSelect(props.tab)}
    >
      {props.label}
    </button>
  )
}

const ConversationPanel: Component<{
  hook: HookRecord
  conversation?: Conversation
  messages: Array<PreviewMessage>
  hoverTarget: HoverTarget | null
  onHoverTarget: (target: HoverTarget | null) => void
}> = (props) => {
  const styles = useStyles()
  return (
    <Show
      when={props.conversation}
      fallback={
        <Show
          when={props.messages.length > 0}
          fallback={
            <div class={styles().hookDetails.stack}>
              <section class={styles().hookDetails.section}>
                <div class={styles().hookDetails.sectionTitle}>
                  Current State
                </div>
                <JsonPanel value={props.hook.state} compact />
              </section>
            </div>
          }
        >
          <HookMessageTimeline
            messages={props.messages}
            hoverTarget={props.hoverTarget}
            onHoverTarget={props.onHoverTarget}
          />
        </Show>
      }
    >
      {(conversation) => (
        <Show
          when={conversation().iterations.length > 0}
          fallback={
            <HookMessageTimeline
              messages={props.messages}
              hoverTarget={props.hoverTarget}
              onHoverTarget={props.onHoverTarget}
            />
          }
        >
          <IterationTimeline
            iterations={conversation().iterations}
            messages={conversation().messages}
            hoverTarget={props.hoverTarget}
            onHoverTarget={props.onHoverTarget}
          />
        </Show>
      )}
    </Show>
  )
}

const MessagesPreview: Component<{
  hook: HookRecord
  messages: Array<PreviewMessage>
  hoverTarget: HoverTarget | null
  onHoverTarget: (target: HoverTarget | null) => void
}> = (props) => {
  const { saveToolFixture, applyToolFixture } = useAIStore()
  const styles = useStyles()
  const [pendingFixture, setPendingFixture] =
    createSignal<ToolFixtureRecord | null>(null)
  const partClass = (kind: PreviewPart['kind']) => {
    const hookDetails = styles().hookDetails
    if (kind === 'thinking') return hookDetails.previewPartThinking
    if (kind === 'tool-call') return hookDetails.previewPartToolCall
    if (kind === 'tool-result') return hookDetails.previewPartToolResult
    if (kind === 'structured-output')
      return hookDetails.previewPartStructuredOutput
    if (kind === 'media') return hookDetails.previewPartMedia
    return ''
  }
  const saveObservedToolCall = (message: PreviewMessage, part: PreviewPart) => {
    const fixture = createFixtureFromPreviewPart(props.hook, message, part)
    if (!fixture) return
    setPendingFixture(fixture)
  }
  const confirmSaveObservedToolCall = (name: string) => {
    const fixture = pendingFixture()
    if (!fixture) return
    saveToolFixture({ ...fixture, name })
    setPendingFixture(null)
  }
  const replayObservedToolCall = (
    message: PreviewMessage,
    part: PreviewPart,
  ) => {
    const fixture = createFixtureFromPreviewPart(props.hook, message, part)
    if (!fixture) return
    applyToolFixture(fixture)
  }

  return (
    <Show
      when={props.messages.length > 0}
      fallback={<div class={styles().hookDetails.emptySmall}>No messages.</div>}
    >
      <div class={styles().hookDetails.messages}>
        <Show when={pendingFixture()}>
          {(fixture) => (
            <FixtureNamePopover
              defaultName={`${fixture().toolName} fixture`}
              onCancel={() => setPendingFixture(null)}
              onSave={confirmSaveObservedToolCall}
            />
          )}
        </Show>
        <For each={props.messages}>
          {(message) => {
            const visibleParts = () => visiblePreviewPartsForMessage(message)
            return (
              <div
                {...getHoverDataAttributes({
                  messageIds: [message.id],
                  partIds: visibleParts().map((part) => part.id),
                })}
                class={`${styles().hookDetails.message} ${
                  isMessageOrPartHighlighted(
                    message.id,
                    visibleParts().map((part) => part.id),
                    props.hoverTarget,
                  )
                    ? styles().hookDetails.messageHighlighted
                    : ''
                }`}
                data-testid="ai-devtools-preview-message"
                data-message-id={message.id}
                data-role={message.role}
                onMouseEnter={() =>
                  props.onHoverTarget(
                    createHoverTarget({
                      messageIds: [message.id],
                      origin: 'preview',
                    }),
                  )
                }
                onMouseLeave={() => props.onHoverTarget(null)}
              >
                <div class={styles().hookDetails.messageRole}>
                  {message.role}
                </div>
                <Show when={message.content}>
                  <div class={styles().hookDetails.messageContent}>
                    {message.content}
                  </div>
                </Show>
                <For each={visibleParts()}>
                  {(part) => (
                    <div
                      {...getHoverDataAttributes({
                        messageIds: [message.id],
                        partIds: [part.id],
                      })}
                      class={`${styles().hookDetails.previewPart} ${partClass(part.kind)} ${
                        props.hoverTarget?.partIds.includes(part.id)
                          ? styles().hookDetails.previewPartHighlighted
                          : ''
                      }`}
                      data-testid="ai-devtools-preview-part"
                      data-part-id={part.id}
                      data-part-kind={part.kind}
                      onMouseEnter={() =>
                        props.onHoverTarget(
                          createHoverTarget({
                            messageIds: [message.id],
                            partIds: [part.id],
                            origin: 'preview',
                          }),
                        )
                      }
                      onMouseLeave={() =>
                        props.onHoverTarget(
                          createHoverTarget({
                            messageIds: [message.id],
                            origin: 'preview',
                          }),
                        )
                      }
                    >
                      <span class={styles().hookDetails.previewPartLabel}>
                        {part.label}
                      </span>
                      <Show when={part.fixture}>
                        <div class={styles().hookDetails.previewPartActions}>
                          <button
                            type="button"
                            class={styles().hookDetails.previewPartActionButton}
                            data-testid="ai-devtools-preview-save-tool-call"
                            onClick={(event) => {
                              event.stopPropagation()
                              saveObservedToolCall(message, part)
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            class={styles().hookDetails.previewPartActionButton}
                            data-testid="ai-devtools-preview-replay-tool-call"
                            onClick={(event) => {
                              event.stopPropagation()
                              replayObservedToolCall(message, part)
                            }}
                          >
                            Replay
                          </button>
                        </div>
                      </Show>
                      <Show
                        when={part.jsonItems?.length}
                        fallback={
                          <span class={styles().hookDetails.previewPartContent}>
                            {part.content}
                          </span>
                        }
                      >
                        <div
                          class={`${styles().hookDetails.previewJsonItems} ${
                            part.kind === 'structured-output'
                              ? styles().hookDetails.previewJsonItemsCompare
                              : ''
                          }`}
                        >
                          <For each={part.jsonItems}>
                            {(item) => (
                              <div class={styles().hookDetails.previewJsonItem}>
                                <span
                                  class={
                                    styles().hookDetails.previewJsonItemLabel
                                  }
                                >
                                  {item.label}
                                </span>
                                <div
                                  class={styles().hookDetails.previewJsonPanel}
                                >
                                  <JsonTree
                                    value={item.value}
                                    defaultExpansionDepth={1}
                                    copyable
                                  />
                                </div>
                              </div>
                            )}
                          </For>
                        </div>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            )
          }}
        </For>
      </div>
    </Show>
  )
}

const HookMessageTimeline: Component<{
  messages: Array<PreviewMessage>
  hoverTarget: HoverTarget | null
  onHoverTarget: (target: HoverTarget | null) => void
}> = (props) => {
  const styles = useStyles()

  return (
    <Show
      when={props.messages.length > 0}
      fallback={
        <div class={styles().hookDetails.emptySmall}>
          No messages yet. Start a conversation to see messages here.
        </div>
      }
    >
      <div class={styles().hookDetails.messageTimeline}>
        <For each={props.messages}>
          {(message) => (
            <div
              {...getHoverDataAttributes({ messageIds: [message.id] })}
              data-testid="ai-devtools-timeline-message"
              data-message-id={message.id}
              data-role={message.role}
              class={`${styles().hookDetails.timelineMessage} ${
                isMessageHighlighted(message.id, props.hoverTarget)
                  ? styles().hookDetails.timelineMessageHighlighted
                  : ''
              }`}
              onMouseEnter={() =>
                props.onHoverTarget(
                  createHoverTarget({
                    messageIds: [message.id],
                    origin: 'timeline',
                  }),
                )
              }
              onMouseLeave={() => props.onHoverTarget(null)}
            >
              <div class={styles().hookDetails.messageRole}>{message.role}</div>
              <Show when={message.content}>
                <div class={styles().hookDetails.messageContent}>
                  {message.content}
                </div>
              </Show>
              <For each={visiblePreviewPartsForMessage(message)}>
                {(part) => (
                  <div
                    {...getHoverDataAttributes({
                      messageIds: [message.id],
                      partIds: [part.id],
                    })}
                    class={styles().hookDetails.previewPart}
                    data-testid="ai-devtools-timeline-part"
                    data-part-id={part.id}
                    data-part-kind={part.kind}
                  >
                    <span class={styles().hookDetails.previewPartLabel}>
                      {part.label}
                    </span>
                    <Show
                      when={part.jsonItems?.length}
                      fallback={
                        <span class={styles().hookDetails.previewPartContent}>
                          {part.content}
                        </span>
                      }
                    >
                      <div
                        class={`${styles().hookDetails.previewJsonItems} ${
                          part.kind === 'structured-output'
                            ? styles().hookDetails.previewJsonItemsCompare
                            : ''
                        }`}
                      >
                        <For each={part.jsonItems}>
                          {(item) => (
                            <div class={styles().hookDetails.previewJsonItem}>
                              <span
                                class={
                                  styles().hookDetails.previewJsonItemLabel
                                }
                              >
                                {item.label}
                              </span>
                              <div
                                class={styles().hookDetails.previewJsonPanel}
                              >
                                <JsonTree
                                  value={item.value}
                                  defaultExpansionDepth={1}
                                  copyable
                                />
                              </div>
                            </div>
                          )}
                        </For>
                      </div>
                    </Show>
                  </div>
                )}
              </For>
            </div>
          )}
        </For>
      </div>
    </Show>
  )
}

const ToolsView: Component<{ hook: HookRecord }> = (props) => {
  const { state, applyToolFixture, deleteToolFixture } = useAIStore()
  const styles = useStyles()
  const [selectedToolName, setSelectedToolName] = createSignal<string | null>(
    props.hook.tools[0]?.name ?? null,
  )

  const selectedTool = createMemo(() =>
    props.hook.tools.find((tool) => tool.name === selectedToolName()),
  )

  const savedFixtures = createMemo(() =>
    state.hooks.fixtures
      .filter(
        (fixture) =>
          fixture.hookId === props.hook.id ||
          (!!props.hook.threadId && fixture.threadId === props.hook.threadId),
      )
      .sort((a, b) => b.createdAt - a.createdAt),
  )

  return (
    <div class={styles().hookDetails.toolsGrid} data-testid="ai-devtools-tools">
      <div class={styles().hookDetails.toolsList}>
        <Show
          when={props.hook.tools.length > 0}
          fallback={
            <div class={styles().hookDetails.emptySmall}>No tools.</div>
          }
        >
          <For each={props.hook.tools}>
            {(tool) => (
              <button
                type="button"
                data-testid="ai-devtools-tool-row"
                data-tool-name={tool.name}
                class={`${styles().hookDetails.toolRow} ${
                  selectedToolName() === tool.name
                    ? styles().hookDetails.toolRowSelected
                    : ''
                }`}
                onClick={() => setSelectedToolName(tool.name)}
              >
                <span class={styles().hookDetails.toolName}>{tool.name}</span>
                <Show when={tool.needsApproval}>
                  <span class={styles().hookDetails.eventBadge}>approval</span>
                </Show>
              </button>
            )}
          </For>
        </Show>
      </div>
      <div class={styles().hookDetails.toolDetail}>
        <Show
          when={selectedTool()}
          fallback={
            <div class={styles().hookDetails.emptySmall}>Select a tool.</div>
          }
        >
          {(tool) => (
            <>
              <ToolFixtureForm
                hook={props.hook}
                tool={tool()}
                onFire={(fixture) => applyToolFixture(fixture)}
              />
              <div class={styles().hookDetails.sectionTitle}>
                Saved Fixtures
              </div>
              <Show
                when={savedFixtures().length > 0}
                fallback={
                  <div class={styles().hookDetails.emptySmall}>
                    No saved fixtures for this hook.
                  </div>
                }
              >
                <div class={styles().hookDetails.eventList}>
                  <For each={savedFixtures()}>
                    {(fixture) => (
                      <div
                        class={styles().hookDetails.fixtureRow}
                        data-testid="ai-devtools-fixture-row"
                        data-fixture-name={fixture.name ?? fixture.toolName}
                        data-tool-name={fixture.toolName}
                      >
                        <div class={styles().hookDetails.fixtureInfo}>
                          <span class={styles().hookDetails.fixtureName}>
                            {fixture.name ?? fixture.toolName}
                          </span>
                          <span class={styles().hookDetails.fixtureMeta}>
                            {fixture.toolName} - {formatTime(fixture.createdAt)}
                          </span>
                        </div>
                        <div class={styles().hookDetails.fixtureRowActions}>
                          <button
                            type="button"
                            class={styles().hookDetails.fixtureRowButton}
                            data-testid="ai-devtools-fixture-replay"
                            onClick={() => applyToolFixture(fixture)}
                          >
                            Replay
                          </button>
                          <button
                            type="button"
                            class={`${styles().hookDetails.fixtureRowButton} ${styles().hookDetails.fixtureDangerButton}`}
                            data-testid="ai-devtools-fixture-delete"
                            onClick={() => deleteToolFixture(fixture.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </For>
                </div>
              </Show>
            </>
          )}
        </Show>
      </div>
    </div>
  )
}

const JsonPanel: Component<{ value: unknown; compact?: boolean }> = (props) => {
  const styles = useStyles()
  return (
    <div
      class={`${styles().hookDetails.jsonPanel} ${
        props.compact ? styles().hookDetails.jsonPanelCompact : ''
      }`}
    >
      <JsonTree
        value={props.value}
        defaultExpansionDepth={props.compact ? 1 : 2}
        copyable
      />
    </div>
  )
}

function messagesFromSnapshot(
  state: Record<string, unknown>,
): Array<PreviewMessage> {
  const messages = state.messages
  if (!Array.isArray(messages)) return []
  return messages.map(messageFromUnknown).filter(isPreviewMessage)
}

function setHoverTargetFromEvent(
  event: MouseEvent & { currentTarget: HTMLElement },
  origin: HoverOrigin,
  onHoverTarget: (target: HoverTarget | null) => void,
): void {
  const element = findClosestHoverTargetElement(
    event.target,
    event.currentTarget,
  )
  if (!element) return

  onHoverTarget(
    createHoverTargetFromDataAttributes({
      messageIds: element.getAttribute('data-ai-devtools-hover-message-ids'),
      partIds: element.getAttribute('data-ai-devtools-hover-part-ids'),
      origin,
    }),
  )
}

function findClosestHoverTargetElement(
  target: EventTarget | null,
  container: HTMLElement,
): HTMLElement | undefined {
  if (!(target instanceof Element)) return undefined

  const element = target.closest<HTMLElement>(
    '[data-ai-devtools-hover-message-ids], [data-ai-devtools-hover-part-ids]',
  )

  if (!element || !container.contains(element)) return undefined
  return element
}

function findMatchingHoverElement(
  container: HTMLElement,
  target: HoverTarget,
): HTMLElement | undefined {
  const elements = Array.from(
    container.querySelectorAll<HTMLElement>(
      '[data-ai-devtools-hover-message-ids], [data-ai-devtools-hover-part-ids]',
    ),
  )

  if (target.partIds.length > 0) {
    const partElement = elements.find((element) =>
      hoverTargetMatchesElement(
        { ...target, messageIds: [] },
        {
          messageIds: element.getAttribute(
            'data-ai-devtools-hover-message-ids',
          ),
          partIds: element.getAttribute('data-ai-devtools-hover-part-ids'),
        },
      ),
    )
    if (partElement) return partElement
  }

  return elements.find((element) =>
    hoverTargetMatchesElement(target, {
      messageIds: element.getAttribute('data-ai-devtools-hover-message-ids'),
      partIds: element.getAttribute('data-ai-devtools-hover-part-ids'),
    }),
  )
}

function scrollElementIntoPaneView(
  pane: HTMLElement,
  element: HTMLElement,
  options: { align: 'nearest' | 'start' },
): void {
  const scrollContainer = findScrollContainer(element, pane)
  const containerRect = scrollContainer.getBoundingClientRect()
  const elementRect = element.getBoundingClientRect()
  const padding = 8

  let nextScrollTop = scrollContainer.scrollTop
  if (options.align === 'start') {
    nextScrollTop += elementRect.top - containerRect.top - padding
  } else if (elementRect.top < containerRect.top + padding) {
    nextScrollTop += elementRect.top - containerRect.top - padding
  } else if (elementRect.bottom > containerRect.bottom - padding) {
    nextScrollTop += elementRect.bottom - containerRect.bottom + padding
  } else {
    return
  }

  animateScrollTop(scrollContainer, Math.max(0, nextScrollTop))
}

function findScrollContainer(
  element: HTMLElement,
  boundary: HTMLElement,
): HTMLElement {
  let current = element.parentElement

  while (current && boundary.contains(current)) {
    const style = getComputedStyle(current)
    const canScroll =
      current.scrollHeight > current.clientHeight &&
      /(auto|scroll|overlay)/.test(style.overflowY)

    if (canScroll) return current
    if (current === boundary) break
    current = current.parentElement
  }

  return boundary
}

function animateScrollTop(element: HTMLElement, targetScrollTop: number): void {
  const startScrollTop = element.scrollTop
  const distance = targetScrollTop - startScrollTop
  if (Math.abs(distance) < 1) return

  const existingAnimation = scrollAnimations.get(element)
  if (existingAnimation !== undefined) {
    window.clearTimeout(existingAnimation)
  }

  const startedAt = performance.now()
  const duration = 220

  const step = () => {
    const now = performance.now()
    const progress = Math.min(1, (now - startedAt) / duration)
    const eased = 1 - Math.pow(1 - progress, 3)
    element.scrollTop = startScrollTop + distance * eased

    if (progress < 1) {
      scrollAnimations.set(element, window.setTimeout(step, 16))
      return
    }

    scrollAnimations.delete(element)
  }

  scrollAnimations.set(element, window.setTimeout(step, 16))
}

function findConversationForHook(
  hook: HookRecord,
  conversations: Record<string, Conversation>,
): Conversation | undefined {
  const candidates: Array<Conversation> = []
  const addCandidate = (conversation: Conversation | undefined) => {
    if (!conversation) return
    if (candidates.some((item) => item.id === conversation.id)) return
    candidates.push(conversation)
  }

  addCandidate(conversations[hook.id])
  if (hook.clientId) addCandidate(conversations[hook.clientId])
  if (hook.threadId) addCandidate(conversations[hook.threadId])

  if (hook.runIds.length > 0) {
    const runIds = new Set(hook.runIds)
    addCandidate(
      Object.values(conversations).find((conversation) =>
        conversation.runIds?.some((runId) => runIds.has(runId)),
      ),
    )
  }

  const snapshotMessages = hook.state.messages
  if (Array.isArray(snapshotMessages)) {
    const messageIds = new Set(
      snapshotMessages
        .map((message) =>
          isRecord(message) && typeof message.id === 'string'
            ? message.id
            : undefined,
        )
        .filter((id): id is string => typeof id === 'string'),
    )

    if (messageIds.size > 0) {
      addCandidate(
        Object.values(conversations).find((conversation) =>
          conversation.messages.some((message) => messageIds.has(message.id)),
        ),
      )
    }
  }

  return (
    candidates.find(
      (conversation) =>
        conversation.iterations.length > 0 && conversation.messages.length > 0,
    ) ??
    candidates.find((conversation) => conversation.iterations.length > 0) ??
    candidates.find((conversation) => conversation.messages.length > 0) ??
    candidates[0]
  )
}

function messageFromConversation(message: Message): PreviewMessage {
  const sourceMessage = toolFixtureMessageFromConversation(message)

  if (
    message.role === 'tool' &&
    (!message.parts || message.parts.length === 0)
  ) {
    return {
      id: message.id,
      role: message.role,
      content: '',
      parts: [toolResultPartFromContent(message.id, message.content)],
    }
  }

  return {
    id: message.id,
    role: message.role,
    content: message.content,
    ...(sourceMessage ? { sourceMessage } : {}),
    parts: [
      ...partsFromMessageParts(message.parts ?? [], message.id),
      ...partsFromToolCalls(message.toolCalls ?? [], message.id),
    ],
  }
}

function messageFromUnknown(value: unknown): PreviewMessage | undefined {
  if (!isRecord(value)) return undefined
  const id = typeof value.id === 'string' ? value.id : undefined
  const role = typeof value.role === 'string' ? value.role : undefined
  if (!id || !role) return undefined
  const sourceMessage = toolFixtureMessageFromUnknown(value)

  const content =
    typeof value.content === 'string'
      ? value.content
      : Array.isArray(value.parts)
        ? partsToMessageText(value.parts)
        : ''

  return {
    id,
    role,
    content,
    ...(sourceMessage ? { sourceMessage } : {}),
    parts: Array.isArray(value.parts) ? partsFromUnknown(value.parts, id) : [],
  }
}

function partsFromMessageParts(
  parts: Array<MessagePart>,
  messageId: string,
): Array<PreviewPart> {
  return parts.map((part, index) =>
    previewPartFromRecord(part, index, messageId),
  )
}

function partsFromUnknown(
  parts: Array<unknown>,
  messageId?: string,
): Array<PreviewPart> {
  return parts
    .map((part, index) =>
      isRecord(part)
        ? previewPartFromRecord(part, index, messageId)
        : undefined,
    )
    .filter(isPreviewPart)
}

function previewPartFromRecord(
  part: PreviewPartSource,
  index: number,
  messageId?: string,
): PreviewPart {
  const type = typeof part.type === 'string' ? part.type : 'part'
  if (type === 'tool-call') {
    const name =
      typeof part.name === 'string'
        ? part.name
        : typeof part.toolName === 'string'
          ? part.toolName
          : 'tool'
    const rawId =
      typeof part.toolCallId === 'string'
        ? part.toolCallId
        : typeof part.id === 'string'
          ? part.id
          : `${index}:${name}`
    const input = part.input ?? part.arguments
    const output = part.output
    const parsedInput = input === undefined ? {} : parseJsonishValue(input)
    const parsedOutput =
      output === undefined ? undefined : parseJsonishValue(output)
    const approvalStatus = approvalStatusFromRecord(part.approval, part.state)
    const jsonItems: Array<PreviewJsonItem> = []
    if (input !== undefined) {
      jsonItems.push({
        label: 'Input',
        value: parsedInput,
      })
    }
    if (part.approval !== undefined) {
      jsonItems.push({
        label: 'Approval',
        value: parseJsonishValue(part.approval),
      })
    }
    if (output !== undefined) {
      jsonItems.push({
        label: 'Output',
        value: parsedOutput,
      })
    }
    return {
      id: toolCallPartId(rawId),
      label: approvalStatus
        ? `tool call ${name} - ${approvalStatus}`
        : `tool call ${name}`,
      content: formatUnknown(input ?? output),
      jsonItems,
      kind: 'tool-call',
      fixture: {
        toolName: name,
        input: parsedInput,
        ...(parsedOutput !== undefined ? { output: parsedOutput } : {}),
        toolCallId: rawId,
        ...(messageId ? { messageId } : {}),
      },
    }
  }
  if (type === 'tool-result') {
    const name =
      typeof part.name === 'string'
        ? part.name
        : typeof part.toolName === 'string'
          ? part.toolName
          : undefined
    const rawId =
      typeof part.toolCallId === 'string'
        ? part.toolCallId
        : typeof part.id === 'string'
          ? part.id
          : `${index}`
    const output = part.output ?? part.content ?? part.error
    return {
      id: toolResultPartId(rawId),
      label: name ? `tool result ${name}` : 'tool result',
      content: formatUnknown(output),
      jsonItems:
        output === undefined
          ? []
          : [
              {
                label: part.error ? 'Error' : 'Output',
                value: parseJsonishValue(output),
              },
            ],
      kind: 'tool-result',
    }
  }
  if (type === 'structured-output') {
    const status = typeof part.status === 'string' ? part.status : undefined
    const raw = typeof part.raw === 'string' ? part.raw : undefined

    return {
      id: structuredOutputPartId(messageId ?? `${index}`),
      label: status ? `structured output - ${status}` : 'structured output',
      content: raw ?? formatUnknown(part.data ?? part.partial),
      jsonItems: structuredOutputJsonItems(part),
      kind: 'structured-output',
    }
  }
  if (type === 'thinking') {
    return {
      id: `${index}:thinking`,
      label: 'reasoning',
      content: formatUnknown(part.content),
      kind: 'thinking',
    }
  }
  if (type === 'image' || type === 'audio' || type === 'video') {
    return {
      id: `${index}:${type}`,
      label: type,
      content: formatUnknown(part.source ?? part.metadata),
      kind: 'media',
    }
  }
  return {
    id: `${index}:${type}`,
    label: type,
    content: formatUnknown(part.content ?? part.text),
    kind: 'text',
  }
}

function partsFromToolCalls(
  toolCalls: Array<ToolCall>,
  messageId: string,
): Array<PreviewPart> {
  return toolCalls.map((tool) => {
    const input = parseJsonishValue(tool.arguments)
    const output =
      tool.result === undefined ? undefined : parseJsonishValue(tool.result)
    const approvalStatus = approvalStatusFromToolCall(tool)
    const jsonItems: Array<PreviewJsonItem> = [
      {
        label: 'Input',
        value: input,
      },
    ]

    if (tool.approvalId) {
      jsonItems.push({
        label: 'Approval',
        value: {
          id: tool.approvalId,
          required: tool.approvalRequired,
          approved: tool.approvalApproved,
        },
      })
    }

    if (output !== undefined) {
      jsonItems.push({
        label: 'Output',
        value: output,
      })
    }

    return {
      id: toolCallPartId(tool.id),
      label: approvalStatus
        ? `tool call ${tool.name} - ${approvalStatus}`
        : `tool call ${tool.name}`,
      content: formatUnknown(tool.arguments),
      jsonItems,
      kind: 'tool-call',
      fixture: {
        toolName: tool.name,
        input,
        ...(output !== undefined ? { output } : {}),
        toolCallId: tool.id,
        messageId,
      },
    }
  })
}

function toolFixtureMessageFromConversation(
  message: Message,
): ToolFixtureMessage | undefined {
  if (!isToolFixtureMessageRole(message.role)) return undefined

  const parts =
    message.parts && message.parts.length > 0
      ? message.parts
      : message.toolCalls && message.toolCalls.length > 0
        ? message.toolCalls.map(toolCallToFixturePart)
        : message.content
          ? [{ type: 'text', content: message.content }]
          : []

  if (parts.length === 0) return undefined

  return {
    id: message.id,
    role: message.role,
    parts: parts.map(jsonSafeValue),
    createdAt: message.timestamp,
  }
}

function toolFixtureMessageFromUnknown(
  value: Record<string, unknown>,
): ToolFixtureMessage | undefined {
  const id = typeof value.id === 'string' ? value.id : undefined
  const role = typeof value.role === 'string' ? value.role : undefined
  if (!id || !isToolFixtureMessageRole(role)) return undefined

  const parts = Array.isArray(value.parts)
    ? value.parts
    : typeof value.content === 'string'
      ? [{ type: 'text', content: value.content }]
      : []
  if (parts.length === 0) return undefined

  return {
    id,
    role,
    parts: parts.map(jsonSafeValue),
  }
}

function approvalStatusFromToolCall(tool: ToolCall): string | undefined {
  if (tool.approvalApproved === true || tool.state === 'approved') {
    return 'approved'
  }
  if (tool.approvalApproved === false || tool.state === 'denied') {
    return 'denied'
  }
  if (
    tool.approvalRequired ||
    tool.approvalId ||
    tool.state === 'approval-requested'
  ) {
    return 'approval requested'
  }
  if (tool.state === 'approval-responded') {
    return 'responded'
  }
  return undefined
}

function approvalStatusFromRecord(
  approval: unknown,
  state: unknown,
): string | undefined {
  if (isRecord(approval)) {
    if (approval.approved === true) return 'approved'
    if (approval.approved === false) return 'denied'
    if (approval.needsApproval === true) return 'approval requested'
  }
  if (state === 'approved') return 'approved'
  if (state === 'denied') return 'denied'
  if (state === 'approval-requested') return 'approval requested'
  if (state === 'approval-responded') return 'responded'
  return undefined
}

function toolCallToFixturePart(tool: ToolCall): Record<string, unknown> {
  return {
    type: 'tool-call',
    id: tool.id,
    name: tool.name,
    arguments: tool.arguments,
    input: parseJsonishValue(tool.arguments),
    state: tool.state,
    ...(tool.approvalId
      ? {
          approval: {
            id: tool.approvalId,
            needsApproval: tool.approvalRequired ?? false,
            ...(tool.approvalApproved !== undefined
              ? { approved: tool.approvalApproved }
              : {}),
          },
        }
      : {}),
    ...(tool.result !== undefined ? { output: tool.result } : {}),
  }
}

function createFixtureFromPreviewPart(
  hook: HookRecord,
  message: PreviewMessage,
  part: PreviewPart,
): ReturnType<typeof createToolFixtureRecord> | undefined {
  if (!part.fixture) return undefined
  const hasRegisteredClientTool = hook.tools.some(
    (tool) => tool.name === part.fixture?.toolName,
  )

  return createToolFixtureRecord({
    hookId: hook.id,
    ...(hook.threadId ? { threadId: hook.threadId } : {}),
    ...(message.sourceMessage ? { message: message.sourceMessage } : {}),
    ...(hasRegisteredClientTool && part.fixture.output === undefined
      ? { execute: true }
      : {}),
    ...part.fixture,
  })
}

function toolResultPartFromContent(
  messageId: string,
  content: string,
): PreviewPart {
  return {
    id: toolResultPartId(messageId),
    label: 'tool result',
    content,
    jsonItems: [
      {
        label: 'Output',
        value: parseJsonishValue(content),
      },
    ],
    kind: 'tool-result',
  }
}

function formatUnknown(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isPreviewMessage(
  value: PreviewMessage | undefined,
): value is PreviewMessage {
  return Boolean(value)
}

function isPreviewPart(value: PreviewPart | undefined): value is PreviewPart {
  return Boolean(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isToolFixtureMessageRole(
  role: unknown,
): role is ToolFixtureMessage['role'] {
  return role === 'system' || role === 'user' || role === 'assistant'
}

function jsonSafeValue(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value))
  } catch {
    return value
  }
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString()
}
