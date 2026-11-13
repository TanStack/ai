/** Chat streams can emit RUN_FINISHED before the agent loop actually ends. */
const completionSignals = new WeakMap<object, () => boolean | undefined>()

/** Publish final-run state before terminal hooks and cleanup can fail. */
export function publishRunCompletionSignal(
  stream: object,
  completed: () => boolean | undefined,
): void {
  completionSignals.set(stream, completed)
}

/** Undefined preserves terminal-event handling for user-provided iterables. */
export function wasRunCompleted(stream: object): boolean | undefined {
  return completionSignals.get(stream)?.()
}
