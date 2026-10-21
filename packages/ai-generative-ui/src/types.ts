/**
 * Open Generative UI Specification (Draft 0.1)
 * Clean-room TypeScript type definitions.
 */

export type SpecVersion = '0.1'

export type SemanticPaintRole =
  | 'accent'
  | 'muted'
  | 'danger'
  | 'neutral'
  | 'highlight'
  | 'surface'
  | 'none'

export type SemanticTone =
  | 'info'
  | 'warning'
  | 'danger'
  | 'neutral'
  | 'primary'
  | 'secondary'
  | 'accent'

export interface GraphProvenance {
  driver: 'fixture' | 'programmatic' | 'live'
  agentId?: string
  runId?: string
  sourceId?: string
}

export interface GraphDocument {
  specVersion: SpecVersion
  graphId: string
  revision: number
  title: string
  fallbackText: string
  provenance: GraphProvenance
  root: UINode
}

export interface ComputeBinding {
  name: string
  inputs: Record<string, string>
  output: string
}

export interface UINode {
  id: string
  type: string
  props?: Record<string, any>
  children?: Array<UINode>
  bind?: Record<string, string>
  compute?: ComputeBinding | string
  on?: Record<string, string | { intent: string; payload?: unknown }>
}

/* -------------------------------------------------------------------------- */
/* Catalog Node Props Sketches (§6)                                           */
/* -------------------------------------------------------------------------- */

// 6.1 Layout (Containers)
export interface StackProps {
  direction?: 'vertical' | 'horizontal'
  gap?: 'none' | 'sm' | 'md' | 'lg'
  align?: 'start' | 'center' | 'end' | 'stretch'
}

export interface ColumnsProps {
  count?: 2 | 3 | 4
  gap?: 'sm' | 'md' | 'lg'
}

export interface SectionProps {
  title: string
  subtitle?: string
  collapsible?: boolean
  defaultCollapsed?: boolean
}

export interface TabsProps {
  tabs: Array<{ id: string; label: string }>
  defaultTab?: string
}

export interface TimelineProps {
  currentStep?: number
}

// 6.2 Content
export interface TextProps {
  content: string
  variant?: 'body' | 'heading' | 'caption' | 'code'
}

export interface ImageProps {
  src: string
  alt: string
  caption?: string
  width?: number | string
  height?: number | string
}

export interface TableColumn {
  key: string
  label: string
  align?: 'left' | 'center' | 'right'
}

export interface TableProps {
  columns: Array<TableColumn>
  rows: Array<Record<string, unknown>>
}

export interface ListProps {
  items: Array<string | { text: string; subtitle?: string; icon?: string }>
  ordered?: boolean
}

export interface MetricProps {
  label: string
  value: string | number
  delta?: string | number
  unit?: string
  tone?: 'neutral' | 'positive' | 'negative'
}

export interface ChartDatum {
  label: string
  value: number
  series?: string
}

export interface ChartProps {
  kind: 'bar' | 'line' | 'pie'
  data: Array<ChartDatum>
  title?: string
  unit?: string
}

export interface MapMarker {
  id: string
  label: string
  lat?: number
  lng?: number
  note?: string
}

export interface MapProps {
  markers: Array<MapMarker>
  route?: Array<{ lat: number; lng: number }>
  center?: { lat: number; lng: number }
  zoom?: number
}

export interface DiagramHotspot {
  id: string
  label: string
  explanation: string
  x?: number
  y?: number
}

export interface DiagramProps {
  title?: string
  hotspots: Array<DiagramHotspot>
  imageSrc?: string
}

export interface CalloutProps {
  tone: 'info' | 'warning' | 'danger'
  text: string
  title?: string
}

// 6.3 Input and Action
export interface FormProps {
  submitLabel?: string
  submitIntent?: string
}

export interface TextInputProps {
  label: string
  placeholder?: string
  validation?: {
    pattern?: string
    minLength?: number
    maxLength?: number
  }
}

export interface NumberInputProps {
  label: string
  min?: number
  max?: number
  step?: number
}

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  label: string
  options: Array<SelectOption>
}

export interface SliderProps {
  label: string
  min: number
  max: number
  step?: number
}

export interface StepperProps {
  label: string
  min?: number
  max?: number
  step?: number
}

export interface ToggleProps {
  label: string
}

export interface CheckboxProps {
  label: string
}

export interface ChecklistItem {
  id: string
  label: string
  defaultDone?: boolean
}

export interface ChecklistProps {
  items: Array<ChecklistItem>
}

export interface ButtonProps {
  label: string
  tone?: 'primary' | 'secondary' | 'danger' | 'accent'
  disabled?: boolean
}

export interface ChoiceOption {
  id: string
  label: string
  description?: string
}

export interface ChoiceProps {
  label?: string
  options: Array<ChoiceOption>
}

// 6.4 Vector Scenes (Scene)
export type SceneShapeKind =
  | 'group'
  | 'rect'
  | 'circle'
  | 'line'
  | 'polygon'
  | 'path'
  | 'text'

export interface BaseSceneShape {
  kind: SceneShapeKind
  id?: string
  label?: string
  fill?: SemanticPaintRole
  stroke?: SemanticPaintRole
  strokeWidth?: number
  opacity?: number
  bind?: Record<string, string>
  on?: Record<string, string>
}

export interface GroupShape extends BaseSceneShape {
  kind: 'group'
  children: Array<SceneShape>
}

export interface RectShape extends BaseSceneShape {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  rx?: number
  ry?: number
}

export interface CircleShape extends BaseSceneShape {
  kind: 'circle'
  cx: number
  cy: number
  r: number
}

export interface LineShape extends BaseSceneShape {
  kind: 'line'
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface PolygonShape extends BaseSceneShape {
  kind: 'polygon'
  points: string
}

export interface PathShape extends BaseSceneShape {
  kind: 'path'
  d: string
}

export interface TextShape extends BaseSceneShape {
  kind: 'text'
  x: number
  y: number
  text: string
  sizeRole?: 'xs' | 'sm' | 'base' | 'lg'
}

export type SceneShape =
  | GroupShape
  | RectShape
  | CircleShape
  | LineShape
  | PolygonShape
  | PathShape
  | TextShape

export interface SceneProps {
  viewBox: string
  shapes: Array<SceneShape>
  width?: number | string
  height?: number | string
}

/* -------------------------------------------------------------------------- */
/* Intents (§8)                                                               */
/* -------------------------------------------------------------------------- */

export type IntentClass = 'local' | 'submit' | 'action'

export interface IntentPayload<T = unknown> {
  graphId: string
  nodeId: string
  intent: string
  intentClass: IntentClass
  payload?: T
  state: Record<string, unknown>
}

/* -------------------------------------------------------------------------- */
/* Drivers & Requests (§7)                                                    */
/* -------------------------------------------------------------------------- */

export interface UIRequest {
  scenario?: string
  job: string
  data?: unknown
  context?: Record<string, unknown>
}

export interface UIDriver {
  render: (request: UIRequest) => Promise<GraphDocument>
}

/* -------------------------------------------------------------------------- */
/* Host Renderer Contract (§9)                                                */
/* -------------------------------------------------------------------------- */

export interface HostCapability {
  catalogVersion: string
  implementedNodes: Array<string>
  computeFunctions: Array<string>
  supportedBindings: Array<string>
  sceneLimits?: {
    maxShapes?: number
    maxPathLength?: number
  }
}
