import { useMemo, useState } from 'react'
import {
  A2uiSurfaceStore,
  GenerativeUIRenderer,
  type Diagnostic,
  type IntentPayload,
} from '@tanstack/ai-generative-ui'

/**
 * A2UI as a parallel ingress (addendum). This surface makes the claim visible:
 * the A2UI v0.9 operations on the left are translated by `A2uiSurfaceStore`
 * into an OGUI graph and rendered by the SAME `GenerativeUIRenderer` the Chat
 * surface uses — no second renderer, no live model. The progressive scenario
 * streams `updateDataModel` ops one at a time so you can watch bindings resolve
 * and the revision bump, exactly as an A2UI agent would stream them.
 */

type Op = Record<string, unknown>

interface Scenario {
  id: string
  label: string
  blurb: string
  surfaceId: string
  /** Applied immediately when the scenario loads. */
  setup: Array<Op>
  /** Applied one at a time by the "push next update" button. */
  stream?: Array<{ note: string; op: Op }>
}

const FLIGHT_COMPONENTS = [
  { id: 'card', component: 'Card', child: 'col' },
  {
    id: 'col',
    component: 'Column',
    children: ['title', 'route', 'meta', 'book'],
  },
  { id: 'title', component: 'Text', text: 'Flight Details', usageHint: 'h3' },
  { id: 'route', component: 'Row', children: ['from', 'to'] },
  { id: 'from', component: 'Text', text: { path: '/origin' }, usageHint: 'h4' },
  {
    id: 'to',
    component: 'Text',
    text: { path: '/destination' },
    usageHint: 'h4',
  },
  {
    id: 'meta',
    component: 'Text',
    text: { path: '/airline' },
    usageHint: 'caption',
  },
  {
    id: 'book',
    component: 'Button',
    child: 'bookLabel',
    variant: 'primary',
    action: { event: { name: 'book_flight', context: { flightId: 'UA123' } } },
  },
  { id: 'bookLabel', component: 'Text', text: 'Book this flight' },
]

const SCENARIOS: Array<Scenario> = [
  {
    id: 'flight',
    label: 'Flight card',
    blurb:
      'CopilotKit’s canonical fixed-schema card. createSurface + updateComponents + a single updateDataModel, bindings resolved, the Button wired to a book_flight action.',
    surfaceId: 'flight-1',
    setup: [
      {
        version: 'v0.9',
        createSurface: {
          surfaceId: 'flight-1',
          catalogId: 'copilotkit://app-dashboard-catalog',
        },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'flight-1',
          components: FLIGHT_COMPONENTS,
        },
      },
      {
        version: 'v0.9',
        updateDataModel: {
          surfaceId: 'flight-1',
          path: '/',
          value: { origin: 'PDX', destination: 'SFO', airline: 'United' },
        },
      },
    ],
  },
  {
    id: 'dashboard',
    label: 'Progressive dashboard',
    blurb:
      'Components arrive first (bindings unresolved — note the diagnostics), then updateDataModel patches stream in. Each patch is a new revision; push them to watch the metrics and chart fill in.',
    surfaceId: 'spend',
    setup: [
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'spend', catalogId: 'basic', root: 'root' },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'spend',
          components: [
            {
              id: 'root',
              component: 'Column',
              children: ['head', 'metrics', 'chart'],
            },
            {
              id: 'head',
              component: 'Text',
              text: 'Monthly Spend',
              usageHint: 'h2',
            },
            {
              id: 'metrics',
              component: 'Row',
              children: ['mSpent', 'mBudget'],
            },
            {
              id: 'mSpent',
              component: 'Metric',
              label: 'Spent',
              value: { path: '/total' },
            },
            {
              id: 'mBudget',
              component: 'Metric',
              label: 'Budget',
              value: { path: '/budget' },
            },
            {
              id: 'chart',
              component: 'BarChart',
              title: 'By week',
              data: { path: '/weeks' },
            },
          ],
        },
      },
    ],
    stream: [
      {
        note: 'updateDataModel /total',
        op: {
          version: 'v0.9',
          updateDataModel: {
            surfaceId: 'spend',
            path: '/total',
            value: '$4,200',
          },
        },
      },
      {
        note: 'updateDataModel /budget',
        op: {
          version: 'v0.9',
          updateDataModel: {
            surfaceId: 'spend',
            path: '/budget',
            value: '$5,000',
          },
        },
      },
      {
        note: 'updateDataModel /weeks',
        op: {
          version: 'v0.9',
          updateDataModel: {
            surfaceId: 'spend',
            path: '/weeks',
            value: [
              { label: 'Wk1', value: 10 },
              { label: 'Wk2', value: 14 },
              { label: 'Wk3', value: 9 },
              { label: 'Wk4', value: 18 },
            ],
          },
        },
      },
    ],
  },
  {
    id: 'byoc',
    label: 'BYOC catalog',
    blurb:
      'Custom (bring-your-own-catalog) components — DataTable, Metric, BarChart, StatusBadge — mapped to host widgets through the same override hook.',
    surfaceId: 'ops',
    setup: [
      {
        version: 'v0.9',
        createSurface: {
          surfaceId: 'ops',
          catalogId: 'copilotkit://ops',
          root: 'root',
        },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'ops',
          components: [
            {
              id: 'root',
              component: 'Column',
              children: ['h', 'row', 'table'],
            },
            {
              id: 'h',
              component: 'Text',
              text: 'Fleet status',
              usageHint: 'h2',
            },
            {
              id: 'row',
              component: 'Row',
              children: ['uptime', 'latency', 'chart'],
            },
            {
              id: 'uptime',
              component: 'Metric',
              label: 'Uptime',
              value: '99.98%',
              trend: '+0.01%',
              tone: 'positive',
            },
            {
              id: 'latency',
              component: 'Metric',
              label: 'p95 latency',
              value: '142ms',
              trend: '-8ms',
              tone: 'positive',
            },
            {
              id: 'chart',
              component: 'BarChart',
              title: 'Requests / region',
              data: [
                { label: 'us', value: 42 },
                { label: 'eu', value: 31 },
                { label: 'ap', value: 18 },
              ],
            },
            {
              id: 'table',
              component: 'DataTable',
              columns: [
                { key: 'svc', label: 'Service' },
                { key: 'status', label: 'Status' },
              ],
              rows: [
                { svc: 'api', status: 'healthy' },
                { svc: 'worker', status: 'healthy' },
                { svc: 'cron', status: 'degraded' },
              ],
            },
          ],
        },
      },
    ],
  },
]

