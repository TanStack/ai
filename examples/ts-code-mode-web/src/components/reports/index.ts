// State management
export { useReportState } from './useReportState'
export { usePersistedReports } from '@/lib/reports/use-persisted-reports'

// Rendering
export { ReportRenderer } from './ReportRenderer'
export { NodeRenderer, AnimatedNodeList } from './NodeRenderer'
export {
  ReportRuntimeProvider,
  useReportRuntime,
} from './ReportRuntimeProvider'
export { useEventDispatch } from './useEventDispatch'
export { useEffectsHandler } from './useEffectsHandler'
export { useReportSSE, refreshResultsToUIUpdates } from './useReportSSE'

// Page Components
export { ReportHeader } from './ReportHeader'
export { ReportsList } from './ReportsList'
export { EmptyReportState } from './EmptyReportState'
export { SidebarSection } from './SidebarSection'
export { ReportSelector } from './ReportSelector'

// Re-export primitives
export * from './primitives'

// Re-export types
export type {
  Report,
  UINode,
  ReportState,
  ComponentType,
  UIEvent,
  ReportCustomEvent,
  ReportCreatedEventData,
  ReportDeletedEventData,
  ReportUIEventData,
  RefreshResult,
  BindingSignalMetadata,
  SignalRegistry,
  WatcherSubscription,
  WatcherResult,
} from '@/lib/reports/types'

// Re-export helpers
export {
  applyUIEvent,
  createEmptyReportState,
  applyRefreshResults,
} from '@/lib/reports/apply-event'
