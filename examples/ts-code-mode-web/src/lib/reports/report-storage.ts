import type {
  Report,
  ReportState,
  SignalRegistry,
  UIEvent,
  UIUpdate,
  WatcherSubscription,
} from './types'
import {
  applyUIEvent,
  applyUIUpdates,
  createEmptyReportState,
} from './apply-event'
import { createSignalRegistry } from './signal-registry'

/**
 * Extended server-side state that includes signal registry and SSE controller.
 * These are server-only fields not needed on the client.
 */
export interface ServerReportState extends ReportState {
  signalRegistry: SignalRegistry
  sseController?: ReadableStreamDefaultController<Uint8Array>
  watchers: Map<string, WatcherSubscription>
}

const reportStateStore = new Map<string, ServerReportState>()

export function createReportState(report: Report): ServerReportState {
  const baseState = createEmptyReportState(report)
  const state: ServerReportState = {
    ...baseState,
    signalRegistry: createSignalRegistry(),
    watchers: new Map(),
  }
  reportStateStore.set(report.id, state)
  return state
}

export function deleteReportState(reportId: string) {
  reportStateStore.delete(reportId)
}

export function getReportState(reportId: string): ServerReportState | null {
  return reportStateStore.get(reportId) ?? null
}

export function getSignalRegistry(reportId: string): SignalRegistry | null {
  const state = reportStateStore.get(reportId)
  return state?.signalRegistry ?? null
}

export function setSSEController(
  reportId: string,
  controller: ReadableStreamDefaultController<Uint8Array> | undefined,
): boolean {
  const state = reportStateStore.get(reportId)
  if (!state) {
    console.warn(`[report-storage] Report not found: ${reportId}`)
    return false
  }
  state.sseController = controller
  return true
}

export function getSSEController(
  reportId: string,
): ReadableStreamDefaultController<Uint8Array> | undefined {
  return reportStateStore.get(reportId)?.sseController
}

// ============================================================================
// Watcher Management
// ============================================================================

export function addWatcher(
  reportId: string,
  watcher: WatcherSubscription,
): boolean {
  const state = reportStateStore.get(reportId)
  if (!state) {
    console.warn(`[report-storage] Report not found: ${reportId}`)
    return false
  }
  state.watchers.set(watcher.id, watcher)
  return true
}

export function removeWatcher(reportId: string, watcherId: string): boolean {
  const state = reportStateStore.get(reportId)
  if (!state) {
    console.warn(`[report-storage] Report not found: ${reportId}`)
    return false
  }
  return state.watchers.delete(watcherId)
}

export function getWatcher(
  reportId: string,
  watcherId: string,
): WatcherSubscription | undefined {
  return reportStateStore.get(reportId)?.watchers.get(watcherId)
}

export function getWatchersForSignal(
  reportId: string,
  signal: string,
): WatcherSubscription[] {
  const state = reportStateStore.get(reportId)
  if (!state) return []

  const watchers: WatcherSubscription[] = []
  for (const watcher of state.watchers.values()) {
    if (watcher.signals.includes(signal) && !watcher.fired) {
      watchers.push(watcher)
    }
  }
  return watchers
}

export function markWatcherFired(reportId: string, watcherId: string): void {
  const watcher = reportStateStore.get(reportId)?.watchers.get(watcherId)
  if (watcher) {
    watcher.fired = true
    // Remove if it was a once-only watcher
    if (watcher.once) {
      reportStateStore.get(reportId)?.watchers.delete(watcherId)
    }
  }
}

export function getAllWatchers(reportId: string): WatcherSubscription[] {
  const state = reportStateStore.get(reportId)
  if (!state) return []
  return Array.from(state.watchers.values())
}

export function applyReportUIEvent(reportId: string, event: UIEvent): boolean {
  const state = reportStateStore.get(reportId)
  if (!state) {
    console.warn(`[report-storage] Report not found: ${reportId}`)
    return false
  }
  const newBaseState = applyUIEvent(state, event)
  reportStateStore.set(reportId, {
    ...newBaseState,
    signalRegistry: state.signalRegistry,
    sseController: state.sseController,
    watchers: state.watchers,
  })
  return true
}

export function applyReportUIUpdates(
  reportId: string,
  updates: UIUpdate[],
): boolean {
  const state = reportStateStore.get(reportId)
  if (!state) {
    console.warn(`[report-storage] Report not found: ${reportId}`)
    return false
  }
  const newBaseState = applyUIUpdates(state, updates)
  reportStateStore.set(reportId, {
    ...newBaseState,
    signalRegistry: state.signalRegistry,
    sseController: state.sseController,
    watchers: state.watchers,
  })
  return true
}