export function A2uiSurface() {
  const [scenarioId, setScenarioId] = useState(SCENARIOS[0]!.id)
  const [streamed, setStreamed] = useState(0)
  const [intents, setIntents] = useState<Array<string>>([])

  const scenario = SCENARIOS.find((s) => s.id === scenarioId) ?? SCENARIOS[0]!

  // Rebuild the store from scratch for the current scenario + stream position,
  // so the translation is always a pure function of the ops shown on the left.
  const { graph, diagnostics, appliedOps } = useMemo(() => {
    const store = new A2uiSurfaceStore()
    const diags: Array<Diagnostic> = []
    const applied: Array<Op> = [...scenario.setup]
    for (const op of scenario.setup) diags.push(...store.applyContainer(op))
    const streamOps = (scenario.stream ?? []).slice(0, streamed)
    for (const { op } of streamOps) {
      diags.push(...store.applyContainer(op))
      applied.push(op)
    }
    const built = store.getGraphWithDiagnostics(scenario.surfaceId)
    return {
      graph: built.graph,
      diagnostics: [...diags, ...built.diagnostics],
      appliedOps: applied,
    }
  }, [scenario, streamed])

  const selectScenario = (id: string) => {
    setScenarioId(id)
    setStreamed(0)
    setIntents([])
  }

  const onIntent = (intent: IntentPayload) => {
    setIntents((prev) => [
      `${intent.intentClass} · ${intent.intent}${
        intent.payload ? ` ${JSON.stringify(intent.payload)}` : ''
      }`,
      ...prev,
    ])
  }

  const remaining = (scenario.stream?.length ?? 0) - streamed

  return (
    <div className="h-full overflow-y-auto bg-[#070b14] text-slate-200">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-6">
        <div className="mb-5">
          <h2 className="text-lg font-semibold text-white">
            A2UI → graph → renderer
          </h2>
          <p className="mt-1 text-sm text-slate-400 max-w-3xl">
            A2UI v0.9 operations, translated into the node graph and rendered by
            the same host renderer the Chat surface uses. No second renderer, no
            live model — the parallel mechanism, made visible.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectScenario(s.id)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors border ${
                s.id === scenarioId
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        <p className="text-xs text-slate-400 mb-4 max-w-3xl leading-relaxed">
          {scenario.blurb}
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left: the A2UI operations (the input) */}
          <div className="rounded-xl border border-white/10 bg-[#0b1120] overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between px-3 h-9 border-b border-white/5 text-[11px] font-mono text-slate-400">
              <span>a2ui_operations · {appliedOps.length} applied</span>
              {scenario.stream ? (
                <button
                  type="button"
                  disabled={remaining <= 0}
                  onClick={() => setStreamed((n) => n + 1)}
                  className="px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {remaining > 0
                    ? `push next update (${remaining})`
                    : 'all updates streamed'}
                </button>
              ) : null}
            </div>
            <pre className="flex-1 overflow-auto p-3 text-[11px] leading-relaxed text-slate-300 font-mono">
              {JSON.stringify(appliedOps, null, 2)}
            </pre>
          </div>

          {/* Right: the rendered surface (the output) */}
          <div className="flex flex-col gap-3 min-h-0">
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              {graph ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px] font-mono text-slate-400">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300">
                      provenance: {graph.provenance.driver}
                    </span>
                    <span>{graph.graphId}</span>
                    <span>rev {graph.revision}</span>
                    {typeof graph.provenance.context?.catalogId === 'string' ? (
                      <span className="text-slate-500">
                        {graph.provenance.context.catalogId}
                      </span>
                    ) : null}
                  </div>
                  <GenerativeUIRenderer graph={graph} onIntent={onIntent} />
                </>
              ) : (
                <p className="text-sm text-slate-500 p-4">
                  No renderable surface yet.
                </p>
              )}
            </div>

            {intents.length > 0 ? (
              <div className="rounded-xl border border-white/10 bg-[#0b1120] p-3">
                <p className="text-[11px] font-mono text-slate-500 mb-1">
                  intents fired
                </p>
                <ul className="space-y-1">
                  {intents.map((line, i) => (
                    <li
                      key={i}
                      className="text-[11px] font-mono text-indigo-300"
                    >
                      {line}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="rounded-xl border border-white/10 bg-[#0b1120] p-3">
              <p className="text-[11px] font-mono text-slate-500 mb-1">
                diagnostics · {diagnostics.length} (never silent)
              </p>
              {diagnostics.length === 0 ? (
                <p className="text-[11px] font-mono text-slate-600">none</p>
              ) : (
                <ul className="space-y-1 max-h-40 overflow-auto">
                  {diagnostics.map((d, i) => (
                    <li
                      key={i}
                      className="text-[11px] font-mono text-amber-300/80"
                    >
                      {d.code}
                      {d.componentId ? `  ·  ${d.componentId}` : ''}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
