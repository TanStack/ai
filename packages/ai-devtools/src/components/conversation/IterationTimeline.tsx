import { For, Index, Show, createMemo, createSignal } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import { useStyles } from '../../styles/use-styles'
import {
  createHoverTarget,
  getHoverDataAttributes,
  isMessageHighlighted,
} from '../hooks/preview-model'
import { formatDuration } from '../utils'
import { buildSubagentSteps, groupTimeline } from '../../store/subagent-steps'
import { IterationCard } from './IterationCard'
import type { HoverTarget } from '../hooks/preview-model'
import type { Iteration, Message } from '../../store/ai-store'
import type {
  AgentStepGroup,
  SubagentInfo,
  TimelineGroup,
} from '../../store/subagent-steps'
import type { Component } from 'solid-js'

/** A group of iterations triggered by a single user message */
type UserMessageGroup = TimelineGroup

interface IterationTimelineProps {
  iterations: Array<Iteration>
  messages: Array<Message>
  /** Child agents from the hook snapshot. Their steps get their own cards. */
  subagents?: Array<SubagentInfo>
  /** The chat's user messages, from the snapshot. They mark the turns. */
  turns?: Array<Message>
  hoverTarget?: HoverTarget | null
  onHoverTarget?: (target: HoverTarget | null) => void
}

export const IterationTimeline: Component<IterationTimelineProps> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline

  /**
   * Group iterations by user messages.
   * Memoized to avoid recomputing on unrelated store changes.
   */
  const groups = createMemo(
    (): Array<UserMessageGroup> =>
      groupTimeline(
        props.iterations,
        props.messages,
        props.subagents ?? [],
        props.turns ?? [],
      ),
  )

  return (
    <div class={s().container}>
      <Show
        when={props.iterations.length > 0}
        fallback={<div class={s().noIterations}>No iterations recorded</div>}
      >
        <div class={s().pipeline}>
          <Index each={groups()}>
            {(group) => (
              <UserMessageGroupCard
                group={group()}
                allMessages={props.messages}
                hoverTarget={props.hoverTarget ?? null}
                onHoverTarget={props.onHoverTarget}
              />
            )}
          </Index>
        </div>
      </Show>
    </div>
  )
}

/** Collapsible system prompt with preview */
export const SystemPromptItem: Component<{ prompt: string; index: number }> = (
  props,
) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [expanded, setExpanded] = createSignal(false)

  const isLong = () => props.prompt.length > 120
  const preview = () =>
    isLong() ? props.prompt.slice(0, 120) + '...' : props.prompt

  return (
    <div class={s().systemPromptCard}>
      <div
        class={s().systemPromptHeader}
        onClick={() => isLong() && setExpanded(!expanded())}
      >
        <span class={s().systemPromptIndex}>#{props.index + 1}</span>
        <span class={s().systemPromptPreview}>
          {expanded() ? '' : preview()}
        </span>
        <Show when={isLong()}>
          <span class={s().stepExpandToggle}>
            {expanded() ? 'collapse' : 'expand'}
          </span>
        </Show>
      </div>
      <Show when={expanded()}>
        <pre class={s().systemPromptFull}>{props.prompt}</pre>
      </Show>
    </div>
  )
}

