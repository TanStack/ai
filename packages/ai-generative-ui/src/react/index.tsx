/**
 * Open Generative UI Specification (Draft 0.1)
 * Host React Renderer with catalog components, state binding, and vector scenes.
 */

import React, { useState, useEffect, useCallback } from 'react'
import type {
  GraphDocument,
  UINode,
  IntentPayload,
  SceneShape,
  SemanticPaintRole,
} from '../types'
import type { ComputeRegistry} from '../compute';
import { defaultComputeRegistry } from '../compute'

export interface GenerativeUIRendererProps {
  graph: GraphDocument
  onIntent?: (intent: IntentPayload) => void
  computeRegistry?: ComputeRegistry
  className?: string
  initialState?: Record<string, unknown>
}

// Map semantic paint roles to CSS values
const PAINT_ROLES: Record<SemanticPaintRole, string> = {
  accent: '#2563eb', // blue-600
  muted: '#94a3b8', // slate-400
  danger: '#ef4444', // red-500
  neutral: '#334155', // slate-700
  highlight: '#f59e0b', // amber-500
  surface: '#ffffff', // white
  none: 'none',
}

function resolveStatePath(obj: unknown, path: string): unknown {
  if (!obj || !path || typeof obj !== 'object') return undefined
  const parts = path.split('.')
  let curr: unknown = obj
  for (const p of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object') return undefined
    curr = (curr as Record<string, unknown>)[p]
  }
  return curr
}

function setStatePath(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.')
  const copy: Record<string, unknown> = { ...obj }
  let curr: Record<string, unknown> = copy
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!p) continue
    curr[p] = curr[p] && typeof curr[p] === 'object' ? { ...(curr[p] as Record<string, unknown>) } : {}
    curr = curr[p] as Record<string, unknown>
  }
  const lastKey = parts[parts.length - 1]
  if (lastKey) {
    curr[lastKey] = value
  }
  return copy
}

// A dotted identifier with no spaces, e.g. "computedMortgage.monthlyPayment".
// A display value that looks like this and resolves against live state is
// almost certainly a binding the model placed as a literal instead of in `bind`.
const PATH_LIKE = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)+$/

/**
 * Resolve a binding path against state, tolerant of the output-name drift a
 * live model introduces: if `a.b` is undefined, fall back to the leaf `b` at
 * the state root. Compute flattens every object-result key to the root
 * (see the compute effect), so `computedMortgage.monthlyPayment` still resolves
 * to `monthlyPayment` even when the model misremembers the output object's name.
 */
function resolveBinding(state: unknown, path: string): unknown {
  const direct = resolveStatePath(state, path)
  if (direct !== undefined) return direct
  if (path.includes('.')) {
    const leaf = path.split('.').pop()
    if (leaf) return resolveStatePath(state, leaf)
  }
  return undefined
}

/**
 * For display props (Metric/Text value): if a live model wrote a binding path
 * as a literal string instead of using `bind`, resolve it when — and only when
 * — it is path-shaped and resolves to a defined scalar. Otherwise it is real
 * text and passes through untouched.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- display props are untyped catalog values rendered as ReactNode
function resolveDisplayValue(val: any, state: unknown): any {
  if (typeof val === 'string' && PATH_LIKE.test(val)) {
    const resolved = resolveBinding(state, val)
    if (resolved !== undefined && resolved !== null && typeof resolved !== 'object') {
      return resolved
    }
  }
  return val
}

/**
 * The state path an input reads and writes: an explicit `bind.value`, or the
 * implicit `<nodeId>.value` convention a live model naturally reaches for
 * (it references an input by id, e.g. compute input "loanAmountInput.value").
 */
function valueBindPath(node: Pick<UINode, 'id' | 'bind'>): string {
  const explicit = node.bind?.value
  return typeof explicit === 'string' && explicit ? explicit : `${node.id}.value`
}

/**
 * Walk the graph once and seed state from inputs that declare an initial value
 * in props. Without this, a value shown in an input (e.g. a prefilled loan
 * amount) would never reach a bound compute on first render.
 */
function collectInitialBoundState(
  node: UINode,
  acc: Record<string, unknown>,
): Record<string, unknown> {
  let next = acc
  const p = node.props ?? {}
  const seed = p.value ?? p.defaultValue ?? p.default
  if (seed !== undefined) {
    const path = valueBindPath(node)
    if (resolveStatePath(next, path) === undefined) next = setStatePath(next, path, seed)
  }
  // Checklist: seed its state object from each item's defaultDone. Mirrors the
  // renderer's implicit `${id}.state` path and index-based item keys.
  if (node.type === 'Checklist') {
    const statePath = (typeof node.bind?.state === 'string' && node.bind.state) || `${node.id}.state`
    const items = node.props?.items
    if (Array.isArray(items) && resolveStatePath(next, statePath) === undefined) {
      const checklistState: Record<string, boolean> = {}
      items.forEach((item, idx) => {
        const key = item && typeof item === 'object' && typeof item.id === 'string' ? item.id : String(idx)
        checklistState[key] = Boolean(item?.defaultDone)
      })
      if (Object.keys(checklistState).length > 0) next = setStatePath(next, statePath, checklistState)
    }
  }
  node.children?.forEach((child) => {
    next = collectInitialBoundState(child, next)
  })
  return next
}

