import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { WorkflowClient } from '@tanstack/ai-client'
import type {
  WorkflowClientOptions,
  WorkflowClientState,
} from '@tanstack/ai-client'

export interface UseWorkflowOptions extends WorkflowClientOptions {}

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

  const client = useMemo(
    () =>
      new WorkflowClient<TInput, TOutput, TState>({
        body: optsRef.current.body,
        connection: optsRef.current.connection,
        onCustomEvent: (name, value) =>
          optsRef.current.onCustomEvent?.(name, value),
      }),
    [opts.connection],
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
