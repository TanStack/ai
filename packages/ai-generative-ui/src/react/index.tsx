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
    return s
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
              const currentVal = resolveStatePath(prev, output)
              if (JSON.stringify(currentVal) !== JSON.stringify(result)) {
                return setStatePath(prev, output, result)
              }
              return prev
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
      className={`open-gen-ui-container font-sans text-slate-800 bg-white border border-slate-200 rounded-xl p-5 shadow-sm max-w-4xl mx-auto ${className}`}
      data-graph-id={graph.graphId}
    >
      <header className="mb-4 pb-3 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{graph.title}</h2>
          <span className="text-xs text-slate-400">Spec v{graph.specVersion} • Rev {graph.revision}</span>
        </div>
      </header>

      <main>
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

  // Resolve bound props from state
  const resolvedProps = { ...props }
  for (const [propKey, statePath] of Object.entries(bind)) {
    const val = resolveStatePath(state, statePath)
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
    return (
      <section className="border border-slate-200 rounded-lg p-4 bg-slate-50/50">
        <h3 className="font-semibold text-slate-800 text-base mb-1">{resolvedProps.title}</h3>
        {resolvedProps.subtitle && <p className="text-xs text-slate-500 mb-3">{resolvedProps.subtitle}</p>}
        <div className="space-y-3 mt-2">
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
    return (
      <div className="space-y-3 pl-2 border-l-2 border-blue-500">
        {children?.map((child, idx) => (
          <div key={child.id} className="relative pl-4">
            <span
              className={`absolute -left-[17px] top-1.5 w-4 h-4 rounded-full border-2 bg-white ${
                idx + 1 <= currentStep ? 'border-blue-600 bg-blue-600' : 'border-slate-300'
              }`}
            />
            <NodeRenderer
              node={child}
              state={state}
              onStateChange={onStateChange}
              onFireIntent={onFireIntent}
              computeRegistry={computeRegistry}
            />
          </div>
        ))}
      </div>
    )
  }

  // 6.2 Content Components
  if (type === 'Text') {
    const variant = resolvedProps.variant || 'body'
    if (variant === 'heading') {
      return <h4 className="font-semibold text-slate-900 text-base">{resolvedProps.content}</h4>
    }
    if (variant === 'caption') {
      return <p className="text-xs text-slate-500">{resolvedProps.content}</p>
    }
    if (variant === 'code') {
      return (
        <pre className="bg-slate-900 text-slate-100 text-xs p-3 rounded-md overflow-x-auto font-mono">
          <code>{resolvedProps.content}</code>
        </pre>
      )
    }
    return <p className="text-sm text-slate-700 whitespace-pre-line">{resolvedProps.content}</p>
  }

  if (type === 'Callout') {
    const tone = resolvedProps.tone || 'info'
    const colors =
      tone === 'warning'
        ? 'bg-amber-50 border-amber-200 text-amber-900'
        : tone === 'danger'
          ? 'bg-red-50 border-red-200 text-red-900'
          : 'bg-blue-50 border-blue-200 text-blue-900'

    return (
      <div className={`p-3.5 rounded-lg border text-sm ${colors}`}>
        {resolvedProps.title && <div className="font-semibold mb-1">{resolvedProps.title}</div>}
        <div>{resolvedProps.text}</div>
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

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-3">
        <div className="text-xs font-medium text-slate-500">{resolvedProps.label}</div>
        <div className={`text-2xl font-bold mt-1 ${toneClass}`}>
          {resolvedProps.value}
          {resolvedProps.unit && <span className="text-xs text-slate-400 font-normal ml-1">{resolvedProps.unit}</span>}
        </div>
        {resolvedProps.delta && (
          <div className="text-xs text-slate-500 mt-1 font-medium">{resolvedProps.delta}</div>
        )}
      </div>
    )
  }

  if (type === 'Table') {
    const columns: Array<{ key: string; label: string }> = (resolvedProps.columns as Array<{ key: string; label: string }>) || []
    const rows: Array<Record<string, unknown>> = (resolvedProps.rows as Array<Record<string, unknown>>) || []

    return (
      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="min-w-full text-xs divide-y divide-slate-200">
          <thead className="bg-slate-50">
            <tr>
              {columns.map((col) => (
                <th key={col.key} className="px-3 py-2 text-left font-semibold text-slate-600">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {rows.map((row, i) => (
              <tr key={i} className="hover:bg-slate-50">
                {columns.map((col) => (
                  <td key={col.key} className="px-3 py-2 text-slate-700">
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

    return (
      <div className="border border-slate-200 rounded-lg p-3 bg-white">
        {resolvedProps.title && <div className="text-xs font-semibold text-slate-600 mb-2">{resolvedProps.title}</div>}
        <div className="h-32 flex items-end gap-3 pt-4">
          {data.map((d, i) => {
            const heightPercent = Math.round((d.value / maxValue) * 100)
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-slate-500 font-medium">{d.value}</span>
                <div
                  className="w-full bg-blue-500 rounded-t transition-all duration-300"
                  style={{ height: `${heightPercent}%` }}
                />
                <span className="text-[10px] text-slate-400">{d.label}</span>
              </div>
            )
          })}
        </div>
      </div>
    )
  }

  if (type === 'Map') {
    const markers: Array<{ id: string; label: string; note?: string }> = resolvedProps.markers || []
    return (
      <div className="border border-slate-200 rounded-lg p-3 bg-slate-50">
        <div className="text-xs font-semibold text-slate-700 mb-2">📍 Geographic Points of Interest</div>
        <div className="grid grid-cols-2 gap-2">
          {markers.map((m) => (
            <div key={m.id} className="p-2 bg-white rounded border border-slate-200 text-xs">
              <div className="font-medium text-slate-800">📌 {m.label}</div>
              {m.note && <div className="text-slate-500 mt-0.5">{m.note}</div>}
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (type === 'Diagram') {
    const hotspots: Array<{ id: string; label: string; explanation: string }> = resolvedProps.hotspots || []
    const selectedPart = bind.selected ? resolveStatePath(state, bind.selected) : undefined

    return (
      <div className="border border-slate-200 rounded-lg p-4 bg-white space-y-3">
        {resolvedProps.title && <h4 className="font-semibold text-slate-800 text-sm">{resolvedProps.title}</h4>}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {hotspots.map((spot) => (
            <button
              key={spot.id}
              type="button"
              className={`p-2.5 rounded text-left border text-xs font-medium transition-colors ${
                selectedPart === spot.id
                  ? 'border-blue-600 bg-blue-50 text-blue-900'
                  : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => {
                if (bind.selected) onStateChange(bind.selected, spot.id)
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

  if (type === 'TextInput') {
    const val = bind.value ? resolveStatePath(state, bind.value) ?? '' : resolvedProps.value ?? ''
    return (
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">{resolvedProps.label}</label>
        <input
          type="text"
          className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder={resolvedProps.placeholder}
          value={val}
          onChange={(e) => {
            if (bind.value) onStateChange(bind.value, e.target.value)
          }}
        />
      </div>
    )
  }

  if (type === 'NumberInput') {
    const val = bind.value ? resolveStatePath(state, bind.value) ?? 0 : resolvedProps.value ?? 0
    return (
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">{resolvedProps.label}</label>
        <input
          type="number"
          className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
          min={resolvedProps.min}
          max={resolvedProps.max}
          step={resolvedProps.step}
          value={val}
          onChange={(e) => {
            const num = parseFloat(e.target.value) || 0
            if (bind.value) onStateChange(bind.value, num)
          }}
        />
      </div>
    )
  }

  if (type === 'Select') {
    const val = bind.value ? resolveStatePath(state, bind.value) ?? '' : resolvedProps.value ?? ''
    const options: Array<{ value: string; label: string }> = resolvedProps.options || []

    return (
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">{resolvedProps.label}</label>
        <select
          className="w-full px-3 py-1.5 text-sm rounded border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          value={val}
          onChange={(e) => {
            if (bind.value) onStateChange(bind.value, e.target.value)
          }}
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
    const val = bind.value ? resolveStatePath(state, bind.value) ?? min : resolvedProps.value ?? min

    return (
      <div>
        <div className="flex justify-between items-center mb-1">
          <label className="text-xs font-medium text-slate-700">{resolvedProps.label}</label>
          <span className="text-xs font-semibold text-blue-600">{val}</span>
        </div>
        <input
          type="range"
          className="w-full accent-blue-600"
          min={min}
          max={max}
          step={step}
          value={val}
          onChange={(e) => {
            const num = parseFloat(e.target.value) || min
            if (bind.value) onStateChange(bind.value, num)
          }}
        />
      </div>
    )
  }

  if (type === 'Stepper') {
    const min = resolvedProps.min ?? 1
    const max = resolvedProps.max ?? 100
    const step = resolvedProps.step ?? 1
    const val = bind.value ? resolveStatePath(state, bind.value) ?? min : resolvedProps.value ?? min

    return (
      <div>
        <label className="block text-xs font-medium text-slate-700 mb-1">{resolvedProps.label}</label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="w-8 h-8 rounded border border-slate-300 bg-slate-50 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            disabled={val <= min}
            onClick={() => {
              const next = Math.max(min, val - step)
              if (bind.value) onStateChange(bind.value, next)
            }}
          >
            -
          </button>
          <span className="text-sm font-semibold w-8 text-center">{val}</span>
          <button
            type="button"
            className="w-8 h-8 rounded border border-slate-300 bg-slate-50 font-bold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            disabled={val >= max}
            onClick={() => {
              const next = Math.min(max, val + step)
              if (bind.value) onStateChange(bind.value, next)
            }}
          >
            +
          </button>
        </div>
      </div>
    )
  }

  if (type === 'Toggle' || type === 'Checkbox') {
    const isChecked = bind.value ? Boolean(resolveStatePath(state, bind.value)) : false

    return (
      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
        <input
          type="checkbox"
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
          checked={isChecked}
          onChange={(e) => {
            if (bind.value) onStateChange(bind.value, e.target.checked)
          }}
        />
        <span>{resolvedProps.label}</span>
      </label>
    )
  }

  if (type === 'Checklist') {
    const items: Array<{ id: string; label: string; defaultDone?: boolean }> = (resolvedProps.items as Array<{ id: string; label: string; defaultDone?: boolean }>) || []
    const rawState = bind.state ? resolveStatePath(state, bind.state) : undefined
    const checklistState = (rawState && typeof rawState === 'object' ? rawState : {}) as Record<string, boolean>

    return (
      <div className="space-y-2">
        {items.map((item) => {
          const isDone = checklistState[item.id] ?? item.defaultDone ?? false
          return (
            <label
              key={item.id}
              className={`flex items-center gap-2 p-2 rounded border text-xs cursor-pointer transition-colors ${
                isDone ? 'bg-slate-50 border-slate-200 line-through text-slate-400' : 'bg-white border-slate-200 text-slate-700'
              }`}
            >
              <input
                type="checkbox"
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                checked={isDone}
                onChange={(e) => {
                  const updated = { ...checklistState, [item.id]: e.target.checked }
                  if (bind.state) onStateChange(bind.state, updated)
                  onFireIntent(id, 'toggleChecklist', 'local', { itemId: item.id, done: e.target.checked })
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
              }
            }
            const intentName = (action as any).intent || (action as any).action || 'click'
            onFireIntent(id, intentName, 'action', (action as any).payload || (action as any).inputs)
          } else {
            onFireIntent(id, 'click', 'action', resolvedProps)
          }
        }}
      >
        {resolvedProps.label}
      </button>
    )
  }

  if (type === 'Choice') {
    const options: Array<{ id: string; label: string; description?: string }> = resolvedProps.options || []

    return (
      <div className="space-y-2">
        {resolvedProps.label && <div className="text-xs font-semibold text-slate-700 mb-1">{resolvedProps.label}</div>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className="p-3 border border-slate-200 rounded-lg text-left bg-white hover:border-blue-500 hover:bg-blue-50/30 transition-all text-xs"
              onClick={() => {
                const action = on.select
                if (typeof action === 'string') {
                  onFireIntent(id, action, 'action', { choiceId: opt.id })
                } else if (action && typeof action === 'object') {
                  onFireIntent(id, action.intent, 'action', { ...(action.payload || {}), choiceId: opt.id })
                }
              }}
            >
              <div className="font-semibold text-slate-800">{opt.label}</div>
              {opt.description && <div className="text-slate-500 mt-1">{opt.description}</div>}
            </button>
          ))}
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
