/**
 * Open Generative UI Specification (Draft 0.1)
 * Host React Renderer with catalog components, state binding, and vector scenes.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react'
import type {
  GraphDocument,
  UINode,
  IntentPayload,
  SceneShape,
  SemanticPaintRole,
} from '../types'
import type { ComputeRegistry } from '../compute'
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
  accent: 'var(--gui-accent)', // blue-600
  muted: 'var(--gui-text-muted)', // slate-400
  danger: 'var(--gui-danger)', // red-500
  neutral: 'var(--gui-text-secondary)', // slate-700
  highlight: 'var(--gui-warning)', // amber-500
  surface: 'var(--gui-surface)',
  none: 'none',
}

function resolveStatePath(obj: unknown, path: string): unknown {
  if (!obj || !path || typeof obj !== 'object') return undefined
  const parts = path.split('.')
  let curr: unknown = obj
  for (const p of parts) {
    if (curr === null || curr === undefined || typeof curr !== 'object')
      return undefined
    curr = (curr as Record<string, unknown>)[p]
  }
  return curr
}

function setStatePath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const parts = path.split('.')
  const copy: Record<string, unknown> = { ...obj }
  let curr: Record<string, unknown> = copy
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i]
    if (!p) continue
    curr[p] =
      curr[p] && typeof curr[p] === 'object'
        ? { ...(curr[p] as Record<string, unknown>) }
        : {}
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
    if (
      resolved !== undefined &&
      resolved !== null &&
      typeof resolved !== 'object'
    ) {
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
  return typeof explicit === 'string' && explicit
    ? explicit
    : `${node.id}.value`
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
    if (resolveStatePath(next, path) === undefined)
      next = setStatePath(next, path, seed)
  }
  // Checklist: seed its state object from each item's defaultDone. Mirrors the
  // renderer's implicit `${id}.state` path and index-based item keys.
  if (node.type === 'Checklist') {
    const statePath =
      (typeof node.bind?.state === 'string' && node.bind.state) ||
      `${node.id}.state`
    const items = node.props?.items
    if (
      Array.isArray(items) &&
      resolveStatePath(next, statePath) === undefined
    ) {
      const checklistState: Record<string, boolean> = {}
      items.forEach((item, idx) => {
        const key =
          item && typeof item === 'object' && typeof item.id === 'string'
            ? item.id
            : String(idx)
        checklistState[key] = Boolean(item?.defaultDone)
      })
      if (Object.keys(checklistState).length > 0)
        next = setStatePath(next, statePath, checklistState)
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
              if (
                result &&
                typeof result === 'object' &&
                !Array.isArray(result)
              ) {
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
    (
      nodeId: string,
      intent: string,
      intentClass: 'local' | 'submit' | 'action',
      payload?: unknown,
    ) => {
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
      className={`open-gen-ui-container text-[var(--gui-text)] bg-[var(--gui-surface)] border border-[var(--gui-border)] rounded-2xl p-6 sm:p-7 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-12px_rgba(15,23,42,0.18)] max-w-4xl mx-auto ${className}`}
      data-graph-id={graph.graphId}
    >
      <header className="mb-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-2xl font-semibold tracking-[-0.02em] text-[var(--gui-text)] leading-tight">
            {graph.title}
          </h2>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-[var(--gui-text-muted)] bg-[var(--gui-surface-muted)] border border-[var(--gui-border)] rounded-full px-2.5 py-1 mt-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--gui-positive-solid)]" />
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

function NodeRenderer({
  node,
  state,
  onStateChange,
  onFireIntent,
  computeRegistry,
}: NodeRendererProps) {
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
    const gapClass =
      resolvedProps.gap === 'sm'
        ? 'gap-2'
        : resolvedProps.gap === 'lg'
          ? 'gap-6'
          : 'gap-4'
    return (
      <div
        className={`flex ${isHorizontal ? 'flex-row' : 'flex-col'} ${gapClass}`}
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
      </div>
    )
  }

  if (type === 'Columns') {
    const count = resolvedProps.count ?? 2
    const gridCols =
      count === 4 ? 'grid-cols-4' : count === 3 ? 'grid-cols-3' : 'grid-cols-2'
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
    const titleProp =
      resolvedProps.title ?? resolvedProps.label ?? resolvedProps.heading
    const rawTitle = typeof titleProp === 'string' ? titleProp : ''
    const recommended =
      resolvedProps.highlighted === true ||
      /\(?\s*recommended\s*\)?/i.test(rawTitle)
    const cleanTitle = rawTitle
      .replace(/\s*\(?\s*recommended\s*\)?/i, '')
      .trim()
    return (
      <section
        className={`relative rounded-xl border p-5 h-full transition-shadow ${
          recommended
            ? 'border-[var(--gui-accent-border)] bg-gradient-to-b from-[var(--gui-accent-surface)] to-[var(--gui-surface)] ring-1 ring-[var(--gui-accent-ring)] shadow-[0_8px_24px_-12px_rgba(37,99,235,0.35)]'
            : 'border-[var(--gui-border)] bg-[var(--gui-surface-sunken)]'
        }`}
      >
        {(cleanTitle || recommended) && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {cleanTitle && (
              <h3 className="font-semibold text-[var(--gui-text)] text-[15px] tracking-[-0.01em]">
                {cleanTitle}
              </h3>
            )}
            {recommended && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.06em] text-[var(--gui-accent-strong)] bg-[var(--gui-accent-surface)] rounded-full px-2 py-0.5">
                ★ Recommended
              </span>
            )}
          </div>
        )}
        {resolvedProps.subtitle && (
          <p className="text-[13px] text-[var(--gui-text-muted)] mt-0.5 mb-1">
            {resolvedProps.subtitle}
          </p>
        )}
        <div
          className={`space-y-3 ${cleanTitle || recommended || resolvedProps.subtitle ? 'mt-4' : ''}`}
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
        </div>
      </section>
    )
  }

  if (type === 'Tabs') {
    const tabs: Array<{ id: string; label: string }> = resolvedProps.tabs || []
    const tabKey = bind.tab || `_tab_${id}`
    const activeTab =
      (resolveStatePath(state, tabKey) as string) ||
      resolvedProps.defaultTab ||
      tabs[0]?.id

    return (
      <div className="space-y-3">
        <div className="flex border-b border-[var(--gui-border)] gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`py-1.5 px-3 font-medium text-sm border-b-2 -mb-px transition-colors cursor-pointer ${
                activeTab === t.id
                  ? 'border-[var(--gui-accent)] text-[var(--gui-accent)] font-semibold'
                  : 'border-transparent text-[var(--gui-text-muted)] hover:text-[var(--gui-text)]'
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
            ?.filter(
              (child) => !child.props?.tabId || child.props.tabId === activeTab,
            )
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
                  className={`absolute left-[13px] top-7 bottom-0 w-0.5 ${done ? 'bg-[var(--gui-accent)]' : 'bg-[var(--gui-surface-muted)]'}`}
                />
              )}
              <span
                className={`relative z-10 shrink-0 w-[27px] h-[27px] rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-colors ${
                  done
                    ? 'bg-[var(--gui-accent)] border-[var(--gui-accent)] text-[var(--gui-on-accent)]'
                    : current
                      ? 'bg-[var(--gui-surface)] border-[var(--gui-accent)] text-[var(--gui-accent)] ring-4 ring-[var(--gui-accent-ring)]'
                      : 'bg-[var(--gui-surface)] border-[var(--gui-border)] text-[var(--gui-text-muted)]'
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
      return (
        <h4 className="font-semibold text-[var(--gui-text)] text-[15px] tracking-[-0.01em]">
          {content}
        </h4>
      )
    }
    if (variant === 'caption') {
      return <p className="text-xs text-[var(--gui-text-muted)]">{content}</p>
    }
    if (variant === 'code') {
      return (
        <pre className="bg-[var(--gui-surface-inverse)] text-[var(--gui-text-on-inverse)] text-xs p-3.5 rounded-lg overflow-x-auto font-mono leading-relaxed">
          <code>{content}</code>
        </pre>
      )
    }
    return (
      <p className="text-sm text-[var(--gui-text-secondary)] whitespace-pre-line leading-relaxed">
        {content}
      </p>
    )
  }

  if (type === 'Callout') {
    const tone = resolvedProps.tone || 'info'
    const colors =
      tone === 'warning'
        ? 'bg-[var(--gui-warning-surface)] border-[var(--gui-warning-border)] text-[var(--gui-warning)]'
        : tone === 'danger'
          ? 'bg-[var(--gui-danger-surface)] border-[var(--gui-danger-border)] text-[var(--gui-danger)]'
          : tone === 'success'
            ? 'bg-[var(--gui-positive-surface)] border-[var(--gui-positive-border)] text-[var(--gui-positive)]'
            : 'bg-[var(--gui-accent-surface)] border-[var(--gui-accent-border)] text-[var(--gui-accent-strong)]'
    const accent =
      tone === 'warning'
        ? 'bg-[var(--gui-warning)]'
        : tone === 'danger'
          ? 'bg-[var(--gui-danger-solid)]'
          : tone === 'success'
            ? 'bg-[var(--gui-positive-solid)]'
            : 'bg-[var(--gui-accent)]'
    const icon =
      tone === 'warning'
        ? '!'
        : tone === 'danger'
          ? '✕'
          : tone === 'success'
            ? '✓'
            : 'i'

    return (
      <div
        className={`relative flex gap-3 p-4 pl-5 rounded-xl border text-sm overflow-hidden ${colors}`}
      >
        <span className={`absolute left-0 top-0 bottom-0 w-1 ${accent}`} />
        <span
          className={`shrink-0 w-5 h-5 rounded-full ${accent} text-[var(--gui-on-accent)] text-[11px] font-bold flex items-center justify-center mt-0.5`}
        >
          {icon}
        </span>
        <div className="min-w-0">
          {resolvedProps.title && (
            <div className="font-semibold mb-0.5">{resolvedProps.title}</div>
          )}
          <div className="text-[13px] leading-relaxed opacity-90">
            {resolvedProps.text ?? resolvedProps.content ?? resolvedProps.body}
          </div>
        </div>
      </div>
    )
  }

  if (type === 'Metric') {
    const toneClass =
      resolvedProps.tone === 'positive'
        ? 'text-[var(--gui-positive)]'
        : resolvedProps.tone === 'negative'
          ? 'text-[var(--gui-danger)]'
          : 'text-[var(--gui-text)]'
    const deltaStr =
      resolvedProps.delta != null ? String(resolvedProps.delta).trim() : ''
    const deltaUp = deltaStr.startsWith('+')
    const deltaDown = deltaStr.startsWith('-')
    const deltaClass = deltaUp
      ? 'text-[var(--gui-positive)] bg-[var(--gui-positive-surface)] border-[var(--gui-positive-border)]'
      : deltaDown
        ? 'text-[var(--gui-danger)] bg-[var(--gui-danger-surface)] border-[var(--gui-danger-border)]'
        : 'text-[var(--gui-text-muted)] bg-[var(--gui-surface-sunken)] border-[var(--gui-border)]'

    const metricValue = resolveDisplayValue(
      resolvedProps.value ?? resolvedProps.content ?? resolvedProps.text,
      state,
    )
    const hasValue =
      metricValue !== undefined && metricValue !== null && metricValue !== ''
    return (
      <div className="bg-[var(--gui-surface)] border border-[var(--gui-border)] rounded-xl p-4 flex flex-col gap-1.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--gui-text-muted)]">
          {resolvedProps.label}
        </div>
        <div
          className={`text-[28px] leading-none font-semibold tracking-[-0.02em] tabular-nums ${hasValue ? toneClass : 'text-[var(--gui-text-faint)]'}`}
        >
          {hasValue ? metricValue : '—'}
          {hasValue && resolvedProps.unit && (
            <span className="text-sm text-[var(--gui-text-muted)] font-normal ml-1 tracking-normal">
              {resolvedProps.unit}
            </span>
          )}
        </div>
        {deltaStr && (
          <div className="mt-0.5">
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold rounded-md border px-1.5 py-0.5 tabular-nums ${deltaClass}`}
            >
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
    // Bounded repair (§9.3): accept the catalog shape {key,label} as well as the
    // common model drifts toward TanStack/HTML naming (accessor/accessorKey/field,
    // header/title) so a live graph still renders rather than showing an empty shell.
    const rawColumns =
      (resolvedProps.columns as Array<Record<string, unknown>>) || []
    const columns: Array<{ key: string; label: string }> = rawColumns.map(
      (c) => {
        const key = String(
          c.key ??
            c.accessor ??
            c.accessorKey ??
            c.field ??
            c.dataIndex ??
            c.label ??
            c.header ??
            '',
        )
        const label = String(c.label ?? c.header ?? c.title ?? c.name ?? key)
        return { key, label }
      },
    )
    const rows: Array<Record<string, unknown>> =
      (resolvedProps.rows as Array<Record<string, unknown>>) ||
      (resolvedProps.data as Array<Record<string, unknown>>) ||
      (resolvedProps.items as Array<Record<string, unknown>>) ||
      []

    return (
      <div className="overflow-x-auto border border-[var(--gui-border)] rounded-xl">
        <table className="min-w-full text-[13px] border-collapse">
          <thead>
            <tr className="bg-[var(--gui-surface-sunken)] border-b border-[var(--gui-border)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-2.5 text-left font-semibold text-[11px] uppercase tracking-[0.05em] text-[var(--gui-text-muted)]"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className="border-b border-[var(--gui-border-subtle)] last:border-0 hover:bg-[var(--gui-accent-surface)] transition-colors"
              >
                {columns.map((col, ci) => (
                  <td
                    key={col.key}
                    className={`px-4 py-2.5 tabular-nums ${ci === 0 ? 'font-medium text-[var(--gui-text)]' : 'text-[var(--gui-text-secondary)]'}`}
                  >
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
          const subtitle =
            typeof item === 'object' && item !== null
              ? (item as any)?.subtitle
              : undefined
          return (
            <div
              key={idx}
              className="flex gap-2 text-sm text-[var(--gui-text-secondary)] items-start"
            >
              <span className="font-semibold text-[var(--gui-text-muted)]">
                {isOrdered ? `${idx + 1}.` : '•'}
              </span>
              <div>
                <div>{text}</div>
                {subtitle && (
                  <div className="text-xs text-[var(--gui-text-muted)]">
                    {subtitle}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  if (type === 'Chart') {
    const data: Array<{ label: string; value: number }> =
      resolvedProps.data || []
    const maxValue = Math.max(...data.map((d) => d.value), 1)
    const PLOT_HEIGHT = 156

    return (
      <figure className="rounded-xl border border-[var(--gui-border)] bg-[var(--gui-surface)] p-4 m-0">
        {resolvedProps.title && (
          <figcaption className="text-[11px] font-semibold text-[var(--gui-text-muted)] uppercase tracking-[0.08em] mb-4">
            {resolvedProps.title}
          </figcaption>
        )}
        <div className="flex items-end gap-2.5" style={{ height: PLOT_HEIGHT }}>
          {data.map((d, i) => {
            const barHeight = Math.max(
              4,
              Math.round((d.value / maxValue) * (PLOT_HEIGHT - 24)),
            )
            return (
              <div
                key={i}
                className="group flex-1 h-full flex flex-col justify-end items-center gap-1.5"
              >
                <span className="text-[11px] font-semibold text-[var(--gui-text-secondary)] tabular-nums transition-colors group-hover:text-[var(--gui-accent)]">
                  {d.value}
                </span>
                <div
                  className="w-full max-w-[44px] rounded-md bg-gradient-to-t from-[var(--gui-accent)] to-[var(--gui-accent-2)] shadow-[0_1px_2px_rgba(37,99,235,0.3)] transition-all duration-300 ease-out group-hover:from-[var(--gui-accent-strong)] group-hover:to-[var(--gui-accent-2)]"
                  style={{ height: barHeight }}
                />
              </div>
            )
          })}
        </div>
        <div className="flex gap-2.5 mt-2.5 pt-2.5 border-t border-[var(--gui-border-subtle)]">
          {data.map((d, i) => (
            <span
              key={i}
              className="flex-1 text-center text-[11px] text-[var(--gui-text-muted)] font-medium truncate"
            >
              {d.label}
            </span>
          ))}
        </div>
      </figure>
    )
  }

  if (type === 'Map') {
    const markers: Array<{
      id: string
      label: string
      note?: string
      lat?: number
      lng?: number
    }> = resolvedProps.markers || []
    const geoMarkers = markers.filter(
      (m) => typeof m.lat === 'number' && typeof m.lng === 'number',
    )
    const selectedMarker = bind.selected
      ? resolveStatePath(state, bind.selected)
      : undefined

    const selectMarker = (m: { id: string; label: string }) => {
      if (bind.selected) onStateChange(bind.selected, m.id)
      onFireIntent(id, 'selectStop', 'local', { stopId: m.id, label: m.label })
    }

    // Project lat/lng into an SVG viewport when we have real coordinates.
    const W = 560
    const H = 280
    const PAD = 42
    let projected: Array<{
      m: (typeof markers)[number]
      x: number
      y: number
    }> = []
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
        x: PAD + (((m.lng as number) - minLng) / lngSpan) * (W - 2 * PAD),
        y: PAD + ((maxLat - (m.lat as number)) / latSpan) * (H - 2 * PAD),
      }))
    }
    const routeD = projected
      .map(
        (p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`,
      )
      .join(' ')

    return (
      <div className="rounded-xl border border-[var(--gui-border)] bg-[var(--gui-surface)] overflow-hidden">
        {projected.length > 0 ? (
          <div className="relative bg-[var(--gui-surface-muted)]">
            <svg
              viewBox={`0 0 ${W} ${H}`}
              className="w-full block"
              role="img"
              aria-label={resolvedProps.title || 'Route map'}
            >
              <defs>
                <pattern
                  id={`grid-${id}`}
                  width="28"
                  height="28"
                  patternUnits="userSpaceOnUse"
                >
                  <path
                    d="M 28 0 L 0 0 0 28"
                    fill="none"
                    stroke="var(--gui-border)"
                    strokeWidth="1"
                  />
                </pattern>
                <linearGradient id={`land-${id}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--gui-surface-sunken)" />
                  <stop offset="100%" stopColor="var(--gui-surface-muted)" />
                </linearGradient>
              </defs>
              <rect width={W} height={H} fill={`url(#land-${id})`} />
              <rect width={W} height={H} fill={`url(#grid-${id})`} />
              {routeD && (
                <path
                  d={routeD}
                  fill="none"
                  stroke="var(--gui-accent)"
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
                    <circle
                      r={isSel ? 15 : 12}
                      fill="var(--gui-accent)"
                      opacity={isSel ? 0.18 : 0.1}
                    />
                    <circle
                      r={isSel ? 11 : 9}
                      fill={
                        isSel ? 'var(--gui-accent-strong)' : 'var(--gui-accent)'
                      }
                      stroke="var(--gui-surface)"
                      strokeWidth="2.5"
                    />
                    <text
                      y="1"
                      fill="var(--gui-on-accent)"
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
            <div className="absolute top-2.5 left-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--gui-text-muted)] bg-[var(--gui-surface)] backdrop-blur-sm rounded-md px-2 py-1 border border-[var(--gui-border)]">
              {resolvedProps.title || 'Route Map'}
            </div>
          </div>
        ) : null}
        <div className="divide-y divide-[var(--gui-border-subtle)]">
          {markers.map((m, i) => {
            const isSel = selectedMarker === m.id
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => selectMarker(m)}
                className={`w-full flex items-start gap-3 text-left px-4 py-2.5 transition-colors ${
                  isSel
                    ? 'bg-[var(--gui-accent-surface)]'
                    : 'hover:bg-[var(--gui-surface-sunken)]'
                }`}
              >
                <span
                  className={`shrink-0 mt-0.5 w-5 h-5 rounded-full text-[11px] font-bold text-[var(--gui-on-accent)] flex items-center justify-center ${
                    isSel
                      ? 'bg-[var(--gui-accent-strong)]'
                      : 'bg-[var(--gui-accent)]'
                  }`}
                >
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-[var(--gui-text)]">
                    {m.label}
                  </span>
                  {m.note && (
                    <span className="block text-xs text-[var(--gui-text-muted)] mt-0.5">
                      {m.note}
                    </span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  if (type === 'Diagram') {
    const hotspots: Array<{ id: string; label: string; explanation: string }> =
      resolvedProps.hotspots || []
    const selectedPath =
      (typeof bind.selected === 'string' && bind.selected) || `${id}.selected`
    const selectedPart = resolveStatePath(state, selectedPath)

    return (
      <div className="border border-[var(--gui-border)] rounded-xl p-4 bg-[var(--gui-surface)] space-y-3">
        {resolvedProps.title && (
          <h4 className="font-semibold text-[var(--gui-text)] text-sm">
            {resolvedProps.title}
          </h4>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {hotspots.map((spot) => (
            <button
              key={spot.id}
              type="button"
              className={`p-2.5 rounded-lg text-left border text-xs font-medium transition-colors ${
                selectedPart === spot.id
                  ? 'border-[var(--gui-accent)] bg-[var(--gui-accent-surface)] text-[var(--gui-accent-strong)]'
                  : 'border-[var(--gui-border)] bg-[var(--gui-surface-sunken)] text-[var(--gui-text-secondary)] hover:bg-[var(--gui-surface-muted)]'
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
          <div className="p-3 bg-[var(--gui-surface-sunken)] rounded border border-[var(--gui-border)] text-xs text-[var(--gui-text-secondary)]">
            <strong>
              {hotspots.find((h) => h.id === selectedPart)?.label}:
            </strong>{' '}
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
          className="w-full py-2 px-4 rounded-lg bg-[var(--gui-accent)] text-[var(--gui-on-accent)] font-medium text-sm hover:bg-[var(--gui-accent-strong)] transition-colors shadow-sm"
        >
          {resolvedProps.submitLabel || 'Submit'}
        </button>
      </form>
    )
  }

  const inputClass =
    'w-full px-3.5 py-2 text-sm rounded-lg border border-[var(--gui-border)] bg-[var(--gui-surface)] text-[var(--gui-text)] focus:outline-none focus:ring-2 focus:ring-[var(--gui-accent-ring)] focus:border-[var(--gui-accent-border)] transition-shadow'
  const labelClass =
    'block text-[13px] font-medium text-[var(--gui-text-secondary)] mb-1.5'

  if (type === 'TextInput') {
    const vp = valueBindPath(node)
    const val = (resolveStatePath(state, vp) ??
      resolvedProps.value ??
      '') as string
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
    const val = (resolveStatePath(state, vp) ??
      resolvedProps.value ??
      0) as number
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
    const val = (resolveStatePath(state, vp) ??
      resolvedProps.value ??
      '') as string
    const options: Array<{ value: string; label: string }> =
      resolvedProps.options || []

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
    const val = (resolveStatePath(state, vp) ??
      resolvedProps.value ??
      min) as number
    const pct = max > min ? ((Number(val) - min) / (max - min)) * 100 : 0

    return (
      <div>
        <div className="flex justify-between items-center mb-2">
          <label className="text-[13px] font-medium text-[var(--gui-text-secondary)]">
            {resolvedProps.label}
          </label>
          <span className="text-[13px] font-semibold text-[var(--gui-accent)] tabular-nums bg-[var(--gui-accent-surface)] rounded-md px-2 py-0.5">
            {val}
          </span>
        </div>
        <input
          type="range"
          className="w-full accent-blue-600 cursor-pointer"
          style={{
            background: `linear-gradient(to right, var(--gui-accent) ${pct}%, var(--gui-border) ${pct}%)`,
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
    const val = (resolveStatePath(state, vp) ??
      resolvedProps.value ??
      min) as number
    const stepBtn =
      'w-9 h-9 rounded-lg border border-[var(--gui-border)] bg-[var(--gui-surface)] text-lg font-semibold text-[var(--gui-text-secondary)] flex items-center justify-center hover:bg-[var(--gui-surface-sunken)] hover:border-[var(--gui-border)] active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100'

    return (
      <div>
        <label className={labelClass}>{resolvedProps.label}</label>
        <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--gui-border)] bg-[var(--gui-surface-sunken)] p-1">
          <button
            type="button"
            className={stepBtn}
            disabled={val <= min}
            onClick={() => onStateChange(vp, Math.max(min, Number(val) - step))}
          >
            −
          </button>
          <span className="text-base font-semibold w-10 text-center tabular-nums text-[var(--gui-text)]">
            {val}
          </span>
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
      <label className="flex items-center gap-2.5 text-sm text-[var(--gui-text-secondary)] cursor-pointer select-none">
        <input
          type="checkbox"
          className="rounded border-[var(--gui-border)] text-[var(--gui-accent)] focus:ring-[var(--gui-accent-ring)] w-4 h-4 cursor-pointer"
          checked={isChecked}
          onChange={(e) => onStateChange(vp, e.target.checked)}
        />
        <span>{resolvedProps.label}</span>
      </label>
    )
  }

  if (type === 'Checklist') {
    const items: Array<{ id?: string; label: string; defaultDone?: boolean }> =
      (resolvedProps.items as Array<{
        id?: string
        label: string
        defaultDone?: boolean
      }>) || []
    // Fall back to an implicit state path and index-based item keys so a live
    // model that omits bind.state and item ids still gets working checkboxes.
    const statePath =
      (typeof bind.state === 'string' && bind.state) || `${id}.state`
    const rawState = resolveStatePath(state, statePath)
    const checklistState = (
      rawState && typeof rawState === 'object' ? rawState : {}
    ) as Record<string, boolean>

    return (
      <div className="space-y-2">
        {items.map((item, idx) => {
          const itemKey = item.id ?? String(idx)
          const isDone = checklistState[itemKey] ?? item.defaultDone ?? false
          return (
            <label
              key={itemKey}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg border text-[13px] cursor-pointer transition-colors ${
                isDone
                  ? 'bg-[var(--gui-surface-sunken)] border-[var(--gui-border)] line-through text-[var(--gui-text-muted)]'
                  : 'bg-[var(--gui-surface)] border-[var(--gui-border)] text-[var(--gui-text-secondary)] hover:border-[var(--gui-border)]'
              }`}
            >
              <input
                type="checkbox"
                className="w-4 h-4 rounded border-[var(--gui-border)] text-[var(--gui-accent)] focus:ring-[var(--gui-accent-ring)]"
                checked={isDone}
                onChange={(e) => {
                  const updated = {
                    ...checklistState,
                    [itemKey]: e.target.checked,
                  }
                  onStateChange(statePath, updated)
                  onFireIntent(id, 'toggleChecklist', 'local', {
                    itemId: itemKey,
                    done: e.target.checked,
                  })
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
        ? 'bg-[var(--gui-danger)] text-[var(--gui-on-accent)] hover:bg-[var(--gui-danger-strong)] active:bg-[var(--gui-danger-strong)]'
        : tone === 'secondary'
          ? 'bg-[var(--gui-surface-muted)] text-[var(--gui-text)] border border-[var(--gui-border)] hover:bg-[var(--gui-surface-muted)] active:bg-[var(--gui-border)]'
          : 'bg-[var(--gui-accent)] text-[var(--gui-on-accent)] hover:bg-[var(--gui-accent-strong)] active:bg-[var(--gui-accent-strong)]'

    return (
      <button
        type="button"
        disabled={resolvedProps.disabled}
        className={`px-4 py-2 rounded-lg font-medium text-xs transition-all shadow-sm cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${btnClass} ${
          isSelected
            ? 'ring-2 ring-[var(--gui-accent-ring)] ring-offset-2 font-bold'
            : ''
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
                resolvedInputs[inKey] =
                  typeof stateKey === 'string'
                    ? (resolveStatePath(state, stateKey) ?? stateKey)
                    : stateKey
              }
              const result = computeRegistry.execute(
                compName,
                resolvedInputs,
                state,
              )
              if (result !== undefined) {
                onStateChange(output, result)
                if (
                  result &&
                  typeof result === 'object' &&
                  !Array.isArray(result)
                ) {
                  for (const [k, v] of Object.entries(result))
                    onStateChange(k, v)
                }
              }
            }
            const intentName =
              (action as any).intent || (action as any).action || 'click'
            onFireIntent(
              id,
              intentName,
              'action',
              (action as any).payload || (action as any).inputs,
            )
          } else {
            onFireIntent(id, 'click', 'action', resolvedProps)
          }
        }}
      >
        {resolvedProps.label ??
          resolvedProps.text ??
          resolvedProps.title ??
          resolvedProps.content ??
          'Continue'}
      </button>
    )
  }

  if (type === 'Choice') {
    const options: Array<{
      id: string
      label: string
      description?: string
      tone?: string
    }> = resolvedProps.options || []

    return (
      <div className="space-y-2">
        {resolvedProps.label && (
          <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-[var(--gui-text-muted)] mb-1">
            {resolvedProps.label}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {options.map((opt) => {
            const danger =
              opt.tone === 'danger' ||
              /reject|cancel|abort|decline|deny/i.test(opt.id + ' ' + opt.label)
            return (
              <button
                key={opt.id}
                type="button"
                className={`group relative flex items-start gap-3 p-4 border rounded-xl text-left bg-[var(--gui-surface)] transition-all duration-150 hover:-translate-y-px ${
                  danger
                    ? 'border-[var(--gui-border)] hover:border-[var(--gui-danger-border)] hover:bg-[var(--gui-danger-surface)] hover:shadow-[0_4px_14px_-6px_rgba(244,63,94,0.4)]'
                    : 'border-[var(--gui-border)] hover:border-[var(--gui-accent-border)] hover:bg-[var(--gui-accent-surface)] hover:shadow-[0_4px_14px_-6px_rgba(37,99,235,0.4)]'
                }`}
                onClick={() => {
                  const action = on.select
                  if (typeof action === 'string') {
                    onFireIntent(id, action, 'action', { choiceId: opt.id })
                  } else if (action && typeof action === 'object') {
                    onFireIntent(id, action.intent, 'action', {
                      ...(action.payload || {}),
                      choiceId: opt.id,
                    })
                  }
                }}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-[var(--gui-text)]">
                    {opt.label}
                  </span>
                  {opt.description && (
                    <span className="block text-[13px] text-[var(--gui-text-muted)] mt-1 leading-snug">
                      {opt.description}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 mt-0.5 text-[var(--gui-text-faint)] transition-all group-hover:translate-x-0.5 ${danger ? 'group-hover:text-[var(--gui-danger)]' : 'group-hover:text-[var(--gui-accent)]'}`}
                >
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
      <div className="border border-[var(--gui-border)] rounded-lg p-3 bg-[var(--gui-surface)] flex justify-center">
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
      <div className="space-y-2 border-l-2 border-dashed border-[var(--gui-warning-border)] pl-2">
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

  // 6.5 Escape hatch — sandboxed custom widget (research prototype).
  if (type === 'Widget') {
    return (
      <WidgetRenderer
        nodeId={id}
        props={resolvedProps}
        state={state}
        onStateChange={onStateChange}
        onFireIntent={onFireIntent}
        computeRegistry={computeRegistry ?? defaultComputeRegistry}
      />
    )
  }

  // Degradation for unknown leaf nodes
  return (
    <div className="text-xs text-[var(--gui-text-muted)] italic">
      [Unsupported node: {type}]
    </div>
  )
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
  const { kind, id, label, fill, stroke, strokeWidth, opacity, bind, on } =
    shape

  const rawFill = fill || (kind !== 'line' ? (shape as any).paint : undefined)
  const rawStroke =
    stroke || (kind === 'line' ? (shape as any).paint || 'neutral' : undefined)
  const fillColor = rawFill
    ? ((PAINT_ROLES as Record<string, string>)[rawFill] ?? rawFill)
    : 'none'
  const strokeColor = rawStroke
    ? ((PAINT_ROLES as Record<string, string>)[rawStroke] ?? rawStroke)
    : 'none'

  const isInteractive = Boolean(bind?.selected || on?.select)
  const isSelected =
    bind?.selected && id ? resolveStatePath(state, bind.selected) === id : false

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
  const appliedStroke = isSelected ? 'var(--gui-warning)' : strokeColor
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
        fill={appliedFill === 'none' ? 'var(--gui-text)' : appliedFill}
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
 * Sandboxed custom-widget renderer (spec escape-hatch tier, §11 / §15.3).
 *
 * The widget runs in a sandboxed iframe (`allow-scripts`, NO `allow-same-origin`
 * → opaque origin, no access to the host DOM/cookies/storage). It may draw
 * ANYTHING, but the three things that matter stay host-side, reached only over a
 * narrow postMessage bridge: deterministic compute (the registry — the widget
 * cannot author arithmetic), local state (the host owns it), and intents (§8,
 * routed through the host). The widget has no network and no generic host access.
 * Theme tokens (§9.5) are injected so it blends into the host surface.
 */
