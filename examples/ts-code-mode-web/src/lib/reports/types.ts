// lib/reports/types.ts
// Core types for the Reports system

export interface Report {
  id: string
  title: string
  createdAt: number
  updatedAt: number
}

export interface UINode {
  id: string
  type: ComponentType
  props: Record<string, unknown>
  children: string[] // ordered child IDs
  handlers?: Record<string, string>
  subscriptions?: string[] // Signal names this component watches
  dataSource?: string // TypeScript code that returns updated props
}

export interface ReportState {
  report: Report
  nodes: Map<string, UINode>
  rootIds: string[] // top-level component IDs in order
}

export type ComponentType =
  // Layout
  | 'vbox'
  | 'hbox'
  | 'grid'
  | 'card'
  | 'section'
  // Content
  | 'text'
  | 'metric'
  | 'badge'
  | 'markdown'
  | 'divider'
  | 'spacer'
  | 'button'
  // Data
  | 'chart'
  | 'sparkline'
  | 'dataTable'
  | 'progress'
  // Special
  | 'placeholder'
  | 'error'
  | 'empty'

// Event Protocol
export type UIEvent =
  | {
      op: 'add'
      id: string
      type: ComponentType
      parentId?: string // undefined = add to root
      props: Record<string, unknown>
      handlers?: Record<string, string>
      subscriptions?: string[] // Signal names this component watches
      dataSource?: string // TypeScript code that returns updated props
    }
  | {
      op: 'update'
      id: string
      props: Record<string, unknown> // merged with existing
    }
  | {
      op: 'remove'
      id: string
    }
  | {
      op: 'reorder'
      parentId?: string // undefined = reorder root
      childIds: string[]
    }

// Component Props Types

// Layout Components
export interface VBoxProps {
  id: string
  parentId?: string
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  align?: 'start' | 'center' | 'end' | 'stretch'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children?: React.ReactNode
}

export interface HBoxProps {
  id: string
  parentId?: string
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  align?: 'start' | 'center' | 'end' | 'stretch'
  justify?: 'start' | 'center' | 'end' | 'between' | 'around'
  wrap?: boolean
  children?: React.ReactNode
}

export interface GridProps {
  id: string
  parentId?: string
  cols?: number | { sm?: number; md?: number; lg?: number }
  gap?: 'none' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  children?: React.ReactNode
}

export interface CardProps {
  id: string
  parentId?: string
  title?: string
  subtitle?: string
  variant?: 'default' | 'outlined' | 'elevated'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  children?: React.ReactNode
}

export interface SectionProps {
  id: string
  parentId?: string
  title: string
  defaultOpen?: boolean
  collapsible?: boolean
  children?: React.ReactNode
}

// Content Components
export interface TextProps {
  id?: string
  parentId?: string
  content: string
  variant?: 'h1' | 'h2' | 'h3' | 'body' | 'caption' | 'code'
  color?: 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'error'
  align?: 'left' | 'center' | 'right'
}

export interface MetricProps {
  id?: string
  parentId?: string
  value: number | string
  label: string
  trend?: string
  trendDirection?: 'up' | 'down' | 'neutral'
  format?: 'number' | 'currency' | 'percent' | 'compact'
  prefix?: string
  suffix?: string
  variant?: 'default' | 'success' | 'warning' | 'error'
}

export interface BadgeProps {
  id?: string
  parentId?: string
  label: string
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md'
}

export interface MarkdownProps {
  id?: string
  parentId?: string
  content: string
}

export interface DividerProps {
  id?: string
  parentId?: string
  variant?: 'solid' | 'dashed'
  spacing?: 'sm' | 'md' | 'lg'
}

export interface SpacerProps {
  id?: string
  parentId?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'flex'
}

export interface ButtonProps {
  id: string
  parentId?: string
  label: string
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost'
  disabled?: boolean
}

// Data Components
export interface ChartProps {
  id: string
  parentId?: string
  type: 'line' | 'bar' | 'area' | 'pie' | 'donut'
  data: Array<Record<string, unknown>>
  xKey: string
  yKey: string | string[]
  height?: number
  showLegend?: boolean
  showGrid?: boolean
  showTooltip?: boolean
  colors?: string[]
  animate?: boolean
}

export interface SparklineProps {
  id?: string
  parentId?: string
  data: number[]
  type?: 'line' | 'bar' | 'area'
  color?: string
  height?: number
  width?: number
  showEndValue?: boolean
}

export interface DataTableColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
  format?: 'text' | 'number' | 'currency' | 'percent' | 'date'
  sortable?: boolean
  width?: number | string
}

export interface DataTableProps {
  id: string
  parentId?: string
  columns: DataTableColumn[]
  rows: Array<Record<string, unknown>>
  pageSize?: number
  showPagination?: boolean
  striped?: boolean
  compact?: boolean
  sortBy?: string
  sortDirection?: 'asc' | 'desc'
}

