import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { WorkflowClient } from '@tanstack/ai-client'
import type {
  WorkflowClientState,
  WorkflowConnectionAdapter,
} from '@tanstack/ai-client'

export interface UseWorkflowOptions {
  /** Connection adapter (e.g. `fetchWorkflowEvents('/api/workflow')`). */
  connection: WorkflowConnectionAdapter
  /** Optional: arbitrary extra body fields to send with every request. */
  body?: Record<string, unknown>
  /** Stable identifier for this hook instance. Auto-generated if omitted. */
  id?: string
  onCustomEvent?: (name: string, value: Record<string, unknown>) => void
  onStateChange?: (state: WorkflowClientState) => void
}

export interface UseWorkflowReturn<
  TInput = unknown,
  TOutput = unknown,
  TState = unknown,
> extends WorkflowClientState<TState, TOutput> {
  approve: (approved: boolean, feedback?: string) => Promise<void>
  start: (input: TInput) => Promise<void>
  stop: () => void
}

export function useWorkflow<
  TInput = unknown,
  TOutput = unknown,
  TState = unknown,
>(opts: UseWorkflowOptions): UseWorkflowReturn<TInput, TOutput, TState> {
  const hookId = useId()
  const clientId = opts.id ?? hookId

  // Track latest options so callbacks read fresh values without recreating
  // the client. Mirrors useChat's pattern.
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Create the client once per hook instance. The connection adapter is
  // captured at construction; passing a new `fetchWorkflowEvents(...)`
  // result on every render does NOT recreate the client (which would
  // orphan in-flight streams). For dynamic URLs/headers, the adapter
  // accepts function-typed options.
  const client = useMemo(
    () =>
      new WorkflowClient<TInput, TOutput, TState>({
        connection: optsRef.current.connection,
        body: optsRef.current.body,
        onCustomEvent: (name, value) =>
          optsRef.current.onCustomEvent?.(name, value),
        onStateChange: (state) => optsRef.current.onStateChange?.(state),
      }),
    [clientId],
  )

  const [state, setState] = useState(client.state)

  useEffect(() => {
    return client.subscribe(setState)
  }, [client])

  const approve = useCallback(
    (approved: boolean, feedback?: string) =>
      client.approve(approved, feedback),
    [client],
  )
  const start = useCallback((input: TInput) => client.start(input), [client])
  const stop = useCallback(() => {
    client.stop()
  }, [client])

  return { ...state, approve, start, stop }
}

/** Alias — same hook, different vocabulary. Orchestrators are workflows. */
export const useOrchestration = useWorkflow