/** Card wrapping a user message and its child iterations */
const UserMessageGroupCard: Component<{
  group: UserMessageGroup
  allMessages: Array<Message>
  hoverTarget: HoverTarget | null
  onHoverTarget?: (target: HoverTarget | null) => void
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [isOpen, setIsOpen] = createSignal(true)
  const [configExpanded, setConfigExpanded] = createSignal(false)

  const group = () => props.group
  const userMsg = () => group().userMessage
  const userMessageId = () => userMsg()?.id
  const iters = () => group().iterations

  const totalDuration = createMemo(() => {
    let sum = 0
    for (const it of iters()) {
      if (it.completedAt) {
        sum += it.completedAt - it.startedAt
      }
    }
    return sum > 0 ? sum : undefined
  })

  /** Count actual tool invocations across all messages in this group */
  const toolInvocationCounts = createMemo(() => {
    const counts = new Map<string, number>()
    const allMsgIds = new Set<string>()
    for (const it of iters()) {
      for (const id of it.messageIds) allMsgIds.add(id)
    }
    for (const msg of props.allMessages) {
      if (allMsgIds.has(msg.id) && msg.toolCalls) {
        for (const tc of msg.toolCalls) {
          counts.set(tc.name, (counts.get(tc.name) || 0) + 1)
        }
      }
    }
    return counts
  })

  const totalToolCalls = createMemo(() => {
    let count = 0
    for (const v of toolInvocationCounts().values()) count += v
    return count
  })

  // Iterations store CUMULATIVE usage per request, so keep the MAX totalTokens
  // reading per requestId. Comparing on totalTokens directly (not prompt +
  // completion) is necessary because some providers — Anthropic, OpenAI o-series
  // — bundle reasoning tokens into totalTokens that are not summed into
  // prompt + completion, and a later reading with fewer reasoning tokens would
  // otherwise overwrite a larger earlier one.
  const totalUsage = createMemo(() => {
    const maxByRequest = new Map<
      string,
      { prompt: number; completion: number; total: number }
    >()
    for (const it of iters()) {
      if (!it.usage) continue
      const key = it.requestId || '__default__'
      const existing = maxByRequest.get(key)
      if (!existing || it.usage.totalTokens > existing.total) {
        maxByRequest.set(key, {
          prompt: it.usage.promptTokens,
          completion: it.usage.completionTokens,
          total: it.usage.totalTokens,
        })
      }
    }
    let prompt = 0
    let completion = 0
    let total = 0
    for (const v of maxByRequest.values()) {
      prompt += v.prompt
      completion += v.completion
      total += v.total
    }
    if (total === 0) return undefined
    return {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
    }
  })

  const isActive = () => iters().some((it) => !it.completedAt)
  const hasError = () => iters().some((it) => it.finishReason === 'error')
  const allCompleted = () =>
    iters().every((it) => !!it.completedAt) && !hasError()

  const groupAccentClass = () => {
    if (isActive()) return s().cardActive
    if (hasError()) return s().cardError
    if (allCompleted()) return s().cardCompleted
    return ''
  }

  const userContent = () => {
    const msg = userMsg()
    if (!msg) return '(no user message)'
    const text = msg.content || ''
    return text.length > 120 ? text.slice(0, 120) + '...' : text
  }

  const handleUserMouseEnter = () => {
    const messageId = userMessageId()
    if (messageId) {
      props.onHoverTarget?.(
        createHoverTarget({
          messageIds: [messageId],
          origin: 'timeline',
        }),
      )
    }
  }

  const handleUserMouseLeave = () => {
    props.onHoverTarget?.(null)
  }

  const isUserMessageHighlighted = () => {
    const messageId = userMessageId()
    return messageId
      ? isMessageHighlighted(messageId, props.hoverTarget)
      : false
  }

  // Config from the first iteration of this group
  const firstIter = createMemo(() => iters()[0])

  const configSubtitle = () => {
    const first = firstIter()
    if (!first) return null
    const parts: Array<string> = []
    if (first.model) parts.push(first.model)
    if (first.provider) parts.push(first.provider)
    return parts.length > 0 ? parts.join(' \u00B7 ') : null
  }

  const toolNames = () => firstIter()?.toolNames || []
  const systemPrompts = () => firstIter()?.systemPrompts || []
  const modelOptions = () => firstIter()?.modelOptions
  const hasModelOptions = () => {
    const opts = modelOptions()
    return opts && Object.keys(opts).length > 0
  }

  const middlewareTransformCount = createMemo(() => {
    let count = 0
    for (const it of iters()) {
      for (const ev of it.middlewareEvents) {
        if (ev.hasTransform) count++
      }
    }
    return count
  })

  const hasExpandableConfig = () =>
    toolNames().length > 0 || systemPrompts().length > 0 || hasModelOptions()

  return (
    <div
      {...getHoverDataAttributes({
        messageIds: userMessageId() ? [userMessageId() ?? ''] : [],
      })}
      class={`${s().card} ${groupAccentClass()} ${
        isUserMessageHighlighted() ? s().cardHighlighted : ''
      }`}
    >
      {/* User message header */}
      <div
        class={s().cardHeader}
        onClick={() => setIsOpen(!isOpen())}
        onMouseEnter={handleUserMouseEnter}
        onMouseLeave={handleUserMouseLeave}
      >
        <div class={s().userBubble}>U</div>
        <div class={s().cardHeaderContent}>
          <span class={s().cardHeaderLabel}>{userContent()}</span>
          {/* Config subtitle — always visible under user message */}
          <div class={s().cardSubtitle}>
            <Show when={configSubtitle()}>
              <span class={s().subtitleText}>{configSubtitle()}</span>
            </Show>
            <Show when={toolNames().length > 0}>
              <span class={s().subtitleBadge}>
                {toolNames().length} tool{toolNames().length === 1 ? '' : 's'}
              </span>
            </Show>
            <Show when={systemPrompts().length > 0}>
              <span class={s().subtitleBadge}>
                {systemPrompts().length} system prompt
                {systemPrompts().length === 1 ? '' : 's'}
              </span>
            </Show>
            <Show when={hasModelOptions()}>
              <span class={s().subtitleBadge}>options</span>
            </Show>
            <Show when={middlewareTransformCount() > 0}>
              <span class={s().subtitleBadgeWarn}>
                {middlewareTransformCount()} middleware transform
                {middlewareTransformCount() === 1 ? '' : 's'}
              </span>
            </Show>
            <Show when={hasExpandableConfig()}>
              <span
                class={s().subtitleExpandToggle}
                onClick={(e) => {
                  e.stopPropagation()
                  setConfigExpanded(!configExpanded())
                }}
              >
                {configExpanded() ? 'hide config' : 'show config'}
              </span>
            </Show>
          </div>
        </div>
        <div class={s().cardHeaderBadges}>
          <Show when={iters().length > 0}>
            <span
              class={`${s().badge} ${s().badgeDuration}`}
              title={`${iters().length} ${iters().length === 1 ? 'iteration' : 'iterations'}`}
            >
              🔄 {iters().length}
            </span>
          </Show>
          <Show when={totalToolCalls() > 0}>
            <span
              class={`${s().badge} ${s().badgeFinishReasonToolCalls}`}
              title={`${totalToolCalls()} tool ${totalToolCalls() === 1 ? 'call' : 'calls'}`}
            >
              🔧 {totalToolCalls()}
            </span>
          </Show>
          <Show when={totalDuration()}>
            <span
              class={`${s().badge} ${s().badgeDuration}`}
              title={formatDuration(totalDuration())}
            >
              ⏱️ {formatDuration(totalDuration())}
            </span>
          </Show>
          <Show when={totalUsage()}>
            {(usage) => (
              <span
                class={`${s().badge} ${s().badgeUsage}`}
                title={`Prompt: ${usage().promptTokens.toLocaleString()} | Completion: ${usage().completionTokens.toLocaleString()}`}
              >
                🎯 {usage().totalTokens.toLocaleString()}
              </span>
            )}
          </Show>
          <Show when={isActive()}>
            <span class={`${s().badge} ${s().badgeDuration}`}>⟳ streaming</span>
          </Show>
        </div>
        <span class={`${s().chevron} ${isOpen() ? s().chevronOpen : ''}`}>
          {'\u25B6'}
        </span>
      </div>

      {/* Expandable config details — sits between header and iterations */}
      <div
        class={`${s().configPanelWrapper} ${configExpanded() ? s().configPanelWrapperOpen : ''}`}
      >
        <div class={s().configPanel}>
          <div>
            <Show when={toolNames().length > 0}>
              <div class={s().configPanelSection}>
                <span class={s().configPanelLabel}>Tools</span>
                <div class={s().configToolsList}>
                  <For each={toolNames()}>
                    {(name) => (
                      <span class={s().configToolChip}>
                        {name}
                        <span class={s().configToolChipCount}>
                          {toolInvocationCounts().get(name) || 0}
                        </span>
                      </span>
                    )}
                  </For>
                </div>
              </div>
            </Show>
            <Show when={systemPrompts().length > 0}>
              <div class={s().configPanelSection}>
                <span class={s().configPanelLabel}>
                  System Prompts ({systemPrompts().length})
                </span>
                <For each={systemPrompts()}>
                  {(prompt, i) => (
                    <SystemPromptItem prompt={prompt} index={i()} />
                  )}
                </For>
              </div>
            </Show>
            <Show when={hasModelOptions()}>
              <div class={s().configPanelSection}>
                <span class={s().configPanelLabel}>Model Options</span>
                <div class={s().configJsonTreeContainer}>
                  <JsonTree
                    value={modelOptions()}
                    defaultExpansionDepth={2}
                    copyable
                  />
                </div>
              </div>
            </Show>
          </div>
        </div>
      </div>

      {/* Iterations list — full width */}
      <div class={`${s().cardBody} ${isOpen() ? s().cardBodyOpen : ''}`}>
        <div class={s().cardBodyInner}>
          <div class={s().iterList}>
            <For each={iters()}>
              {(iteration, index) => (
                <IterationCard
                  iteration={iteration}
                  previousIteration={
                    index() > 0 ? iters()[index() - 1] : undefined
                  }
                  messages={props.allMessages}
                  index={index()}
                  isLast={index() === iters().length - 1}
                  hoverTarget={props.hoverTarget}
                  onHoverTarget={props.onHoverTarget}
                />
              )}
            </For>
            <For each={group().agents}>
              {(agentGroup) => (
                <SubagentStepsCard
                  group={agentGroup}
                  hoverTarget={props.hoverTarget}
                  onHoverTarget={props.onHoverTarget}
                />
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}

/** The steps of one child agent, drawn with the same cards as the root. */
export const SubagentStepsCard: Component<{
  group?: AgentStepGroup
  /** Build the steps from the snapshot when no group is given. */
  agent?: SubagentInfo
  hoverTarget: HoverTarget | null
  onHoverTarget?: (target: HoverTarget | null) => void
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [isOpen, setIsOpen] = createSignal(true)

  const group = createMemo((): AgentStepGroup | undefined => {
    if (props.group) return props.group
    if (!props.agent) return undefined
    return {
      agent: props.agent,
      ...buildSubagentSteps(props.agent),
      source: 'snapshot',
    }
  })
  const agent = () => group()?.agent
  const iterations = () => group()?.iterations ?? []

  const accentClass = () => {
    const status = agent()?.status
    if (status === 'running') return s().cardActive
    if (status === 'error') return s().cardError
    if (status === 'finished') return s().cardCompleted
    return ''
  }

  return (
    <Show when={agent()}>
      {(current) => (
        <div
          class={`${s().card} ${accentClass()}`}
          style={{ 'margin-top': '8px' }}
          data-testid="ai-devtools-subagent-steps"
          data-agent={current().path}
          data-source={group()?.source}
        >
          <div
            class={s().cardHeader}
            role="button"
            tabIndex={0}
            aria-expanded={isOpen()}
            onClick={() => setIsOpen(!isOpen())}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return
              event.preventDefault()
              setIsOpen(!isOpen())
            }}
          >
            <div class={s().userBubble}>
              {current().name.charAt(0).toUpperCase()}
            </div>
            <div class={s().cardHeaderContent}>
              <span class={s().cardHeaderLabel}>{current().path}</span>
              <div class={s().cardSubtitle}>
                <span class={s().subtitleText}>subagent</span>
                <Show when={current().status}>
                  <span class={s().subtitleBadge}>{current().status}</span>
                </Show>
                <Show when={current().error}>
                  <span class={s().subtitleBadgeWarn}>{current().error}</span>
                </Show>
              </div>
            </div>
            <div class={s().cardHeaderBadges}>
              <span
                class={`${s().badge} ${s().badgeDuration}`}
                title={`${iterations().length} ${iterations().length === 1 ? 'iteration' : 'iterations'}`}
              >
                🔄 {iterations().length}
              </span>
            </div>
            <span class={`${s().chevron} ${isOpen() ? s().chevronOpen : ''}`}>
              {'▶'}
            </span>
          </div>
          <div class={`${s().cardBody} ${isOpen() ? s().cardBodyOpen : ''}`}>
            <div class={s().cardBodyInner}>
              <div class={s().iterList}>
                <For each={iterations()}>
                  {(iteration, index) => (
                    <IterationCard
                      iteration={iteration}
                      previousIteration={
                        index() > 0 ? iterations()[index() - 1] : undefined
                      }
                      messages={group()?.messages ?? []}
                      index={index()}
                      isLast={index() === iterations().length - 1}
                      hoverTarget={props.hoverTarget}
                      onHoverTarget={props.onHoverTarget}
                    />
                  )}
                </For>
              </div>
            </div>
          </div>
        </div>
      )}
    </Show>
  )
}
