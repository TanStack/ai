import { For, Index, Show, createMemo, createSignal } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import { useStyles } from '../../styles/use-styles'
import { formatDuration } from '../utils'
import { IterationCard } from './IterationCard'
import type { Iteration, Message } from '../../store/ai-store'
import type { Component } from 'solid-js'

/** A group of iterations triggered by a single user message */
interface UserMessageGroup {
  userMessage: Message | null
  iterations: Array<Iteration>
}

interface IterationTimelineProps {
  iterations: Array<Iteration>
  messages: Array<Message>
}

export const IterationTimeline: Component<IterationTimelineProps> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline

  /**
   * Group iterations by user messages.
   * Memoized to avoid recomputing on unrelated store changes.
   */
  const groups = createMemo((): Array<UserMessageGroup> => {
    const userMessages = props.messages.filter((m) => m.role === 'user')
    const iters = props.iterations

    if (userMessages.length === 0) {
      return iters.length > 0 ? [{ userMessage: null, iterations: iters }] : []
    }

    const result: Array<UserMessageGroup> = []

    const sortedUsers = [...userMessages].sort(
      (a, b) => a.timestamp - b.timestamp,
    )

    for (let u = 0; u < sortedUsers.length; u++) {
      const currentUser = sortedUsers[u]!
      const nextUser = sortedUsers[u + 1]

      const groupIters = iters.filter((it) => {
        if (it.startedAt < currentUser.timestamp) return false
        if (nextUser && it.startedAt >= nextUser.timestamp) return false
        return true
      })

      if (groupIters.length > 0) {
        result.push({ userMessage: currentUser, iterations: groupIters })
      }
    }

    // Catch any iterations before the first user message
    if (sortedUsers[0]) {
      const earlyIters = iters.filter(
        (it) => it.startedAt < sortedUsers[0]!.timestamp,
      )
      if (earlyIters.length > 0) {
        result.unshift({ userMessage: null, iterations: earlyIters })
      }
    }

    return result
  })

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
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [isOpen, setIsOpen] = createSignal(true)
  const [configExpanded, setConfigExpanded] = createSignal(false)

  const group = () => props.group
  const userMsg = () => group().userMessage
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

  /**
   * Total usage across this group.
   * Iterations store CUMULATIVE usage per request, so we take the MAX
   * cumulative from each request group (the last iteration's value
   * represents the total for that request).
   */
  const totalUsage = createMemo(() => {
    const maxByRequest = new Map<
      string,
      { prompt: number; completion: number }
    >()
    for (const it of iters()) {
      if (!it.usage) continue
      const key = it.requestId || '__default__'
      const existing = maxByRequest.get(key)
      if (
        !existing ||
        it.usage.totalTokens > existing.prompt + existing.completion
      ) {
        maxByRequest.set(key, {
          prompt: it.usage.promptTokens,
          completion: it.usage.completionTokens,
        })
      }
    }
    let prompt = 0
    let completion = 0
    for (const v of maxByRequest.values()) {
      prompt += v.prompt
      completion += v.completion
    }
    if (prompt + completion === 0) return undefined
    return {
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: prompt + completion,
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
    <div class={`${s().card} ${groupAccentClass()}`}>
      {/* User message header */}
      <div class={s().cardHeader} onClick={() => setIsOpen(!isOpen())}>
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
            <span
              class={`${s().badge} ${s().badgeUsage}`}
              title={`Prompt: ${totalUsage()!.promptTokens.toLocaleString()} | Completion: ${totalUsage()!.completionTokens.toLocaleString()}`}
            >
              🎯 {totalUsage()!.totalTokens.toLocaleString()}
            </span>
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
                    value={modelOptions() as Record<string, unknown>}
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
                />
              )}
            </For>
          </div>
        </div>
      </div>
    </div>
  )
}