const BRIDGE_TOKENS = [
  '--gui-surface',
  '--gui-surface-sunken',
  '--gui-surface-muted',
  '--gui-text',
  '--gui-text-secondary',
  '--gui-text-muted',
  '--gui-border',
  '--gui-accent',
  '--gui-accent-strong',
  '--gui-accent-surface',
  '--gui-on-accent',
  '--gui-positive',
  '--gui-danger',
]

function WidgetRenderer({
  nodeId,
  props,
  state,
  onStateChange,
  onFireIntent,
  computeRegistry,
}: {
  nodeId: string
  props: Record<string, any>
  state: Record<string, unknown>
  onStateChange: (path: string, value: unknown) => void
  onFireIntent: (
    nodeId: string,
    intent: string,
    intentClass: 'local' | 'submit' | 'action',
    payload?: unknown,
  ) => void
  computeRegistry: ComputeRegistry
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null)
  // Keep the latest state/handlers available to async bridge callbacks without
  // re-subscribing the message listener on every render.
  const stateRef = useRef(state)
  stateRef.current = state

  const rawSrcdoc = typeof props.srcdoc === 'string' ? props.srcdoc : ''
  const height = typeof props.height === 'number' ? props.height : 340

  // `sandbox="allow-scripts"` isolates DOM/storage but does NOT block the
  // network — the widget could still fetch() out. The host enforces "no phone
  // home" by injecting a CSP: default-src 'none' (so connect-src falls through
  // to none → no network), with inline script/style allowed for a self-contained
  // widget. The ONLY channel out is the postMessage bridge the host controls.
  const CSP =
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ` +
    `script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:;">`
  const srcdoc = rawSrcdoc.includes('<head>')
    ? rawSrcdoc.replace('<head>', `<head>${CSP}`)
    : `<head>${CSP}</head>${rawSrcdoc}`

  function readThemeTokens(): Record<string, string> {
    const el = iframeRef.current
    const out: Record<string, string> = {}
    if (!el) return out
    const cs = getComputedStyle(el)
    for (const name of BRIDGE_TOKENS)
      out[name] = cs.getPropertyValue(name).trim()
    return out
  }

  useEffect(() => {
    function handleMessage(e: MessageEvent) {
      const el = iframeRef.current
      // Only trust messages from THIS widget's sandboxed frame.
      if (!el || e.source !== el.contentWindow) return
      const m = e.data
      if (!m || typeof m !== 'object') return
      const post = (msg: unknown) => el.contentWindow?.postMessage(msg, '*')

      switch (m.type) {
        case 'gui:ready':
          post({ type: 'gui:theme', tokens: readThemeTokens() })
          post({ type: 'gui:state', state: stateRef.current })
          break
        case 'gui:compute':
          post({
            type: 'gui:compute:result',
            id: m.id,
            result: computeRegistry.execute(
              m.name,
              m.inputs ?? {},
              stateRef.current,
            ),
          })
          break
        case 'gui:getState':
          post({
            type: 'gui:getState:result',
            id: m.id,
            result: resolveStatePath(stateRef.current, m.path),
          })
          break
        case 'gui:setState':
          if (typeof m.path === 'string') onStateChange(m.path, m.value)
          break
        case 'gui:intent':
          onFireIntent(
            nodeId,
            typeof m.intent === 'string' ? m.intent : 'widgetIntent',
            m.intentClass === 'local' || m.intentClass === 'submit'
              ? m.intentClass
              : 'action',
            m.payload,
          )
          break
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [nodeId, computeRegistry, onStateChange, onFireIntent])

  // Push a fresh state snapshot when host state changes elsewhere.
  useEffect(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: 'gui:state', state },
      '*',
    )
  }, [state])

  return (
    <iframe
      ref={iframeRef}
      title={typeof props.title === 'string' ? props.title : 'Custom widget'}
      srcDoc={srcdoc}
      sandbox="allow-scripts"
      style={{
        width: '100%',
        height,
        border: '1px solid var(--gui-border)',
        borderRadius: 12,
        background: 'transparent',
        display: 'block',
      }}
    />
  )
}

/**
 * Text Fallback Component (§9.2)
 * For text-only surfaces (CLI, notifications) or accessible degradation.
 */
export function GenerativeUITextFallback({ graph }: { graph: GraphDocument }) {
  return (
    <div className="font-mono text-xs bg-[var(--gui-surface-inverse)] text-[var(--gui-text-on-inverse)] p-4 rounded-lg border border-[var(--gui-border)]">
      <div className="font-bold text-[var(--gui-warning)] mb-1">
        {graph.title}
      </div>
      <div className="text-[var(--gui-text-faint)]">{graph.fallbackText}</div>
    </div>
  )
}