export function GenerativeUIRenderer({
  graph,
  onIntent,
  computeRegistry = defaultComputeRegistry,
  className = '',
  initialState = {},
}: GenerativeUIRendererProps) {
  // Initialize state with defaults from bindings
  const [state, setState] = useState<Record<string, unknown>>(() => {
    const s: Record<string, unknown> = { ...initialState }
    // Pre-populate sensible defaults for demo fixtures
    if (s.subtotal === undefined) s.subtotal = 100
    if (s.tipPercent === undefined) s.tipPercent = 18
    if (s.splitCount === undefined) s.splitCount = 4
    if (s.spiceLevel === undefined) s.spiceLevel = 3
    if (s.cuisine === undefined) s.cuisine = 'italian'
    // Seed state from the graph's own declared input defaults so computes have
    // real inputs on first render (a live model often sets an input's initial
    // value via props AND binds it to a state key).
    return collectInitialBoundState(graph.root, s)
  })

  // Recompute any bound compute nodes whenever state changes
  useEffect(() => {
    function evaluateComputes(node: UINode) {
      if (node.compute) {
        if (typeof node.compute === 'object' && node.compute.name) {
          const { name, inputs, output } = node.compute
          const resolvedInputs: Record<string, unknown> = {}
          for (const [inKey, stateKey] of Object.entries(inputs)) {
            resolvedInputs[inKey] = resolveStatePath(state, stateKey)
          }
          const result = computeRegistry.execute(name, resolvedInputs, state)
          if (result !== undefined) {
            setState((prev) => {
              // Write the result at the declared output path (fixtures bind to
              // e.g. "computedBill.perPerson"), and also flatten object keys to
              // the state root so scalar-style bindings a live model may emit
              // (e.g. output "monthlyPayment") resolve too.
              let next = setStatePath(prev, output, result)
              if (result && typeof result === 'object' && !Array.isArray(result)) {
                for (const [k, v] of Object.entries(result)) {
                  next = setStatePath(next, k, v)
                }
              }
              return JSON.stringify(next) === JSON.stringify(prev) ? prev : next
            })
          }
        }
      }
      if (node.children) {
        node.children.forEach(evaluateComputes)
      }
    }

    evaluateComputes(graph.root)
  }, [graph.root, state, computeRegistry])

  const handleStateChange = useCallback((path: string, value: unknown) => {
    setState((prev) => setStatePath(prev, path, value))
  }, [])

  const fireIntent = useCallback(
    (nodeId: string, intent: string, intentClass: 'local' | 'submit' | 'action', payload?: unknown) => {
      onIntent?.({
        graphId: graph.graphId,
        nodeId,
        intent,
        intentClass,
        payload,
        state,
      })
    },
    [graph.graphId, onIntent, state],
  )

  return (
    <div
      className={`open-gen-ui-container text-slate-800 bg-[#fcfcfd] border border-slate-200/80 rounded-2xl p-6 sm:p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.18)] max-w-4xl mx-auto ${className}`}
      data-graph-id={graph.graphId}
    >
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-slate-900 leading-tight">{graph.title}</h2>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400 bg-slate-100/70 border border-slate-200/80 rounded-full px-2.5 py-1 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Spec v{graph.specVersion} · Rev {graph.revision}
        </span>
      </header>

      <main className="open-gen-ui-root">
        <NodeRenderer
          node={graph.root}
          state={state}
          onStateChange={handleStateChange}
          onFireIntent={fireIntent}
          computeRegistry={computeRegistry}
        />
      </main>
    </div>
  )
}

interface NodeRendererProps {
  node: UINode
  state: Record<string, unknown>
  onStateChange: (path: string, value: unknown) => void
  onFireIntent: (
    nodeId: string,
    intent: string,
    intentClass: 'local' | 'submit' | 'action',
    payload?: unknown,
  ) => void
  computeRegistry?: ComputeRegistry
}

