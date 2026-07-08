import type { RefreshResult, UINode } from './types'
import type { ServerReportState } from './report-storage'

/**
 * Find a component by ID in the report's node tree.
 */
function findComponent(
  state: ServerReportState,
  componentId: string,
): UINode | null {
  return state.nodes.get(componentId) ?? null
}

/**
 * Creates read-only bindings for dataSource execution.
 * Only data fetching bindings - no effects or writes.
 * Includes a special __setResult binding to capture the return value.
 */
async function createDataSourceBindings(onResult: (value: unknown) => void) {
  // Import the mock data functions from handler bindings
  const { createHandlerBindings } = await import('./create-handler-bindings')
  const handlerBindings = createHandlerBindings()

  // Only include read-only bindings plus result capture
  return {
    external_get_balances: handlerBindings.external_get_balances,
    external_get_transactions: handlerBindings.external_get_transactions,
    // Special binding to capture the return value since isolate doesn't return async values
    __setResult: {
      name: '__setResult',
      description: 'Internal: capture dataSource result',
      inputSchema: {}, // Accept any input
      execute: async (value: unknown) => {
        console.log('[__setResult] Called with:', value)
        onResult(value)
        return { success: true }
      },
    },
    // DO NOT include: external_transfer (write)
    // DO NOT include: external_ui_toast (effect)
    // DO NOT include: external_report_update_component (effect)
  }
}

/**
 * Re-runs a component's dataSource to get updated props.
 * Executes in a fresh isolate with read-only bindings.
 */
export async function refreshComponent(
  reportState: ServerReportState,
  componentId: string,
): Promise<RefreshResult> {
  console.log('[RefreshComponent] Starting refresh for:', componentId)
  const component = findComponent(reportState, componentId)

  if (!component) {
    console.log('[RefreshComponent] Component not found:', componentId)
    return { componentId, success: false, error: 'Component not found' }
  }

  console.log('[RefreshComponent] Component found, type:', component.type)
  console.log('[RefreshComponent] Has dataSource:', !!component.dataSource)

  if (!component.dataSource) {
    console.log('[RefreshComponent] No dataSource on component')
    return { componentId, success: false, error: 'No dataSource on component' }
  }

  console.log('[RefreshComponent] dataSource code:', component.dataSource)

  // Dynamic import to avoid RSC module runner issues
  const { createIsolateDriver } = await import('@/lib/create-isolate-driver')
  const driver = await createIsolateDriver('node')

  // Capture the result via a binding since isolate doesn't return async values properly
  let capturedResult: unknown = undefined
  const onResult = (value: unknown) => {
    console.log('[RefreshComponent] Result captured:', value)
    capturedResult = value
  }

  const context = await driver.createContext({
    bindings: await createDataSourceBindings(onResult),
    timeout: 3000, // Shorter timeout for data fetches
    memoryLimit: 32, // Less memory needed
  })

  try {
    // Wrap the dataSource code to capture its return value via __setResult binding
    // The isolate doesn't properly return values from async IIFEs, so we use a side effect
    const wrappedCode = `
(async () => {
  try {
    const __result = await (async () => { ${component.dataSource} })();
    console.log('[IsolateCode] __result:', JSON.stringify(__result));
    await __setResult(__result);
    console.log('[IsolateCode] __setResult called');
  } catch (e) {
    console.log('[IsolateCode] Error:', e.message);
    throw e;
  }
})()
`
    console.log('[RefreshComponent] Wrapped code:\n', wrappedCode)
    console.log('[RefreshComponent] Executing wrapped code')
    const result = await context.execute(wrappedCode)
    console.log('[RefreshComponent] Execution result:', result)
    console.log('[RefreshComponent] Isolate logs:', result.logs)
    console.log('[RefreshComponent] Captured result:', capturedResult)

    if (!result.success) {
      console.log('[RefreshComponent] Execution failed:', result.error)
      return {
        componentId,
        success: false,
        error: result.error?.message ?? 'dataSource execution failed',
      }
    }

    const newProps = capturedResult
    console.log('[RefreshComponent] New props:', newProps)

    if (typeof newProps !== 'object' || newProps === null) {
      console.log('[RefreshComponent] Invalid props type:', typeof newProps)
      return {
        componentId,
        success: false,
        error: 'dataSource must return an object',
      }
    }

    return {
      componentId,
      success: true,
      props: newProps as Record<string, unknown>,
    }
  } catch (error) {
    console.log('[RefreshComponent] Exception:', error)
    return {
      componentId,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }
  } finally {
    await context.dispose()
  }
}

/**
 * Refresh multiple components and return all results.
 */
export async function refreshComponents(
  reportState: ServerReportState,
  componentIds: string[],
): Promise<RefreshResult[]> {
  const results: RefreshResult[] = []

  for (const componentId of componentIds) {
    const result = await refreshComponent(reportState, componentId)
    results.push(result)
  }

  return results
}
