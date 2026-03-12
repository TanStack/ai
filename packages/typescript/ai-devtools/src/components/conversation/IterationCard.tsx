import {
  For,
  Index,
  Match,
  Show,
  Switch,
  createMemo,
  createSignal,
} from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import { useStyles } from '../../styles/use-styles'
import { formatDuration } from '../utils'
import { SystemPromptItem } from './IterationTimeline'
import type {
  Iteration,
  Message,
  MiddlewareEvent,
  ToolCall,
} from '../../store/ai-store'
import type { Component } from 'solid-js'

interface IterationCardProps {
  iteration: Iteration
  previousIteration?: Iteration
  messages: Array<Message>
  index: number
  isLast: boolean
}

// --- Step types ---

type IterationStep =
  | { kind: 'middleware'; event: MiddlewareEvent }
  | { kind: 'thinking'; message: Message }
  | { kind: 'assistant'; message: Message }
  | { kind: 'tool_call'; toolCall: ToolCall; message: Message }
  | { kind: 'tool_result'; message: Message }

// --- Helpers ---

function getIterationLabel(iter: Iteration, displayIndex: number): string {
  if (!iter.completedAt) return `Iteration ${displayIndex} — Generating...`
  if (iter.finishReason === 'error') return `Iteration ${displayIndex} — Error`
  return `Iteration ${displayIndex}`
}

/**
 * Build steps in insertion order — no timestamp sorting.
 * Events are emitted in order by the server, so we respect that order.
 */
function buildSteps(
  iter: Iteration,
  allMessages: Array<Message>,
): Array<IterationStep> {
  const steps: Array<IterationStep> = []

  // 1. Middleware events come first (they happen before/during generation)
  for (const event of iter.middlewareEvents) {
    steps.push({ kind: 'middleware', event })
  }

  // 2. Messages in their natural order from the store
  const iterMessages = allMessages.filter(
    (m) => iter.messageIds.includes(m.id) && m.role !== 'user',
  )

  for (const msg of iterMessages) {
    if (msg.role === 'assistant') {
      // Show thinking/reasoning as its own step before text content
      if (msg.thinkingContent) {
        steps.push({ kind: 'thinking', message: msg })
      }
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const tc of msg.toolCalls) {
          steps.push({ kind: 'tool_call', toolCall: tc, message: msg })
        }
      }
      if (msg.content) {
        steps.push({ kind: 'assistant', message: msg })
      }
    } else if (msg.role === 'tool') {
      steps.push({ kind: 'tool_result', message: msg })
    }
  }

  return steps
}

function truncate(str: string, max: number): string {
  if (str.length <= max) return str
  return str.slice(0, max) + '...'
}

function tryParseJson(str: string): unknown | null {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

// --- Step renderers ---

const MiddlewareStep: Component<{
  step: Extract<IterationStep, { kind: 'middleware' }>
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [expanded, setExpanded] = createSignal(false)
  const ev = () => props.step.event

  const badgeClass = () => {
    if (ev().wasDropped) return s().mwBadgeError
    if (ev().hasTransform) return s().mwBadgeTransform
    return s().mwBadgeDefault
  }

  const suffix = () => {
    if (ev().wasDropped) return 'DROP'
    if (ev().hookName === 'onChunk' && ev().hasTransform) return 'TRANSFORM'
    if (ev().hookName === 'onConfig' && ev().hasTransform) return 'TRANSFORM'
    if (ev().hookName === 'onBeforeToolCall' && ev().hasTransform)
      return 'DECISION'
    return null
  }

  const hasChanges = () =>
    ev().configChanges && Object.keys(ev().configChanges!).length > 0

  return (
    <>
      <div class={s().step}>
        <span class={`${s().stepPrefix} ${s().stepPrefixMiddleware}`}>
          Middleware
        </span>
        <span class={`${s().mwBadge} ${badgeClass()}`}>
          {ev().middlewareName}
        </span>
        <span class={s().mwHook}>{ev().hookName}</span>
        <Show when={ev().duration !== undefined}>
          <span class={s().stepDuration}>{ev().duration}ms</span>
        </Show>
        <Show when={suffix()}>
          <span class={s().mwSuffix}>{suffix()}</span>
        </Show>
        <Show when={hasChanges()}>
          <span
            class={s().stepExpandToggle}
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? 'hide changes' : 'show changes'}
          </span>
        </Show>
      </div>
      <Show when={expanded() && hasChanges()}>
        <div class={s().mwChangesContainer}>
          <JsonTree
            value={ev().configChanges as Record<string, unknown>}
            defaultExpansionDepth={2}
            copyable
          />
        </div>
      </Show>
    </>
  )
}