function NodeRenderer({ node, state, onStateChange, onFireIntent, computeRegistry }: NodeRendererProps) {
  const { id, type, props = {}, children, bind = {}, on = {} } = node

  // Resolve bound props from state (tolerant of compute output-name drift)
  const resolvedProps = { ...props }
  for (const [propKey, statePath] of Object.entries(bind)) {
    if (typeof statePath !== 'string') continue
    const val = resolveBinding(state, statePath)
    if (val !== undefined) {
      resolvedProps[propKey] = val
    }
  }

  // 6.1 Layout Components
  if (type === 'Stack') {
    const isHorizontal = resolvedProps.direction === 'horizontal'
    const gapClass = resolvedProps.gap === 'sm' ? 'gap-2' : resolvedProps.gap === 'lg' ? 'gap-6' : 'gap-4'
    return (
      <div className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${gapClass}`}>
        {children?.map((child) => (
          <NodeRenderer
            key={child.id}
            node={child}
            state={state}
            onStateChange={onStateChange}
            onFireIntent={onFireIntent}
            computeRegistry={computeRegistry}
          />
        ))}
      </div>
    )
  }

  if (type === 'Columns') {
    const count = resolvedProps.count ?? 2
    const gridCols = count === 4 ? 'grid-cols-4' : count === 3 ? 'grid-cols-3' : 'grid-cols-2'
    return (
      <div className={`grid ${gridCols} gap-4`}>
        {children?.map((child) => (
          <NodeRenderer
            key={child.id}
            node={child}
            state={state}
            onStateChange={onStateChange}
            onFireIntent={onFireIntent}
            computeRegistry={computeRegistry}
          />
        ))}
      </div>
    )
  }

  if (type === 'Section') {
    const titleProp = resolvedProps.title ?? resolvedProps.label ?? resolvedProps.heading
    const rawTitle = typeof titleProp === 'string' ? titleProp : ''
    const recommended = resolvedProps.highlighted === true || /\(?\s*recommended\s*\)?/i.test(rawTitle)
    const cleanTitle = rawTitle.replace(/\s*\(?\s*recommended\s*\)?/i, '').trim()
    return (
      <section
        className={`relative rounded-xl border p-5 h-full transition-shadow ${
          recommended
            ? 'border-blue-300 bg-gradient-to-b from-blue-50/60 to-white ring-1 ring-blue-200/60 shadow-[0_8px_24px_-12px_rgba(37,99,235,0.35)]'
            : 'border-slate-200/70 bg-slate-50/40'
        }`}
      >
        {(cleanTitle || recommended) && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {cleanTitle && (
              <h3 className="font-semibold text-slate-900 text-[15px] tracking-[-0.01em]">{cleanTitle}</h3>
            )}
            {recommended && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] text-blue-700 bg-blue-100 rounded-full px-2 py-0.5">
                ★ Recommended
              </span>
            )}
          </div>
        )}
        {resolvedProps.subtitle && <p className="text-[13px] text-slate-500 mt-0.5 mb-1">{resolvedProps.subtitle}</p>}
        <div className={`space-y-3 ${cleanTitle || recommended || resolvedProps.subtitle ? 'mt-4' : ''}`}>
          {children?.map((child) => (
            <NodeRenderer
              key={child.id}
              node={child}
              state={state}
              onStateChange={onStateChange}
              onFireIntent={onFireIntent}
              computeRegistry={computeRegistry}
            />
          ))}
        </div>
      </section>
    )
  }

  if (type === 'Tabs') {
    const tabs: Array<{ id: string; label: string }> = resolvedProps.tabs || []
    const tabKey = bind.tab || `_tab_${id}`
    const activeTab = (resolveStatePath(state, tabKey) as string) || resolvedProps.defaultTab || tabs[0]?.id

    return (
      <div className="space-y-3">
        <div className="flex border-b border-slate-200 gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`py-1.5 px-3 font-medium text-sm border-b-2 -mb-px transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'border-blue-600 text-blue-600 font-semibold'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => {
                onStateChange(tabKey, t.id)
                onFireIntent(id, 'changeTab', 'local', { tabId: t.id })
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div>
          {children
            ?.filter((child) => !child.props?.tabId || child.props.tabId === activeTab)
            .map((child) => (
              <NodeRenderer
                key={child.id}
                node={child}
                state={state}
                onStateChange={onStateChange}
                onFireIntent={onFireIntent}
                computeRegistry={computeRegistry}
              />
            ))}
        </div>
      </div>
    )
  }

  if (type === 'Timeline') {
    const currentStep = resolvedProps.currentStep ?? 1
    const steps = children ?? []
    return (
      <div className="relative pl-1">
        {steps.map((child, idx) => {
          const stepNum = idx + 1
          const done = stepNum < currentStep
          const current = stepNum === currentStep
          const isLast = idx === steps.length - 1
          return (
            <div key={child.id} className="relative flex gap-4 pb-5 last:pb-0">
              {!isLast && (
                <span
                  className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${done ? 'bg-blue-500' : 'bg-slate-200'}`}
                />
              )}
              <span
                className={`relative z-10 shrink-0 w-[27px] h-[27px] rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors ${
                  done
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : current
                      ? 'bg-white border-blue-600 text-blue-600 ring-4 ring-blue-100'
                      : 'bg-white border-slate-300 text-slate-400'
                }`}
              >
                {done ? '✓' : stepNum}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <NodeRenderer
                  node={child}
                  state={state}
                  onStateChange={onStateChange}
                  onFireIntent={onFireIntent}
                  computeRegistry={computeRegistry}
                />
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // 6.2 Content Components
  if (type === 'Text') {
    const variant = resolvedProps.variant || 'body'
    const content = resolveDisplayValue(
      resolvedProps.content ?? resolvedProps.text ?? resolvedProps.value ?? '',
      state,
    )
    if (variant === 'heading') {
      return <h4 className="font-semibold text-slate-900 text-[15px] tracking-[-0.01em]">{content}</h4>
    }
    if (variant === 'caption') {
      return <p className="text-xs text-slate-500">{content}</p>
    }
    if (variant === 'code') {
      return (
        <pre className="bg-slate-900 text-slate-100 text-xs p-3.5 rounded-lg overflow-x-auto font-mono leading-relaxed">
          <code>{content}</code>
        </pre>
      )
    }
    return <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{content}</p>
  }

  if (type === 'Callout') {
    const tone = resolvedProps.tone || 'info'
    const colors =
      tone === 'warning'
        ? 'bg-amber-50/80 border-amber-200/80 text-amber-900'
        : tone === 'danger'
          ? 'bg-rose-50/80 border-rose-200/80 text-rose-900'
          : tone === 'success'
            ? 'bg-emerald-50/80 border-emerald-200/80 text-emerald-900'
            : 'bg-blue-50/70 border-blue-200/70 text-blue-900'
    const accent =
      tone === 'warning' ? 'bg-amber-400' : tone === 'danger' ? 'bg-rose-500' : tone === 'success' ? 'bg-emerald-500' : 'bg-blue-500'
    const icon = tone === 'warning' ? '!' : tone === 'danger' ? '✕' : tone === 'success' ? '✓' : 'i'

    return (
      <div className={`relative flex gap-3 p-4 pl-5 rounded-xl border text-sm overflow-hidden ${colors}`}>
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
        <span className={`shrink-0 w-5 h-5 rounded-full ${accent} text-white text-[11px] font-bold flex items-center justify-center mt-0.5`}>
          {icon}
        </span>
        <div className="min-w-0">
          {resolvedProps.title && <div className="font-semibold mb-0.5">{resolvedProps.title}</div>}
          <div className="text-[13px] leading-relaxed opacity-90">{resolvedProps.text ?? resolvedProps.content ?? resolvedProps.body}</div>
        </div>
      </div>
    )
  }

  if (type === 'Metric') {
    const toneClass =
      resolvedProps.tone === 'positive'
        ? 'text-emerald-600'
        : resolvedProps.tone === 'negative'
          ? 'text-rose-600'
          : 'text-slate-900'
    const deltaStr =
      resolvedProps.delta != null ? String(resolvedProps.delta).trim() : ''
    const deltaUp = deltaStr.startsWith('+')
    const deltaDown = deltaStr.startsWith('-')
    const deltaClass = deltaUp
      ? 'text-emerald-700 bg-emerald-50 border-emerald-200/70'
      : deltaDown
        ? 'text-rose-700 bg-rose-50 border-rose-200/70'
        : 'text-slate-500 bg-slate-50 border-slate-200/70'

    const metricValue = resolveDisplayValue(
      resolvedProps.value ?? resolvedProps.content ?? resolvedProps.text,
      state,
    )
    const hasValue = metricValue !== undefined && metricValue !== null && metricValue !== ''
    return (
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 flex flex-col gap-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-slate-400">{resolvedProps.label}</div>
        <div className={`text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${hasValue ? toneClass : 'text-slate-300'}`}>
          {hasValue ? metricValue : '—'}
          {hasValue && resolvedProps.unit && <span className="text-sm text-slate-400 font-normal ml-1 tracking-normal">{resolvedProps.unit}</span>}
        </div>
        {deltaStr && (
          <div className="mt-0.5">
            <span className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-md border px-1.5 py-0.5 tabular-nums ${deltaClass}`}>
              {deltaUp && <span className="text-[8px]">▲</span>}
              {deltaDown && <span className="text-[8px]">▼</span>}
              {deltaStr}
            </span>
          </div>
        )}
      </div>
    )
  }

  if (type === 'Table') {
    const columns: Array<{ key: string; label: string }> = (resolvedProps.columns as Array<{ key: string; label: string }>) || []
    const rows: Array<Record<string, unknown>> = (resolvedProps.rows as Array<Record<string, unknown>>) || []

    return (
      <div className="overflow-x-auto border border-slate-200/80 rounded-xl">
        <table className="min-w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-slate-50/80 border-b border-slate-200">
              {columns.map((col) => (
                <th key={col.key} className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.05em] text-slate-500">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-blue-50/30 transition-colors">
                {columns.map((col, ci) => (
                  <td key={col.key} className={`px-4 py-2.5 tabular-nums ${ci === 0 ? 'font-medium text-slate-800' : 'text-slate-600'}`}>
                    {String(row[col.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  if (type === 'List') {
    const items: Array<unknown> = (resolvedProps.items as Array<unknown>) || []
    const isOrdered = Boolean(resolvedProps.ordered)

    return (
      <div className="space-y-2">
        {items.map((item, idx) => {
          const text = typeof item === 'string' ? item : (item as any)?.text
          const subtitle = typeof item === 'object' && item !== null ? (item as any)?.subtitle : undefined
          return (
            <div key={idx} className="flex gap-2 text-sm text-slate-700 items-start">
              <span className="font-semibold text-slate-400">{isOrdered ? `${idx + 1}.` : '•'}</span>
              <div>
                <div>{text}</div>
                {subtitle && <div className="text-xs text-slate-500">{subtitle}</div>}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (type === 'Chart') {
    const data: Array<{ label: string; value: number }> = resolvedProps.data || []
    const maxValue = Math.max(...data.map((d) => d.value), 1)
    const PLOT_HEIGHT = 156

    return (
      <figure className="rounded-xl border border-slate-200/80 bg-white p-4 m-0">
        {resolvedProps.title && (
          <figcaption className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-4">
            {resolvedProps.title}
          </figcaption>
        )}
        <div className="flex items-end gap-2.5" style={{ height: PLOT_HEIGHT }}>
          {data.map((d, i) => {
            const barHeight = Math.max(4, Math.round((d.value / maxValue) * (PLOT_HEIGHT - 24)))
            return (
              <div key={i} className="group flex-1 h-full flex flex-col justify-end items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-700 tabular-nums transition-colors group-hover:text-blue-600">
                  {d.value}
                </span>
                <div
                  className="w-full max-w-[44px] rounded-md bg-gradient-to-t from-blue-600 to-sky-400 shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-all duration-300 ease-out group-hover:from-blue-700 group-hover:to-sky-500"
                  style={{ height: barHeight }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex gap-2.5 mt-2.5 pt-2.5 border-t border-slate-100">
          {data.map((d, i) => (
            <span key={i} className="flex-1 text-center text-[11px] text-slate-400 font-medium truncate">
              {d.label}
            </span>
          ))}
        </div>
      </figure>
    )
  }

  if (type === 'Map') {
    const markers: Array<{ id: string; label: string; note?: string; lat?: number; lng?: number }> =
      resolvedProps.markers || []
    const geoMarkers = markers.filter(
      (m) => typeof m.lat === 'number' && typeof m.lng === 'number',
    )
    const selectedMarker = bind.selected ? resolveStatePath(state, bind.selected) : undefined

    const selectMarker = (m: { id: string; label: string }) => {
      if (bind.selected) onStateChange(bind.selected, m.id)
      onFireIntent(id, 'selectStop', 'local', { stopId: m.id, label: m.label })
    }

    // Project lat/lng into an SVG viewport when we have real coordinates.
    const W = 560
    const H = 280
    const PAD = 42
    let projected: Array<{ m: (typeof markers)[number]; x: number; y: number }> = []
    if (geoMarkers.length > 0) {
      const lats = geoMarkers.map((m) => m.lat as number)
      const lngs = geoMarkers.map((m) => m.lng as number)
      const minLat = Math.min(...lats)
      const maxLat = Math.max(...lats)
      const minLng = Math.min(...lngs)
      const maxLng = Math.max(...lngs)
      const latSpan = maxLat - minLat || 0.02
      const lngSpan = maxLng - minLng || 0.02
      projected = geoMarkers.map((m) => ({
        m,
        x: PAD + ((((m.lng as number) - minLng) / lngSpan) * (W - 2 * PAD)),
        y: PAD + ((((maxLat - (m.lat as number)) / latSpan) * (H - 2 * PAD))),
      }))
    }
    const routeD = projected
      .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ')

    return (
      <div className="rounded-xl border border-slate-200/80 bg-white overflow-hidden">
        {projected.length > 0 ? (
          <div className="relative bg-[#eef2f6]">
            <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" role="img" aria-label={resolvedProps.title || 'Route map'}>
              <defs>
                <pattern id={`grid-${id}`} width="28" height="28" patternUnits="userSpaceOnUse">
                  <path d="M 28 0 L 0 0 0 28" fill="none" stroke="#dbe2ea" strokeWidth="1" />
                </pattern>
                <linearGradient id={`land-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f6f8fb" />
                  <stop offset="100%" stopColor="#e9eef4" />
                </linearGradient>
              </defs>
              <rect width={W} height={H} fill={`url(#land-${id})`} />
              <rect width={W} height={H} fill={`url(#grid-${id})`} />
              {routeD && (
                <path
                  d={routeD}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2.5"
                  strokeDasharray="2 7"
                  strokeLinecap="round"
                  opacity="0.5"
                />
              )}
              {projected.map((p, i) => {
                const isSel = selectedMarker === p.m.id
                return (
                  <g
                    key={p.m.id}
                    transform={`translate(${p.x} ${p.y})`}
                    style={{ cursor: 'pointer' }}
                    role="button"
                    tabIndex={0}
                    aria-label={p.m.label}
                    onClick={() => selectMarker(p.m)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        selectMarker(p.m)
                      }
                    }}
                  >
                    <circle r={isSel ? 15 : 12} fill="#2563eb" opacity={isSel ? 0.18 : 0.1} />
                    <circle
                      r={isSel ? 11 : 9}
                      fill={isSel ? '#1d4ed8' : '#2563eb'}
                      stroke="#ffffff"
                      strokeWidth="2.5"
                    />
                    <text
                      y="1"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="700"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {i + 1}
                    </text>
                  </g>
                )
              })}
            </svg>
            <div className="absolute top-2.5 left-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 bg-white/80 backdrop-blur-sm rounded-md px-2 py-1 border border-slate-200/60">
              {resolvedProps.title || 'Route Map'}
            </div>
          </div>
        ) : null}
        <div className="divide-y divide-slate-100">
          {markers.map((m, i) => {
            const isSel = selectedMarker === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMarker(m)}
                className={`w-full flex items-start gap-3 text-left px-4 py-2.5 transition-colors ${
                  isSel ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                }`}
              >
                <span
                  className={`shrink-0 mt-0.5 w-5 h-5 rounded-full text-[11px] font-bold text-white flex items-center justify-center ${
                    isSel ? 'bg-blue-700' : 'bg-blue-600'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{m.label}</span>
                  {m.note && <span className="block text-xs text-slate-500 mt-0.5">{m.note}</span>}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (type === 'Diagram') {
    const hotspots: Array<{ id: string; label: string; explanation: string }> = resolvedProps.hotspots || []
    const selectedPath = (typeof bind.selected === 'string' && bind.selected) || `${id}.selected`
    const selectedPart = resolveStatePath(state, selectedPath)

    return (
      <div className="border border-slate-200/80 rounded-xl p-4 bg-white space-y-3">
        {resolvedProps.title && <h4 className="font-semibold text-slate-800 text-sm">{resolvedProps.title}</h4>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {hotspots.map((spot) => (
            <button
              key={spot.id}
              type="button"
              className={`p-2.5 rounded-lg text-left border text-xs font-medium transition-colors ${
                selectedPart === spot.id
                  ? 'border-blue-600 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => {
                onStateChange(selectedPath, spot.id)
                onFireIntent(id, 'selectHotspot', 'local', { spotId: spot.id })
              }}
            >
              {spot.label}
            </button>
          ))}
        </div>
        {selectedPart && (
          <div className="p-3 bg-slate-50 rounded border border-slate-200 text-xs text-slate-700">
            <strong>{hotspots.find((h) => h.id === selectedPart)?.label}:</strong>{' '}
            {hotspots.find((h) => h.id === selectedPart)?.explanation}
          </div>
        )}
      </div>
    )
  }

  // 6.3 Input and Action Components
  if (type === 'Form') {
    return (
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          const submitIntent = resolvedProps.submitIntent || 'submit'
          onFireIntent(id, submitIntent, 'submit', state)
        }}
      >
        {children?.map((child) => (
          <NodeRenderer
            key={child.id}
            node={child}
            state={state}
            onStateChange={onStateChange}
            onFireIntent={onFireIntent}
            computeRegistry={computeRegistry}
          />
        ))}
        <button
          type="submit"
          className="w-full py-2 px-4 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 transition-colors shadow-sm"
        >
          {resolvedProps.submitLabel || 'Submit'}
        </button>
      </form>
    )
  }

  const inputClass =
    'w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400 transition-shadow'
  const labelClass = 'block text-[13px] font-medium text-slate-600 mb-1.5'

  if (type === 'TextInput') {
    const vp = valueBindPath(node)
    const val = (resolveStatePath(state, vp) ?? resolvedProps.value ?? '') as string
    return (
      <div>
        <label className={labelClass}>{resolvedProps.label}</label>
        <input
          type="text"
          className={inputClass}
          placeholder={resolvedProps.placeholder}
          value={val}
          onChange={(e) => onStateChange(vp, e.target.value)}
        />
      </div>
    )
  }

  if (type === 'NumberInput') {
    const vp = valueBindPath(node)
    const val = (resolveStatePath(state, vp) ?? resolvedProps.value ?? 0) as number
    return (
      <div>
        <label className={labelClass}>{resolvedProps.label}</label>
        <input
          type="number"
          className={`${inputClass} tabular-nums`}
          min={resolvedProps.min}
          max={resolvedProps.max}
          step={resolvedProps.step}
          value={val}
          onChange={(e) => {
            const num = e.target.value === '' ? 0 : parseFloat(e.target.value)
            onStateChange(vp, Number.isNaN(num) ? 0 : num)
          }}
        />
      </div>
    )
  }

  if (type === 'Select') {
    const vp = valueBindPath(node)
    const val = (resolveStatePath(state, vp) ?? resolvedProps.value ?? '') as string
    const options: Array<{ value: string; label: string }> = resolvedProps.options || []

    return (
      <div>
        <label className={labelClass}>{resolvedProps.label}</label>
        <select
          className={inputClass}
          value={val}
          onChange={(e) => onStateChange(vp, e.target.value)}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>
    )
  }

  if (type === 'Slider') {
    const min = resolvedProps.min ?? 0
    const max = resolvedProps.max ?? 100
    const step = resolvedProps.step ?? 1
    const vp = valueBindPath(node)
    const val = (resolveStatePath(state, vp) ?? resolvedProps.value ?? min) as number
    const pct = max > min ? ((Number(val) - min) / (max - min)) * 100 : 0

    return (
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[13px] font-medium text-slate-600">{resolvedProps.label}</label>
          <span className="text-[13px] font-semibold text-blue-600 tabular-nums bg-blue-50 rounded-md px-2 py-0.5">{val}</span>
        </div>
        <input
          type="range"
          className="w-full accent-blue-600 cursor-pointer"
          style={{
            background: `linear-gradient(to right, #2563eb ${pct}%, #e2e8f0 ${pct}%)`,
            height: '6px',
            borderRadius: '9999px',
            WebkitAppearance: 'none',
            appearance: 'none',
          }}
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) => {
            const num = parseFloat(e.target.value)
            onStateChange(vp, Number.isNaN(num) ? min : num)
          }}
        />
      </div>
    )
  }

  if (type === 'Stepper') {
    const min = resolvedProps.min ?? 1
    const max = resolvedProps.max ?? 100
    const step = resolvedProps.step ?? 1
    const vp = valueBindPath(node)
    const val = (resolveStatePath(state, vp) ?? resolvedProps.value ?? min) as number
    const stepBtn =
      'w-9 h-9 rounded-lg border border-slate-300 bg-white text-lg font-semibold text-slate-600 flex items-center justify-center hover:bg-slate-50 hover:border-slate-400 active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100'

    return (
      <div>
        <label className={labelClass}>{resolvedProps.label}</label>
        <div className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50/60 p-1">
          <button
            type="button"
            className={stepBtn}
            disabled={val <= min}
            onClick={() => onStateChange(vp, Math.max(min, Number(val) - step))}
          >
            −
          </button>
          <span className="text-base font-semibold w-10 text-center tabular-nums text-slate-900">{val}</span>
          <button
            type="button"
            className={stepBtn}
            disabled={val >= max}
            onClick={() => onStateChange(vp, Math.min(max, Number(val) + step))}
          >
            +
          </button>
        </div>
      </div>
    )
  }

  if (type === 'Toggle' || type === 'Checkbox') {
    const vp = valueBindPath(node)
    const isChecked = Boolean(resolveStatePath(state, vp))

    return (
      <label className="flex items-center gap-2.5 text-sm text-slate-700 cursor-pointer select-none">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
          checked={isChecked}
          onChange={(e) => onStateChange(vp, e.target.checked)}
        />
        <span>{resolvedProps.label}</span>
      </label>
    )
  }

  if (type === 'Checklist') {
    const items: Array<{ id?: string; label: string; defaultDone?: boolean }> =
      (resolvedProps.items as Array<{ id?: string; label: string; defaultDone?: boolean }>) || []
    // Fall back to an implicit state path and index-based item keys so a live
    // model that omits bind.state and item ids still gets working checkboxes.
    const statePath = (typeof bind.state === 'string' && bind.state) || `${id}.state`
    const rawState = resolveStatePath(state, statePath)
    const checklistState = (rawState && typeof rawState === 'object' ? rawState : {}) as Record<string, boolean>

    return (
      <div className="space-y-2">
        {items.map((item, idx) => {
          const itemKey = item.id ?? String(idx)
          const isDone = checklistState[itemKey] ?? item.defaultDone ?? false
          return (
            <label
              key={itemKey}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[13px] cursor-pointer transition-colors ${
                isDone ? 'bg-slate-50 border-slate-200 line-through text-slate-400' : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
              }`}
            >
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={isDone}
                onChange={(e) => {
                  const updated = { ...checklistState, [itemKey]: e.target.checked }
                  onStateChange(statePath, updated)
                  onFireIntent(id, 'toggleChecklist', 'local', { itemId: itemKey, done: e.target.checked })
                }}
              />
              <span>{item.label}</span>
            </label>
          )
        })}
      </div>
    )
  }

  if (type === 'Button') {
    const tone = resolvedProps.tone || 'primary'
    const isSelected = bind.selected
      ? resolveStatePath(state, bind.selected) === (resolvedProps.value ?? id)
      : false
    const btnClass =
      tone === 'danger'
        ? 'bg-rose-600 text-white hover:bg-rose-700 active:bg-rose-800'
        : tone === 'secondary'
          ? 'bg-slate-100 text-slate-800 border border-slate-300 hover:bg-slate-200 active:bg-slate-300'
          : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'

    return (
      <button
        type="button"
        disabled={resolvedProps.disabled}
        className={`px-4 py-2 rounded-lg font-medium text-xs transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${btnClass} ${
          isSelected ? 'ring-2 ring-blue-500 ring-offset-2 font-bold' : ''
        }`}
        onClick={() => {
          if (bind.selected) {
            onStateChange(bind.selected, resolvedProps.value ?? id)
          }
          const action = on.click
          if (typeof action === 'string') {
            onFireIntent(id, action, 'action')
          } else if (action && typeof action === 'object') {
            // Handle compute if bound
            if ((action as any).compute && computeRegistry) {
              const comp = (action as any).compute
              const compName = typeof comp === 'string' ? comp : comp.name
              const inputs = (action as any).inputs || {}
              const output = (action as any).output || 'result'
              const resolvedInputs: Record<string, unknown> = {}
              for (const [inKey, stateKey] of Object.entries(inputs)) {
                resolvedInputs[inKey] = typeof stateKey === 'string' ? resolveStatePath(state, stateKey) ?? stateKey : stateKey
              }
              const result = computeRegistry.execute(compName, resolvedInputs, state)
              if (result !== undefined) {
                onStateChange(output, result)
                if (result && typeof result === 'object' && !Array.isArray(result)) {
                  for (const [k, v] of Object.entries(result)) onStateChange(k, v)
                }
              }
            }
            const intentName = (action as any).intent || (action as any).action || 'click'
            onFireIntent(id, intentName, 'action', (action as any).payload || (action as any).inputs)
          } else {
            onFireIntent(id, 'click', 'action', resolvedProps)
          }
        }}
      >
        {resolvedProps.label ?? resolvedProps.text ?? resolvedProps.title ?? resolvedProps.content ?? 'Continue'}
      </button>
    )
  }

  if (type === 'Choice') {
    const options: Array<{ id: string; label: string; description?: string; tone?: string }> = resolvedProps.options || []

    return (
      <div className="space-y-2">
        {resolvedProps.label && <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400 mb-1">{resolvedProps.label}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {options.map((opt) => {
            const danger = opt.tone === 'danger' || /reject|cancel|abort|decline|deny/i.test(opt.id + ' ' + opt.label)
            return (
              <button
                key={opt.id}
                type="button"
                className={`group relative flex items-start gap-3 p-4 border rounded-xl text-left bg-white transition-all duration-150 hover:-translate-y-px ${
                  danger
                    ? 'border-slate-200 hover:border-rose-300 hover:bg-rose-50/40 hover:shadow-[0_4px_14px_-6px_rgba(244,63,94,0.4)]'
                    : 'border-slate-200 hover:border-blue-400 hover:bg-blue-50/40 hover:shadow-[0_4px_14px_-6px_rgba(37,99,235,0.4)]'
                }`}
                onClick={() => {
                  const action = on.select
                  if (typeof action === 'string') {
                    onFireIntent(id, action, 'action', { choiceId: opt.id })
                  } else if (action && typeof action === 'object') {
                    onFireIntent(id, action.intent, 'action', { ...(action.payload || {}), choiceId: opt.id })
                  }
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-slate-800">{opt.label}</span>
                  {opt.description && <span className="block text-[13px] text-slate-500 mt-1 leading-snug">{opt.description}</span>}
                </span>
                <span className={`shrink-0 mt-0.5 text-slate-300 transition-all group-hover:translate-x-0.5 ${danger ? 'group-hover:text-rose-500' : 'group-hover:text-blue-500'}`}>
                  →
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // 6.4 Vector Scenes (Scene)
  if (type === 'Scene') {
    const shapes: Array<SceneShape> = resolvedProps.shapes || []
    const viewBox = resolvedProps.viewBox || '0 0 400 300'
    const width = resolvedProps.width ?? '100%'
    const height = resolvedProps.height ?? 'auto'

    return (
      <div className="border border-slate-200 rounded-lg p-3 bg-white flex justify-center">
        <svg
          viewBox={viewBox}
          width={width}
          height={height}
          className="max-w-full overflow-visible"
          role="img"
          aria-label={resolvedProps.title || 'Interactive vector scene'}
        >
          {shapes.map((shape, idx) => (
            <SceneShapeRenderer
              key={shape.id || idx}
              shape={shape}
              state={state}
              onStateChange={onStateChange}
              onFireIntent={onFireIntent}
            />
          ))}
        </svg>
      </div>
    )
  }

  // Degradation for unknown nodes (§9.3): render children if container
  if (children && children.length > 0) {
    return (
      <div className="space-y-2 border-l-2 border-dashed border-amber-300 pl-2">
        {children.map((child) => (
          <NodeRenderer
            key={child.id}
            node={child}
            state={state}
            onStateChange={onStateChange}
            onFireIntent={onFireIntent}
          />
        ))}
      </div>
    )
  }

  // Degradation for unknown leaf nodes
  return <div className="text-xs text-slate-400 italic">[Unsupported node: {type}]</div>
}

function SceneShapeRenderer({
  shape,
  state,
  onStateChange,
  onFireIntent,
}: {
  shape: SceneShape
  state: Record<string, unknown>
  onStateChange: (path: string, value: unknown) => void
  onFireIntent: (
    nodeId: string,
    intent: string,
    intentClass: 'local' | 'submit' | 'action',
    payload?: unknown,
  ) => void
}) {
  const { kind, id, label, fill, stroke, strokeWidth, opacity, bind, on } = shape

  const rawFill = fill || (kind !== 'line' ? (shape as any).paint : undefined)
  const rawStroke = stroke || (kind === 'line' ? (shape as any).paint || 'neutral' : undefined)
  const fillColor = rawFill ? ((PAINT_ROLES as Record<string, string>)[rawFill] ?? rawFill) : 'none'
  const strokeColor = rawStroke ? ((PAINT_ROLES as Record<string, string>)[rawStroke] ?? rawStroke) : 'none'

  const isInteractive = Boolean(bind?.selected || on?.select)
  const isSelected = bind?.selected && id ? resolveStatePath(state, bind.selected) === id : false

  const handleInteraction = () => {
    if (!isInteractive) return
    if (bind?.selected && id) {
      onStateChange(bind.selected, id)
    }
    if (on?.select && id) {
      onFireIntent(id, on.select, 'local', { shapeId: id, label })
    }
  }

  const commonProps = {
    id,
    opacity,
    style: {
      cursor: isInteractive ? 'pointer' : 'default',
      transition: 'all 0.15s ease',
      transformOrigin: 'center',
    },
    ...(isInteractive
      ? {
          role: 'button',
          tabIndex: 0,
          'aria-label': label || id,
          onClick: handleInteraction,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleInteraction()
            }
          },
        }
      : {}),
  }

  // Highlight selected shape
  const appliedFill = isSelected ? PAINT_ROLES.highlight : fillColor
  const appliedStroke = isSelected ? '#b45309' : strokeColor
  const appliedStrokeWidth = isSelected ? (strokeWidth ?? 1) + 2 : strokeWidth

  if (kind === 'rect') {
    return (
      <rect
        {...commonProps}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx}
        ry={shape.ry}
        fill={appliedFill}
        stroke={appliedStroke}
        strokeWidth={appliedStrokeWidth}
      />
    )
  }

  if (kind === 'circle') {
    return (
      <circle
        {...commonProps}
        cx={shape.cx}
        cy={shape.cy}
        r={isSelected ? shape.r + 2 : shape.r}
        fill={appliedFill}
        stroke={appliedStroke}
        strokeWidth={appliedStrokeWidth}
      />
    )
  }

  if (kind === 'line') {
    return (
      <line
        {...commonProps}
        x1={shape.x1}
        y1={shape.y1}
        x2={shape.x2}
        y2={shape.y2}
        stroke={appliedStroke}
        strokeWidth={appliedStrokeWidth}
      />
    )
  }

  if (kind === 'polygon') {
    return (
      <polygon
        {...commonProps}
        points={shape.points}
        fill={appliedFill}
        stroke={appliedStroke}
        strokeWidth={appliedStrokeWidth}
      />
    )
  }

  if (kind === 'path') {
    return (
      <path
        {...commonProps}
        d={shape.d}
        fill={appliedFill}
        stroke={appliedStroke}
        strokeWidth={appliedStrokeWidth}
      />
    )
  }

  if (kind === 'text') {
    const fontSize =
      shape.sizeRole === 'xs'
        ? 10
        : shape.sizeRole === 'sm'
          ? 12
          : shape.sizeRole === 'lg'
            ? 16
            : 14
    return (
      <text
        {...commonProps}
        x={shape.x}
        y={shape.y}
        fill={appliedFill === 'none' ? '#1e293b' : appliedFill}
        fontSize={fontSize}
        textAnchor="middle"
        dominantBaseline="middle"
        fontWeight="600"
      >
        {shape.text || (shape as any).content}
      </text>
    )
  }

  if (kind === 'group') {
    return (
      <g {...commonProps}>
        {shape.children?.map((c, i) => (
          <SceneShapeRenderer
            key={c.id || i}
            shape={c}
            state={state}
            onStateChange={onStateChange}
            onFireIntent={onFireIntent}
          />
        ))}
      </g>
    )
  }

  return null
}

/**
 * Text Fallback Component (§9.2)
 * For text-only surfaces (CLI, notifications) or accessible degradation.
 */
export function GenerativeUITextFallback({ graph }: { graph: GraphDocument }) {
  return (
    <div className="font-mono text-xs bg-slate-900 text-slate-100 p-4 rounded-lg border border-slate-700">
      <div className="font-bold text-amber-400 mb-1">{graph.title}</div>
      <div className="text-slate-300">{graph.fallbackText}</div>
    </div>
  )
}