export interface ProgressProps {
  id?: string
  parentId?: string
  value: number
  max?: number
  label?: string
  showValue?: boolean
  variant?: 'default' | 'success' | 'warning' | 'error'
  size?: 'sm' | 'md' | 'lg'
}

// Special Components
export interface PlaceholderProps {
  id: string
  parentId?: string
  height?: number | string
  label?: string
}

export interface ErrorDisplayProps {
  id?: string
  parentId?: string
  message: string
  details?: string
  variant?: 'inline' | 'card'
}

export interface EmptyProps {
  id?: string
  parentId?: string
  title?: string
  description?: string
  icon?: string
}

// Helper type for component props lookup
export type ComponentPropsMap = {
  vbox: VBoxProps
  hbox: HBoxProps
  grid: GridProps
  card: CardProps
  section: SectionProps
  text: TextProps
  metric: MetricProps
  badge: BadgeProps
  markdown: MarkdownProps
  divider: DividerProps
  spacer: SpacerProps
  button: ButtonProps
  chart: ChartProps
  sparkline: SparklineProps
  dataTable: DataTableProps
  progress: ProgressProps
  placeholder: PlaceholderProps
  error: ErrorDisplayProps
  empty: EmptyProps
}

// ============================================================================
// Handler Execution Types
// ============================================================================

export interface HandlerEvent {
  componentId: string
  handlerName: string
  data?: Record<string, unknown>
}

export interface UIEffect {
  type: 'toast'
  params: Record<string, unknown>
}

export interface UIUpdate {
  type: 'update' | 'remove'
  componentId: string
  props?: Record<string, unknown>
}

export interface HandlerResult {
  success: boolean
  result?: unknown
  error?: string
  effects?: UIEffect[]
  uiUpdates?: UIUpdate[]
  refreshResults?: RefreshResult[]
}

// ============================================================================
// Subscription System Types
// ============================================================================

/**
 * Metadata for a binding's signal relationships.
 * This is defined by the developer, not the LLM.
 */
export interface BindingSignalMetadata {
  /** This binding IS a readable signal (components can subscribe to it) */
  signal?: string
  /** Calling this binding invalidates these signals */
  invalidates?: string[]
}

/**
 * Result of refreshing a component's data via its dataSource.
 */
export interface RefreshResult {
  componentId: string
  success: boolean
  props?: Record<string, unknown>
  error?: string
}

/**
 * Interface for the signal registry that tracks subscriptions.
 */
export interface SignalRegistry {
  /** Subscribe a component to a signal */
  subscribe(componentId: string, signal: string): void
  /** Unsubscribe a component from a signal */
  unsubscribe(componentId: string, signal: string): void
  /** Unsubscribe a component from all signals */
  unsubscribeAll(componentId: string): void
  /** Get all component IDs subscribed to a signal */
  getSubscribers(signal: string): string[]
  /** Get all signals a component is subscribed to */
  getSubscriptions(componentId: string): string[]
  /** Check if a component is subscribed to a signal */
  isSubscribed(componentId: string, signal: string): boolean
}

/**
 * A watcher subscription that runs code when signals change and a condition is met.
 * Unlike component subscriptions, watchers execute arbitrary actions (toasts, etc).
 */
export interface WatcherSubscription {
  /** Unique identifier for this watcher */
  id: string
  /** Human-readable description of what this watcher does */
  description: string
  /** Signal names this watcher monitors */
  signals: string[]
  /** TypeScript code that returns true/false - action runs when true */
  condition: string
  /** TypeScript code to execute when condition is true */
  action: string
  /** Whether the watcher has already fired (for once-only watchers) */
  fired?: boolean
  /** If true, watcher only fires once then is removed */
  once?: boolean
}

/**
 * Result of evaluating a watcher subscription.
 */
export interface WatcherResult {
  watcherId: string
  conditionMet: boolean
  actionExecuted: boolean
  error?: string
}

// ============================================================================
// Custom Events for Report System
// ============================================================================

/**
 * Custom events emitted by report tools and bindings.
 * These are received by the client through the onCustomEvent callback.
 */
export type ReportCustomEvent =
  | {
      type: 'report:created'
      report: Report
      autoSelect: boolean
    }
  | {
      type: 'report:deleted'
      reportId: string
    }
  | {
      type: 'report:ui'
      reportId: string
      event: UIEvent
    }

/**
 * Event data for report:created custom event
 */
export interface ReportCreatedEventData {
  report: Report
  autoSelect: boolean
}

/**
 * Event data for report:deleted custom event
 */
export interface ReportDeletedEventData {
  reportId: string
}

/**
 * Event data for report:ui custom event
 */
export interface ReportUIEventData {
  reportId: string
  event: UIEvent
}
