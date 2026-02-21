'use client'

import { useState, useCallback, useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { Play, RotateCcw, Zap } from 'lucide-react'
import { Header } from '@/components'
import { useReportState, ReportRenderer } from '@/components/reports'
import {
  ControlPanel,
  ComponentTree,
  EventLog,
  PRESETS,
  runPreset,
} from '@/components/reports/demo'
import type { UIEvent } from '@/lib/reports/types'

export const Route = createFileRoute('/reports/demo')({
  component: ReportsDemoPage,
})

interface EventLogEntry {
  id: string
  event: UIEvent
  timestamp: number
}

function ReportsDemoPage() {
  const reportState = useReportState()
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([])
  const [isRunningPreset, setIsRunningPreset] = useState(false)
  const eventIdCounter = useRef(0)

  // Wrap dispatch to log events
  const dispatchWithLog = useCallback(
    (event: UIEvent) => {
      reportState.dispatch(event)

      const entry: EventLogEntry = {
        id: `event-${eventIdCounter.current++}`,
        event,
        timestamp: Date.now(),
      }
      setEventLog((prev) => [...prev, entry])
    },
    [reportState]
  )

  // Handle preset execution
  const handleRunPreset = useCallback(
    async (presetName: string) => {
      const preset = PRESETS[presetName as keyof typeof PRESETS]
      if (!preset) return

      setIsRunningPreset(true)

      // Clear existing state
      reportState.reset()
      setEventLog([])
      setSelectedNodeId(null)

      // Create report
      reportState.createReport('demo-report', presetName)

      // Run preset with delays
      await runPreset(preset, dispatchWithLog, 200)

      setIsRunningPreset(false)
    },
    [reportState, dispatchWithLog]
  )

  // Clear all
  const handleClear = useCallback(() => {
    reportState.reset()
    setEventLog([])
    setSelectedNodeId(null)
  }, [reportState])

  // Delete node
  const handleDeleteNode = useCallback(
    (id: string) => {
      dispatchWithLog({ op: 'remove', id })
      if (selectedNodeId === id) {
        setSelectedNodeId(null)
      }
    },
    [dispatchWithLog, selectedNodeId]
  )

  // Ensure report exists for adding components
  const ensureReport = useCallback(() => {
    if (!reportState.report) {
      reportState.createReport('demo-report', 'Demo Report')
    }
  }, [reportState])

  // Dispatch with report creation
  const handleDispatch = useCallback(
    (event: UIEvent) => {
      ensureReport()
      dispatchWithLog(event)
    },
    [ensureReport, dispatchWithLog]
  )

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      {/* Header */}
      <Header>
        {/* Preset buttons */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">Presets:</span>
          {Object.keys(PRESETS).map((name) => (
            <button
              key={name}
              onClick={() => handleRunPreset(name)}
              disabled={isRunningPreset}
              className="px-3 py-1.5 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed text-gray-200 rounded-full transition-colors flex items-center gap-1.5"
            >
              {isRunningPreset ? (
                <Zap className="w-3 h-3 animate-pulse" />
              ) : (
                <Play className="w-3 h-3" />
              )}
              {name}
            </button>
          ))}
        </div>

        {/* Clear button */}
        <button
          onClick={handleClear}
          disabled={reportState.nodes.size === 0}
          className="px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/30 disabled:opacity-50 disabled:cursor-not-allowed text-red-400 border border-red-500/30 rounded-full transition-colors flex items-center gap-1.5"
        >
          <RotateCcw className="w-3 h-3" />
          Clear All
        </button>
      </Header>

      {/* Main Content */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar */}
        <div className="w-80 flex flex-col border-r border-gray-700 bg-gray-850">
          {/* Control Panel */}
          <div className="h-[400px] border-b border-gray-700">
            <ControlPanel
              nodes={reportState.nodes}
              selectedId={selectedNodeId}
              onDispatch={handleDispatch}
              onSelectId={setSelectedNodeId}
            />
          </div>

          {/* Component Tree */}
          <div className="flex-1 min-h-0 border-b border-gray-700">
            <ComponentTree
              nodes={reportState.nodes}
              rootIds={reportState.rootIds}
              selectedId={selectedNodeId}
              onSelect={setSelectedNodeId}
              onDelete={handleDeleteNode}
            />
          </div>

          {/* Event Log */}
          <div className="h-48">
            <EventLog
              events={eventLog}
              onClear={() => setEventLog([])}
              onReplay={(event) => handleDispatch(event)}
            />
          </div>
        </div>

        {/* Main Preview Area */}
        <div className="flex-1 overflow-auto p-6 bg-[var(--report-bg)]" style={{
          ['--report-bg' as string]: 'rgb(17, 24, 39)',
        }}>
          {reportState.nodes.size === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center mb-4">
                <Zap className="w-8 h-8 text-cyan-400" />
              </div>
              <h2 className="text-xl font-semibold text-white mb-2">
                No Components Yet
              </h2>
              <p className="text-gray-400 max-w-md mb-6">
                Use the control panel to add components manually, or click a
                preset to see the system in action.
              </p>
              <div className="flex gap-2">
                {Object.keys(PRESETS)
                  .slice(0, 3)
                  .map((name) => (
                    <button
                      key={name}
                      onClick={() => handleRunPreset(name)}
                      disabled={isRunningPreset}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white text-sm rounded-lg transition-colors"
                    >
                      Try "{name}"
                    </button>
                  ))}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto">
              <ReportRenderer
                nodes={reportState.nodes}
                rootIds={reportState.rootIds}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
