import type { WatcherResult, WatcherSubscription } from './types'
import type { ServerReportState } from './report-storage'
import { markWatcherFired } from './report-storage'

/**
 * Creates read-only bindings for watcher condition evaluation.
 * Same as dataSource - only data fetching, no effects.
 */
async function createConditionBindings() {
  const { createHandlerBindings } = await import('./create-handler-bindings')
  const handlerBindings = createHandlerBindings()

  return {
    external_get_balances: handlerBindings.external_get_balances,
    external_get_transactions: handlerBindings.external_get_transactions,
  }
}

/**
 * Creates bindings for watcher action execution.
 * Includes effect bindings like toast.
 */
async function createActionBindings(
  onEffect: (effect: { type: string; params: Record<string, unknown> }) => void,
) {
  const { createHandlerBindings } = await import('./create-handler-bindings')
  const handlerBindings = createHandlerBindings({
    report: { id: '', title: '', createdAt: 0, updatedAt: 0 },
    onEffect: onEffect as any,
    onUIUpdate: () => {},
  })

  return {
    external_get_balances: handlerBindings.external_get_balances,
    external_get_transactions: handlerBindings.external_get_transactions,
    external_ui_toast: handlerBindings.external_ui_toast,
  }
}

/**
 * Evaluate a single watcher's condition and execute its action if true.
 */
export async function evaluateWatcher(
  reportState: ServerReportState,
  watcher: WatcherSubscription,
  collectedEffects: Array<{ type: string; params: Record<string, unknown> }>,
): Promise<WatcherResult> {
  const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
  const driver = await createIsolateDriver('node')

  // First, evaluate the condition
  const conditionContext = await driver.createContext({
    bindings: await createConditionBindings(),
    timeout: 3000,
    memoryLimit: 32,
  })

  let conditionMet = false
  try {
    const conditionCode = `(async () => { ${watcher.condition} })()`
    const conditionResult = await conditionContext.execute(conditionCode)

    if (!conditionResult.success) {
      return {
        watcherId: watcher.id,
        conditionMet: false,
        actionExecuted: false,
        error: `Condition error: ${conditionResult.error?.message}`,
      }
    }

    conditionMet = Boolean(conditionResult.value)
  } catch (error) {
    return {
      watcherId: watcher.id,
      conditionMet: false,
      actionExecuted: false,
      error: `Condition error: ${error instanceof Error ? error.message : String(error)}`,
    }
  } finally {
    await conditionContext.dispose()
  }

  // If condition not met, we're done
  if (!conditionMet) {
    return {
      watcherId: watcher.id,
      conditionMet: false,
      actionExecuted: false,
    }
  }

  // Execute the action
  const actionContext = await driver.createContext({
    bindings: await createActionBindings((effect) =>
      collectedEffects.push(effect),
    ),
    timeout: 5000,
    memoryLimit: 64,
  })

  try {
    const actionCode = `(async () => { ${watcher.action} })()`
    const actionResult = await actionContext.execute(actionCode)

    // Mark watcher as fired
    markWatcherFired(reportState.report.id, watcher.id)

    if (!actionResult.success) {
      return {
        watcherId: watcher.id,
        conditionMet: true,
        actionExecuted: false,
        error: `Action error: ${actionResult.error?.message}`,
      }
    }

    return {
      watcherId: watcher.id,
      conditionMet: true,
      actionExecuted: true,
    }
  } catch (error) {
    return {
      watcherId: watcher.id,
      conditionMet: true,
      actionExecuted: false,
      error: `Action error: ${error instanceof Error ? error.message : String(error)}`,
    }
  } finally {
    await actionContext.dispose()
  }
}

/**
 * Evaluate all watchers for the given invalidated signals.
 * Returns results and collected effects.
 */
export async function evaluateWatchersForSignals(
  reportState: ServerReportState,
  invalidatedSignals: Set<string>,
): Promise<{
  results: WatcherResult[]
  effects: Array<{ type: string; params: Record<string, unknown> }>
}> {
  const results: WatcherResult[] = []
  const effects: Array<{ type: string; params: Record<string, unknown> }> = []

  // Collect watchers that monitor any of the invalidated signals
  const watchersToEvaluate = new Set<WatcherSubscription>()
  for (const signal of invalidatedSignals) {
    for (const watcher of reportState.watchers.values()) {
      if (watcher.signals.includes(signal) && !watcher.fired) {
        watchersToEvaluate.add(watcher)
      }
    }
  }

  // Evaluate each watcher
  for (const watcher of watchersToEvaluate) {
    const result = await evaluateWatcher(reportState, watcher, effects)
    results.push(result)
  }

  return { results, effects }
}