const ThinkingStep: Component<{
  step: Extract<IterationStep, { kind: 'thinking' }>
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [expanded, setExpanded] = createSignal(false)
  const msg = () => props.step.message

  const thinkingText = () => msg().thinkingContent || ''
  const preview = () => truncate(thinkingText(), 150)

  return (
    <>
      <div class={s().step}>
        <span class={`${s().stepPrefix} ${s().stepPrefixThinking}`}>
          Thinking
        </span>
        <span class={s().stepContent}>{preview() || '(empty)'}</span>
        <Show when={thinkingText().length > 150}>
          <span
            class={s().stepExpandToggle}
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? 'hide' : 'show full'}
          </span>
        </Show>
      </div>
      <Show when={expanded()}>
        <div class={s().thinkingDetail}>{thinkingText()}</div>
      </Show>
    </>
  )
}

const AssistantStep: Component<{
  step: Extract<IterationStep, { kind: 'assistant' }>
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [expanded, setExpanded] = createSignal(false)
  const msg = () => props.step.message

  const contentLength = () => (msg().content || '').length
  const isLong = () => contentLength() > 200

  const preview = () => {
    const text = msg().content || ''
    if (text.length <= 200) return text
    return truncate(text, 200)
  }

  return (
    <>
      <div class={`${s().step} ${isLong() ? s().stepResponseLong : ''}`}>
        <span class={`${s().stepPrefix} ${s().stepPrefixAssistant}`}>
          Response
        </span>
        <span class={isLong() ? s().stepContentLong : s().stepContent}>
          {preview() || '(empty)'}
        </span>
        <Show when={contentLength() > 200}>
          <span
            class={s().stepExpandToggle}
            onClick={() => setExpanded(!expanded())}
          >
            {expanded() ? 'hide' : 'show full'}
          </span>
        </Show>
      </div>
      <Show when={expanded()}>
        <div class={s().responseDetail}>{msg().content}</div>
      </Show>
    </>
  )
}

const ToolCallStep: Component<{
  step: Extract<IterationStep, { kind: 'tool_call' }>
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [argsOpen, setArgsOpen] = createSignal(false)
  const [resultOpen, setResultOpen] = createSignal(false)
  const tc = () => props.step.toolCall

  const parsedArgs = () => {
    const raw = tc().arguments || '{}'
    return tryParseJson(raw) || raw
  }

  const hasResult = () => tc().result !== undefined

  const parsedResult = () => {
    if (!hasResult()) return null
    if (typeof tc().result === 'string') {
      return tryParseJson(tc().result as string) || tc().result
    }
    return tc().result
  }

  return (
    <>
      <div
        class={s().step}
        onClick={() => setArgsOpen(!argsOpen())}
        style={{ cursor: 'pointer' }}
      >
        <span class={`${s().stepPrefix} ${s().stepPrefixToolCall}`}>
          Tool Call
        </span>
        <span class={`${s().mwBadge} ${s().mwBadgeToolCall}`}>{tc().name}</span>
        <Show when={tc().duration !== undefined}>
          <span class={s().stepDuration}>{tc().duration}ms</span>
        </Show>
        <span class={`${s().chevron} ${argsOpen() ? s().chevronOpen : ''}`}>
          {'\u25B6'}
        </span>
      </div>
      <div class={`${s().cardBody} ${argsOpen() ? s().cardBodyOpen : ''}`}>
        <div class={s().cardBodyInner}>
          <div class={s().stepJsonPanel}>
            <JsonTree
              value={parsedArgs() as Record<string, unknown>}
              defaultExpansionDepth={0}
              copyable
            />
          </div>
        </div>
      </div>
      <Show when={hasResult()}>
        <div
          class={s().step}
          onClick={() => setResultOpen(!resultOpen())}
          style={{ cursor: 'pointer' }}
        >
          <span class={`${s().stepPrefix} ${s().stepPrefixToolResult}`}>
            Result
          </span>
          <span class={`${s().mwBadge} ${s().mwBadgeToolResult}`}>
            {tc().name}
          </span>
          <Show when={tc().duration !== undefined}>
            <span class={s().stepDuration}>{tc().duration}ms</span>
          </Show>
          <span class={`${s().chevron} ${resultOpen() ? s().chevronOpen : ''}`}>
            {'\u25B6'}
          </span>
        </div>
        <div class={`${s().cardBody} ${resultOpen() ? s().cardBodyOpen : ''}`}>
          <div class={s().cardBodyInner}>
            <div class={s().stepJsonPanel}>
              <JsonTree
                value={parsedResult() as Record<string, unknown>}
                defaultExpansionDepth={0}
                copyable
              />
            </div>
          </div>
        </div>
      </Show>
    </>
  )
}

