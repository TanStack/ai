import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  onCustomEvent?: (name: string, value: Record<string, unknown>) => void
  onStateChange?: (state: WorkflowClientState) => void
}

export interface UseWorkflowReturn<
  TInput = unknown,
  TOutput = unknown,
  TState = unknown,
> extends WorkflowClientState<TState, TOutput> {
  approve: (approved: boolean) => Promise<void>
  start: (input: TInput) => Promise<void>
  stop: () => void
}

export function useWorkflow<
  TInput = unknown,
  TOutput = unknown,
  TState = unknown,
>(opts: UseWorkflowOptions): UseWorkflowReturn<TInput, TOutput, TState> {
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Re-create the client only when the stable connection identity changes.
  const connectionKey = opts.connection

  const client = useMemo(
    () => new WorkflowClient<TInput, TOutput, TState>(optsRef.current),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [connectionKey],
  )

  const [state, setState] = useState(client.state)

  useEffect(() => {
    return client.subscribe(setState)
  }, [client])

  const approve = useCallback(
    (approved: boolean) => client.approve(approved),
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
