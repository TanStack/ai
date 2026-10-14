import React, { useState, useEffect, useCallback } from 'react'
import {
  GenerativeUIRenderer,
  GenerativeUITextFallback,
  CANONICAL_FIXTURES,
  validateGraph,
  type GraphDocument,
  type IntentPayload,
} from '@tanstack/ai-generative-ui'

interface IntentLogEntry extends IntentPayload {
  timestamp: string
}

const SAMPLE_PROMPTS = [
  'Compare 3 subscription tiers for a video streaming service with pricing table, feature matrix, and select buttons',
  'Mortgage calculation tool with loan amount, interest rate, and years inputs with monthly payment calculation',
  'Recipe card for chocolate lava cake with ingredient checklist, prep steps, and a serving size stepper',
  'Guitar chord voicing diagram for Dmaj9 chord with fretboard scene and play button',
  'Spend monitor dashboard with monthly budget progress, metric cards, and category breakdown chart',
]

export function App() {
  const [selectedScenario, setSelectedScenario] = useState<string>('compare-plans-basic')
  const [viewMode, setViewMode] = useState<'visual' | 'fallback'>('visual')
  const [intentLogs, setIntentLogs] = useState<IntentLogEntry[]>([])
  const [showJson, setShowJson] = useState<boolean>(false)

  // Live generation state
  const [providers, setProviders] = useState<string[]>([])
  const [selectedProvider, setSelectedProvider] = useState<string>('openai')
  const [promptInput, setPromptInput] = useState<string>('')
  const [isGenerating, setIsGenerating] = useState<boolean>(false)
  const [generationError, setGenerationError] = useState<string | null>(null)
  const [appliedRepairs, setAppliedRepairs] = useState<string[]>([])
  const [lastIntent, setLastIntent] = useState<IntentLogEntry | null>(null)

  // Current graph
  const [graph, setGraph] = useState<GraphDocument>(() => CANONICAL_FIXTURES['compare-plans-basic'])

  // Fetch available providers on mount
  useEffect(() => {
    fetch('/api/providers')
      .then((res) => res.json())
      .then((data) => {
        if (data.providers && data.providers.length > 0) {
          setProviders(data.providers)
          setSelectedProvider(data.providers[0])
        }
      })
      .catch((err) => {
        console.warn('Could not load providers:', err)
      })
  }, [])

  const handleSelectScenario = (key: string) => {
    setSelectedScenario(key)
    const nextFixture = CANONICAL_FIXTURES[key]
    if (nextFixture) {
      setGraph(JSON.parse(JSON.stringify(nextFixture)))
      setAppliedRepairs([])
      setGenerationError(null)
      setLastIntent(null)
    }
  }

  const handleIntent = useCallback((intent: IntentPayload) => {
    const entry: IntentLogEntry = {
      ...intent,
      timestamp: new Date().toLocaleTimeString(),
    }
    setIntentLogs((prev) => [entry, ...prev.slice(0, 19)])
    setLastIntent(entry)
  }, [])

  const handleLiveGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!promptInput.trim() || isGenerating) return

    setIsGenerating(true)
    setGenerationError(null)
    setAppliedRepairs([])

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: promptInput,
          provider: selectedProvider,
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate UI')
      }

      if (data.graph) {
        setGraph(data.graph)
        setSelectedScenario('custom')
        if (data.repairs && data.repairs.length > 0) {
          setAppliedRepairs(data.repairs)
        }
      }
    } catch (err: any) {
      setGenerationError(err.message || 'An error occurred during generation')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleTestRepair = () => {
    // Malformed graph testing §9.3 bounded repair rules
    const malformed = {
      specVersion: '0.1',
      title: 'Malformed Graph Repair Test',
      provenance: { driver: 'live' },
      root: {
        id: 'bad-root',
        type: 'AlienContainerNode', // Unknown container -> degrades to Stack
        children: [
          {
            id: 'bad-leaf',
            type: 'CyberneticImplantNode', // Unknown leaf -> degrades to Text
          },
          {
            id: 'broken-slider',
            type: 'Slider',
            props: { label: 'Inverted Slider', min: 100, max: 10 }, // Inverted bounds -> swapped
          },
          {
            id: 'broken-scene',
            type: 'Scene',
            props: {
              viewBox: '0 0 200 200',
              shapes: [
                { kind: 'circle', cx: 50, cy: 50, r: 20, fill: 'accent' },
                { kind: 'path', d: '<script>alert("malicious")</script>' }, // Unsafe path -> dropped
              ],
            },
          },
        ],
      },
    }

    const res = validateGraph(malformed, { repair: true })
    if (res.valid && res.graph) {
      setGraph(res.graph)
      setSelectedScenario('custom')
      setAppliedRepairs(res.repairs)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* Top Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-violet-500 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
            UI
          </div>
          <div>
            <h1 className="text-sm font-bold text-white flex items-center gap-2">
              Open Generative UI <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-mono font-medium">Draft 0.1</span>
            </h1>
            <p className="text-xs text-slate-400">Deterministic Computation • Bounded Repair • Structured Intents</p>
          </div>
        </div>

        {/* Fixture & Mode Controls */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <label className="text-xs text-slate-400 font-medium">Scenario:</label>
          <select
            className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-3 py-1.5 text-white font-medium focus:ring-2 focus:ring-blue-500 focus:outline-none"
            value={selectedScenario}
            onChange={(e) => handleSelectScenario(e.target.value)}
          >
            {selectedScenario === 'custom' && (
              <option value="custom">✨ Live Generated / Custom Graph</option>
            )}
            <option value="compare-plans-basic">U1: Compare (compare-plans-basic)</option>
            <option value="bicycle-drivetrain">U2: Understand (bicycle-drivetrain)</option>
            <option value="cooking-plan">U3: Plan & Track (cooking-plan)</option>
            <option value="bill-split">U4: Calculate (bill-split - Deterministic Host Code)</option>
            <option value="recipe-parameters">U5: Collect Input (recipe-parameters form)</option>
            <option value="approval-tool-call">U6: Decide / Approve (approval-tool-call)</option>
            <option value="spend-monitor">U7: Monitor (spend-monitor metrics & chart)</option>
            <option value="trip-stops">U8: Locate (trip-stops itinerary)</option>
            <option value="chord-diagram-emaj7">§6.4.3: Guitar Voicing Scene (chord-diagram-emaj7)</option>
          </select>

          {/* View Mode Toggle */}
          <div className="flex bg-slate-800 rounded-lg p-0.5 border border-slate-700 text-xs">
            <button
              type="button"
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'visual' ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setViewMode('visual')}
            >
              Visual
            </button>
            <button
              type="button"
              className={`px-3 py-1 rounded-md transition-colors ${
                viewMode === 'fallback' ? 'bg-blue-600 text-white font-semibold shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
              onClick={() => setViewMode('fallback')}
            >
              Fallback Text (§9.2)
            </button>
          </div>

          <button
            type="button"
            className="text-xs bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20 px-3 py-1.5 rounded-lg transition-colors font-medium flex items-center gap-1.5"
            onClick={handleTestRepair}
            title="Inject an invalid graph and watch bounded repair fix it"
          >
            <span>🛠</span>
            <span>Test Repair (§9.3)</span>
          </button>
        </div>
      </header>

      {/* Live Generation Panel */}
      <section className="bg-slate-900/60 border-b border-slate-800 px-6 py-4">
        <form onSubmit={handleLiveGenerate} className="max-w-5xl mx-auto space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                placeholder="Ask the LLM to generate an interactive UI (e.g. mortgage calculator, recipe checklist, pricing table)..."
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                disabled={isGenerating}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            <div className="flex items-center gap-2">
              <select
                value={selectedProvider}
                onChange={(e) => setSelectedProvider(e.target.value)}
                disabled={isGenerating}
                className="bg-slate-800 border border-slate-700 text-xs font-semibold rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 uppercase tracking-wider"
              >
                {providers.length > 0 ? (
                  providers.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))
                ) : (
                  <>
                    <option value="openai">OPENAI</option>
                    <option value="anthropic">ANTHROPIC</option>
                    <option value="gemini">GEMINI</option>
                    <option value="xai">XAI</option>
                    <option value="openrouter">OPENROUTER</option>
                  </>
                )}
              </select>

              <button
                type="submit"
                disabled={isGenerating || !promptInput.trim()}
                className="bg-blue-600 hover:bg-blue-500 disabled:bg-slate-800 disabled:text-slate-500 text-white text-xs font-semibold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center gap-2 whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
              >
                {isGenerating ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <span>✨</span>
                    <span>Generate UI</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Sample Prompt Chips */}
          <div className="flex items-center gap-2 overflow-x-auto text-xs text-slate-400 pt-1 pb-0.5 no-scrollbar">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Try:</span>
            {SAMPLE_PROMPTS.map((prompt, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setPromptInput(prompt)}
                className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white px-2.5 py-1 rounded-lg border border-slate-700/60 transition-colors whitespace-nowrap cursor-pointer truncate max-w-xs"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Status Banners */}
          {generationError && (
            <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-xs text-red-300 flex items-center justify-between">
              <span>⚠️ {generationError}</span>
              <button type="button" onClick={() => setGenerationError(null)} className="text-red-400 hover:text-white ml-2">✕</button>
            </div>
          )}

          {appliedRepairs.length > 0 && (
            <div className="p-3 bg-amber-950/30 border border-amber-800/50 rounded-xl text-xs text-amber-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <span>🛡️</span>
                <span>Bounded Repair Applied ({appliedRepairs.length} fix{appliedRepairs.length > 1 ? 'es' : ''})</span>
              </div>
              <ul className="list-disc list-inside text-[11px] text-amber-200/80 space-y-0.5">
                {appliedRepairs.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </section>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Render Canvas */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center">
          <div className="w-full max-w-4xl space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span className="flex items-center gap-2">
                <span>Surface:</span>
                <strong className="text-slate-200 font-medium">TanStack React Host</strong>
                <span className="text-slate-600">•</span>
                <span className="font-mono text-[11px] text-slate-500">ID: {graph.graphId} (rev {graph.revision})</span>
              </span>
              <button
                type="button"
                className="text-blue-400 hover:underline cursor-pointer"
                onClick={() => setShowJson(!showJson)}
              >
                {showJson ? 'Hide Graph JSON' : 'Inspect Graph JSON'}
              </button>
            </div>

            {showJson && (
              <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl max-h-80 overflow-y-auto text-xs font-mono text-emerald-400">
                <pre>{JSON.stringify(graph, null, 2)}</pre>
              </div>
            )}

            {lastIntent && (
              <div className="bg-emerald-950/80 border border-emerald-500/50 text-emerald-200 px-4 py-2.5 rounded-xl text-xs flex items-center justify-between shadow-lg shadow-emerald-950/40">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="font-semibold uppercase text-[10px] tracking-wider text-emerald-400">
                    Intent Fired ({lastIntent.intentClass})
                  </span>
                  <span>•</span>
                  <span className="font-mono text-emerald-100 font-bold">{lastIntent.intent}</span>
                  <span className="text-slate-400 text-[11px]">from node</span>
                  <span className="font-mono text-slate-300 bg-slate-900/80 px-1.5 py-0.5 rounded text-[11px]">{lastIntent.nodeId}</span>
                  {lastIntent.payload !== undefined && (
                    <span className="text-emerald-300/90 font-mono text-[11px] truncate max-w-sm">
                      payload: {JSON.stringify(lastIntent.payload)}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  className="text-slate-400 hover:text-white ml-3 text-[11px] cursor-pointer"
                  onClick={() => setLastIntent(null)}
                >
                  ✕
                </button>
              </div>
            )}

            {viewMode === 'visual' ? (
              <GenerativeUIRenderer
                key={`${graph.graphId}_${graph.revision}`}
                graph={graph}
                onIntent={handleIntent}
              />
            ) : (
              <GenerativeUITextFallback graph={graph} />
            )}
          </div>
        </div>

        {/* Intent Log Inspector (§8) */}
        <aside className="w-full lg:w-96 border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900/50 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-800">
            <div>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider">Outbound Intent Log (§8)</h3>
              <p className="text-[10px] text-slate-400">Structured intents returning from UI to Agent</p>
            </div>
            {intentLogs.length > 0 && (
              <button
                type="button"
                className="text-[10px] text-slate-500 hover:text-slate-300 cursor-pointer"
                onClick={() => setIntentLogs([])}
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {intentLogs.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-center text-xs text-slate-600 p-4 leading-relaxed">
                Interact with buttons, sliders, checklists, or diagrams on the left to observe structured intents emit in real time.
              </div>
            ) : (
              intentLogs.map((log, idx) => (
                <div key={idx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono">
                  <div className="flex items-center justify-between text-slate-400 text-[10px] mb-1">
                    <span className="font-semibold text-blue-400">{log.intent}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold ${
                        log.intentClass === 'action'
                          ? 'bg-amber-500/20 text-amber-400'
                          : log.intentClass === 'submit'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {log.intentClass}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400">
                    <div>Node: <span className="text-slate-200">{log.nodeId}</span> • {log.timestamp}</div>
                    {log.payload !== undefined && (
                      <div className="mt-1 p-1 bg-slate-950 rounded text-slate-300 overflow-x-auto">
                        Payload: {JSON.stringify(log.payload)}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