const ToolResultStep: Component<{
  step: Extract<IterationStep, { kind: 'tool_result' }>
}> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [isOpen, setIsOpen] = createSignal(false)
  const msg = () => props.step.message

  const parsedContent = () => {
    const text = msg().content || ''
    return tryParseJson(text) || text
  }

  return (
    <>
      <div
        class={s().step}
        onClick={() => setIsOpen(!isOpen())}
        style={{ cursor: 'pointer' }}
      >
        <span class={`${s().stepPrefix} ${s().stepPrefixToolResult}`}>
          Result
        </span>
        <span class={`${s().chevron} ${isOpen() ? s().chevronOpen : ''}`}>
          {'\u25B6'}
        </span>
      </div>
      <div class={`${s().cardBody} ${isOpen() ? s().cardBodyOpen : ''}`}>
        <div class={s().cardBodyInner}>
          <div class={s().stepJsonPanel}>
            <JsonTree
              value={parsedContent() as Record<string, unknown>}
              defaultExpansionDepth={0}
              copyable
            />
          </div>
        </div>
      </div>
    </>
  )
}

// --- Main component ---

export const IterationCard: Component<IterationCardProps> = (props) => {
  const styles = useStyles()
  const s = () => styles().iterationTimeline
  const [isOpen, setIsOpen] = createSignal(props.isLast)
  const [configExpanded, setConfigExpanded] = createSignal(false)

  const iter = () => props.iteration
  const isActive = () => !iter().completedAt
  const isCompleted = () =>
    !!iter().completedAt && iter().finishReason !== 'error'
  const isError = () => iter().finishReason === 'error'

  const duration = () => {
    if (!iter().completedAt) return undefined
    return iter().completedAt! - iter().startedAt
  }

  const label = () => getIterationLabel(iter(), props.index)
  const steps = createMemo(() => buildSteps(iter(), props.messages))

  /**
   * Compute delta usage for display.
   * The store holds cumulative usage per iteration (as reported by the provider).
   * If a previous iteration exists on the same request, subtract its cumulative
   * to get this iteration's incremental usage.
   */
  const deltaUsage = createMemo(() => {
    const usage = iter().usage
    if (!usage) return undefined
    const prev = props.previousIteration
    if (!prev?.usage) return usage
    // Only subtract if same request (cumulative values are per-request)
    if (prev.requestId !== iter().requestId) return usage
    return {
      promptTokens: Math.max(0, usage.promptTokens - prev.usage.promptTokens),
      completionTokens: Math.max(
        0,
        usage.completionTokens - prev.usage.completionTokens,
      ),
      totalTokens: Math.max(0, usage.totalTokens - prev.usage.totalTokens),
    }
  })

  const finishLabel = () => {
    if (!iter().finishReason) return null
    switch (iter().finishReason) {
      case 'stop':
        return 'completed'
      case 'tool_calls':
        return 'tool calls'
      case 'error':
        return 'error'
      case 'length':
        return 'max length'
      default:
        return iter().finishReason
    }
  }

  const headerAccent = () => {
    if (isActive()) return s().iterHeaderActive
    if (isError()) return s().iterHeaderError
    if (isCompleted()) return s().iterHeaderCompleted
    return ''
  }

  // Config data from this iteration
  const configSubtitle = () => {
    const parts: Array<string> = []
    if (iter().model) parts.push(iter().model!)
    if (iter().provider) parts.push(iter().provider!)
    return parts.length > 0 ? parts.join(' \u00B7 ') : null
  }

  const toolNames = () => iter().toolNames || []
  const systemPrompts = () => iter().systemPrompts || []

  /** Count actual tool invocations in this iteration's messages */
  const toolInvocationCounts = createMemo(() => {
    const counts = new Map<string, number>()
    const msgIds = new Set(iter().messageIds)
    for (const msg of props.messages) {
      if (msgIds.has(msg.id) && msg.toolCalls) {
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
  const modelOptions = () => iter().modelOptions
  const hasModelOptions = () => {
    const opts = modelOptions()
    return opts && Object.keys(opts).length > 0
  }

  const middlewareTransformCount = createMemo(() => {
    let count = 0
    for (const ev of iter().middlewareEvents) {
      if (ev.hasTransform) count++
    }
    return count
  })

  const hasConfigChanged = () => {
    const prev = props.previousIteration
    if (!prev) return false
    return (
      iter().model !== prev.model ||
      iter().provider !== prev.provider ||
      JSON.stringify(iter().toolNames) !== JSON.stringify(prev.toolNames)
    )
  }

  const configDiffs = () => {
    const prev = props.previousIteration
    if (!prev) return []
    const diffs: Array<{ key: string; from: string; to: string }> = []
    if (iter().model !== prev.model) {
      diffs.push({
        key: 'model',
        from: prev.model || '(none)',
        to: iter().model || '(none)',
      })
    }
    if (iter().provider !== prev.provider) {
      diffs.push({
        key: 'provider',
        from: prev.provider || '(none)',
        to: iter().provider || '(none)',
      })
    }
    if (JSON.stringify(iter().toolNames) !== JSON.stringify(prev.toolNames)) {
      diffs.push({
        key: 'tools',
        from: prev.toolNames?.join(', ') || '(none)',
        to: iter().toolNames?.join(', ') || '(none)',
      })
    }
    return diffs
  }

  const hasExpandableConfig = () =>
    toolNames().length > 0 || systemPrompts().length > 0 || hasModelOptions()

  return (
    <div
      class={s().iterCard}
      style={{ 'animation-delay': `${props.index * 60}ms` }}
    >
      {/* Header */}
      <div
        class={`${s().iterCardHeader} ${headerAccent()}`}
        onClick={() => setIsOpen(!isOpen())}
      >
        <div class={s().cardHeaderContent}>
          <span class={s().iterCardTitle}>{label()}</span>
          {/* Config subtitle — same pattern as user message card */}
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
            <Show when={hasConfigChanged()}>
              <span class={s().subtitleBadgeWarn}>config changed</span>
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
          <Show when={finishLabel()}>
            <span
              class={`${s().badge} ${
                iter().finishReason === 'stop'
                  ? s().badgeFinishReasonStop
                  : iter().finishReason === 'tool_calls'
                    ? s().badgeFinishReasonToolCalls
                    : iter().finishReason === 'error'
                      ? s().mwBadgeError
                      : s().badgeDuration
              }`}
            >
              {finishLabel()}
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
          <Show when={duration()}>
            <span
              class={`${s().badge} ${s().badgeDuration}`}
              title={formatDuration(duration())}
            >
              ⏱️ {formatDuration(duration())}
            </span>
          </Show>
          <Show when={deltaUsage()}>
            <span
              class={`${s().badge} ${s().badgeUsage}`}
              title={`Prompt: ${deltaUsage()!.promptTokens.toLocaleString()} | Completion: ${deltaUsage()!.completionTokens.toLocaleString()}`}
            >
              🎯 {deltaUsage()!.totalTokens.toLocaleString()}
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

      {/* Expandable config panel — between header and steps */}
      <div
        class={`${s().configPanelWrapper} ${configExpanded() ? s().configPanelWrapperOpen : ''}`}
      >
        <div class={s().configPanel}>
          <div>
            <Show when={hasConfigChanged()}>
              <div class={s().configPanelSection}>
                <span class={s().configPanelLabel}>Config Changes</span>
                <div class={s().configDiffSection}>
                  <For each={configDiffs()}>
                    {(diff) => (
                      <div class={s().configDiffRow}>
                        <span class={s().configDiffKey}>{diff.key}:</span>
                        <span class={s().configDiffFrom}>{diff.from}</span>
                        <span class={s().configDiffArrow}>{'\u2192'}</span>
                        <span class={s().configDiffTo}>{diff.to}</span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>
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

      {/* Body — step-by-step timeline */}
      <div class={`${s().cardBody} ${isOpen() ? s().cardBodyOpen : ''}`}>
        <div class={s().cardBodyInner}>
          <Index each={steps()}>
            {(step) => (
              <Switch>
                <Match when={step().kind === 'middleware'}>
                  <MiddlewareStep
                    step={
                      step() as Extract<IterationStep, { kind: 'middleware' }>
                    }
                  />
                </Match>
                <Match when={step().kind === 'thinking'}>
                  <ThinkingStep
                    step={
                      step() as Extract<IterationStep, { kind: 'thinking' }>
                    }
                  />
                </Match>
                <Match when={step().kind === 'assistant'}>
                  <AssistantStep
                    step={
                      step() as Extract<IterationStep, { kind: 'assistant' }>
                    }
                  />
                </Match>
                <Match when={step().kind === 'tool_call'}>
                  <ToolCallStep
                    step={
                      step() as Extract<IterationStep, { kind: 'tool_call' }>
                    }
                  />
                </Match>
                <Match when={step().kind === 'tool_result'}>
                  <ToolResultStep
                    step={
                      step() as Extract<IterationStep, { kind: 'tool_result' }>
                    }
                  />
                </Match>
              </Switch>
            )}
          </Index>
        </div>
      </div>
    </div>
  )
}
