import { For, Show, createSignal } from 'solid-js'
import { JsonTree } from '@tanstack/devtools-ui'
import { useStyles } from '../../styles/use-styles'
import { formatDuration } from '../utils'
import type { Component } from 'solid-js'
import type {
  CodeModeIteration,
  CodeModeSession,
  CodeModeToolCall,
} from '../../store/ai-context'

interface CodeModeTabProps {
  sessions: Array<CodeModeSession>
}

/**
 * Component to display a single tool call with input/output
 */
const ToolCallDisplay: Component<{ toolCall: CodeModeToolCall }> = (props) => {
  const styles = useStyles()
  const [isExpanded, setIsExpanded] = createSignal(false)

  return (
    <div class={styles().conversationDetails.cmToolCallItem}>
      <div
        class={styles().conversationDetails.cmToolCallHeader}
        onClick={() => setIsExpanded(!isExpanded())}
        style={{ cursor: 'pointer' }}
      >
        <span class={styles().conversationDetails.cmToolCallName}>
          {isExpanded() ? '[-]' : '[+]'} {props.toolCall.toolName}
        </span>
        <Show when={props.toolCall.error}>
          <span class={styles().conversationDetails.toolCallStateError}>
            error
          </span>
        </Show>
        <Show when={!props.toolCall.error}>
          <span class={styles().conversationDetails.toolCallStateComplete}>
            complete
          </span>
        </Show>
        <span class={styles().conversationDetails.durationBadge}>
          {formatDuration(props.toolCall.duration)}
        </span>
      </div>
      <Show when={isExpanded()}>
        <div class={styles().conversationDetails.toolCallDetails}>
          <div class={styles().conversationDetails.toolCallSection}>
            <div class={styles().conversationDetails.toolCallSectionTitle}>
              Input:
            </div>
            <div class={styles().conversationDetails.jsonContainer}>
              <JsonTree
                value={props.toolCall.input}
                defaultExpansionDepth={2}
              />
            </div>
          </div>
          <Show when={props.toolCall.output !== undefined}>
            <div class={styles().conversationDetails.toolCallSection}>
              <div class={styles().conversationDetails.toolCallSectionTitle}>
                Output:
              </div>
              <div class={styles().conversationDetails.jsonContainer}>
                <JsonTree
                  value={props.toolCall.output}
                  defaultExpansionDepth={2}
                />
              </div>
            </div>
          </Show>
          <Show when={props.toolCall.error}>
            <div class={styles().conversationDetails.toolCallSection}>
              <div class={styles().conversationDetails.toolCallSectionTitle}>
                Error:
              </div>
              <div style={{ color: '#ef4444', 'font-family': 'monospace' }}>
                {props.toolCall.error}
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

/**
 * Component to display a single iteration
 */
const IterationDisplay: Component<{ iteration: CodeModeIteration }> = (
  props,
) => {
  const styles = useStyles()
  const [isCodeExpanded, setIsCodeExpanded] = createSignal(true)
  const [isResponseExpanded, setIsResponseExpanded] = createSignal(false)

  const truncateResponse = (response: string, maxLength: number = 200) => {
    if (response.length <= maxLength) return response
    return response.substring(0, maxLength) + '...'
  }

  return (
    <div class={styles().conversationDetails.iterationCard}>
      <div class={styles().conversationDetails.iterationHeader}>
        <span class={styles().conversationDetails.iterationNumber}>
          Iteration {props.iteration.iterationNumber}
        </span>
        <Show when={props.iteration.executionResult}>
          <span
            class={
              props.iteration.executionResult?.success
                ? styles().conversationDetails.operationStatusCompleted
                : styles().conversationDetails.operationStatusError
            }
          >
            {props.iteration.executionResult?.success ? 'success' : 'error'}
          </span>
        </Show>
      </div>

      {/* LLM Response */}
      <Show when={props.iteration.llmResponse}>
        <div class={styles().conversationDetails.sectionContainer}>
          <div
            class={styles().conversationDetails.sectionHeader}
            onClick={() => setIsResponseExpanded(!isResponseExpanded())}
            style={{ cursor: 'pointer' }}
          >
            {isResponseExpanded() ? '[-]' : '[+]'} LLM Response
          </div>
          <Show when={isResponseExpanded()}>
            <div class={styles().conversationDetails.responseText}>
              {props.iteration.llmResponse}
            </div>
          </Show>
          <Show when={!isResponseExpanded()}>
            <div class={styles().conversationDetails.responsePreview}>
              {truncateResponse(props.iteration.llmResponse || '')}
            </div>
          </Show>
        </div>
      </Show>

      {/* Generated Code */}
      <Show when={props.iteration.extractedCode}>
        <div class={styles().conversationDetails.sectionContainer}>
          <div
            class={styles().conversationDetails.sectionHeader}
            onClick={() => setIsCodeExpanded(!isCodeExpanded())}
            style={{ cursor: 'pointer' }}
          >
            {isCodeExpanded() ? '[-]' : '[+]'} Generated Code
          </div>
          <Show when={isCodeExpanded()}>
            <pre class={styles().conversationDetails.codeBlock}>
              {props.iteration.extractedCode}
            </pre>
          </Show>
        </div>
      </Show>

      {/* Tool Calls */}
      <Show when={props.iteration.toolCalls.length > 0}>
        <div class={styles().conversationDetails.sectionContainer}>
          <div class={styles().conversationDetails.sectionHeader}>
            Tool Calls ({props.iteration.toolCalls.length})
          </div>
          <For each={props.iteration.toolCalls}>
            {(toolCall) => <ToolCallDisplay toolCall={toolCall} />}
          </For>
        </div>
      </Show>

      {/* Execution Result */}
      <Show when={props.iteration.executionResult}>
        <div class={styles().conversationDetails.sectionContainer}>
          <div class={styles().conversationDetails.sectionHeader}>
            Execution Result
          </div>
          <Show when={props.iteration.executionResult?.logs?.length}>
            <div class={styles().conversationDetails.logsContainer}>
              <div class={styles().conversationDetails.logsHeader}>
                Console Output:
              </div>
              <For each={props.iteration.executionResult?.logs ?? []}>
                {(log) => (
                  <div class={styles().conversationDetails.logLine}>{log}</div>
                )}
              </For>
            </div>
          </Show>
          <Show when={props.iteration.executionResult?.value !== undefined}>
            <div class={styles().conversationDetails.resultContainer}>
              <div class={styles().conversationDetails.resultHeader}>
                Return Value:
              </div>
              <div class={styles().conversationDetails.jsonContainer}>
                <JsonTree
                  value={props.iteration.executionResult?.value}
                  defaultExpansionDepth={2}
                />
              </div>
            </div>
          </Show>
          <Show when={props.iteration.executionResult?.error}>
            <div class={styles().conversationDetails.errorContainer}>
              <div class={styles().conversationDetails.errorHeader}>Error:</div>
              <div style={{ color: '#ef4444' }}>
                {typeof props.iteration.executionResult?.error === 'string' ? (
                  props.iteration.executionResult.error
                ) : (
                  <>
                    <strong>
                      {props.iteration.executionResult?.error?.name}:
                    </strong>{' '}
                    {props.iteration.executionResult?.error?.message}
                  </>
                )}
              </div>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

/**
 * Component to display a single Code Mode session
 */
const SessionDisplay: Component<{ session: CodeModeSession }> = (props) => {
  const styles = useStyles()

  return (
    <div class={styles().conversationDetails.codeModeSessionCard}>
      {/* Session Header */}
      <div class={styles().conversationDetails.sessionHeader}>
        <div class={styles().conversationDetails.sessionIcon}>
          {props.session.status === 'running'
            ? '...'
            : props.session.success
              ? '.'
              : '.'}
        </div>
        <div class={styles().conversationDetails.sessionTitle}>Code Mode</div>
        <div
          class={`${styles().conversationDetails.operationStatus} ${
            props.session.status === 'completed'
              ? styles().conversationDetails.operationStatusCompleted
              : props.session.status === 'error'
                ? styles().conversationDetails.operationStatusError
                : styles().conversationDetails.operationStatusPending
          }`}
        >
          {props.session.status}
        </div>
        <Show when={props.session.duration}>
          <div class={styles().conversationDetails.durationBadge}>
            {formatDuration(props.session.duration)}
          </div>
        </Show>
      </div>

      {/* Task */}
      <div class={styles().conversationDetails.taskContainer}>
        <div class={styles().conversationDetails.taskLabel}>Task:</div>
        <div class={styles().conversationDetails.taskText}>
          {props.session.task}
        </div>
      </div>

      {/* Session Info */}
      <div class={styles().conversationDetails.sessionInfo}>
        <div class={styles().conversationDetails.cmInfoItem}>
          <span class={styles().conversationDetails.cmInfoLabel}>Model:</span>
          <span class={styles().conversationDetails.cmInfoValue}>
            {props.session.model}
          </span>
        </div>
        <div class={styles().conversationDetails.cmInfoItem}>
          <span class={styles().conversationDetails.cmInfoLabel}>Tools:</span>
          <span class={styles().conversationDetails.cmInfoValue}>
            {(props.session.toolNames ?? []).join(', ')}
          </span>
        </div>
        <div class={styles().conversationDetails.cmInfoItem}>
          <span class={styles().conversationDetails.cmInfoLabel}>
            Iterations:
          </span>
          <span class={styles().conversationDetails.cmInfoValue}>
            {props.session.iterations.length}
            {props.session.maxIterations
              ? ` / ${props.session.maxIterations}`
              : ''}
          </span>
        </div>
      </div>

      {/* Iterations */}
      <div class={styles().conversationDetails.iterationsContainer}>
        <For each={props.session.iterations}>
          {(iteration) => <IterationDisplay iteration={iteration} />}
        </For>
      </div>

      {/* Final Result */}
      <Show when={props.session.status !== 'running'}>
        <div class={styles().conversationDetails.finalResultContainer}>
          <div class={styles().conversationDetails.finalResultHeader}>
            {props.session.success ? 'Final Result' : 'Failed'}
          </div>
          <Show
            when={
              props.session.success && props.session.finalValue !== undefined
            }
          >
            <div class={styles().conversationDetails.jsonContainer}>
              <JsonTree
                value={props.session.finalValue}
                defaultExpansionDepth={2}
              />
            </div>
          </Show>
          <Show when={props.session.error}>
            <div style={{ color: '#ef4444' }}>
              {typeof props.session.error === 'string' ? (
                props.session.error
              ) : (
                <>
                  <strong>{props.session.error?.name}:</strong>{' '}
                  {props.session.error?.message}
                </>
              )}
            </div>
          </Show>
        </div>
      </Show>
    </div>
  )
}

export const CodeModeTab: Component<CodeModeTabProps> = (props) => {
  const styles = useStyles()

  return (
    <Show
      when={props.sessions.length > 0}
      fallback={
        <div class={styles().conversationDetails.emptyMessages}>
          No Code Mode sessions yet
        </div>
      }
    >
      <div class={styles().conversationDetails.messagesList}>
        <For each={props.sessions}>
          {(session) => <SessionDisplay session={session} />}
        </For>
      </div>
    </Show>
  )
}
