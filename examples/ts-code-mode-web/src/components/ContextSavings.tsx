'use client'

import { useMemo, useState } from 'react'
import { Info, Zap } from 'lucide-react'
import {
  calculateEfficiency,
  estimateCostFromBytes,
  estimateRoundTripTimeMs,
  formatBytes,
  formatCurrency,
  formatDuration,
} from '../lib/efficiency'

interface ContextSavingsProps {
  actual: number
  theoretical: number
  model?: string
}

interface MetricRowProps {
  label: string
  actual: string
  theoretical: string
  percent: number
  description?: string
  savedLabel?: string
}

function MetricRow({
  label,
  actual,
  theoretical,
  percent,
  description,
  savedLabel,
}: MetricRowProps) {
  // Show the "used" portion (what Code Mode actually uses)
  const usedPercent = 100 - percent

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono text-xs">
          {actual} / {theoretical}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
            style={{ width: `${usedPercent}%` }}
          />
        </div>
        <span className="text-xs text-cyan-400 w-10 text-right">
          {percent}%
        </span>
      </div>
      <p className="text-xs text-gray-500">
        {savedLabel ?? `${percent}% ${description}`}
      </p>
    </div>
  )
}

interface ValueRowProps {
  label: string
  value: string
  description?: string
}

function ValueRow({ label, value, description }: ValueRowProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <span className="text-gray-300 font-mono text-xs">{value}</span>
      </div>
      {description && <p className="text-xs text-gray-500">{description}</p>}
    </div>
  )
}

export function ContextSavings({
  actual,
  theoretical,
  model,
}: ContextSavingsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const metrics = useMemo(
    () =>
      calculateEfficiency({
        actualBytes: actual,
        theoreticalBytes: theoretical,
        model,
      }),
    [actual, theoretical, model],
  )

  // Don't render if no savings
  if (metrics.contextSavedBytes <= 0) return null

  // For the collapsed button, show time savings (most tangible per spec)
  const usedPercentage = 100 - metrics.timeSavedPercent

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-700/50 transition-colors"
        title="Code Mode Efficiency"
      >
        <Zap className="w-3.5 h-3.5 text-cyan-500" />
        <div className="w-14 h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-cyan-500 rounded-full transition-all duration-300"
            style={{ width: `${usedPercentage}%` }}
          />
        </div>
        <span className="text-xs text-gray-400 font-medium">
          {metrics.timeSavedPercent}% faster
        </span>
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Popover */}
          <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700/50">
              <h3 className="font-medium text-gray-200">
                Code Mode Efficiency
              </h3>
            </div>

            <div className="p-4 space-y-4">
              {/* Context */}
              <MetricRow
                label="Context"
                actual={formatBytes(metrics.contextActual)}
                theoretical={formatBytes(metrics.contextTheoretical)}
                percent={metrics.contextSavedPercent}
                description="smaller context window"
              />

              {/* Round-trips */}
              <MetricRow
                label="LLM Calls"
                actual={`${metrics.roundTripsActual}`}
                theoretical={`${metrics.roundTripsTheoretical}`}
                percent={metrics.roundTripsSavedPercent}
                description="fewer round-trips"
              />

              {/* Time */}
              <MetricRow
                label="Time"
                actual={`~${formatDuration(metrics.timeActualMs)}`}
                theoretical={`~${formatDuration(metrics.timeTheoreticalMs)}`}
                percent={metrics.timeSavedPercent}
                savedLabel={`~${formatDuration(metrics.timeSavedMs)} saved`}
              />

              {/* Cost */}
              <MetricRow
                label="Est. Cost"
                actual={formatCurrency(metrics.costActual)}
                theoretical={formatCurrency(metrics.costTheoretical)}
                percent={metrics.costSavedPercent}
                savedLabel={`~${formatCurrency(metrics.costSaved)} saved`}
              />

              {/* Disclaimer */}
              <div className="pt-3 border-t border-gray-700/50 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-500">
                  Estimates based on typical tool-calling patterns. Actual
                  savings may vary.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface NoCodeMetricsProps {
  totalBytes: number
  llmCalls: number
  totalContextBytes?: number
  averageContextBytes?: number
  totalTimeMs?: number
  model?: string
}

export function NoCodeMetrics({
  totalBytes,
  llmCalls,
  totalContextBytes,
  averageContextBytes,
  totalTimeMs,
  model,
}: NoCodeMetricsProps) {
  const [isOpen, setIsOpen] = useState(false)
  const estimatedTimeMs = estimateRoundTripTimeMs(llmCalls)
  const resolvedTimeMs = totalTimeMs ?? estimatedTimeMs
  const estimatedCost = estimateCostFromBytes(totalBytes, model)

  if (totalBytes <= 0 || llmCalls <= 0) return null

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-gray-700/50 transition-colors"
        title="Chat Metrics"
      >
        <Info className="w-3.5 h-3.5 text-cyan-500" />
        <span className="text-xs text-gray-400 font-medium">Chat metrics</span>
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          <div className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-700/50">
              <h3 className="font-medium text-gray-200">Chat Metrics</h3>
            </div>

            <div className="p-4 space-y-4">
              <ValueRow
                label="Message Size"
                value={formatBytes(totalBytes)}
                description="Final serialized size of the messages array."
              />
              {typeof totalContextBytes === 'number' &&
                totalContextBytes > 0 && (
                  <ValueRow
                    label="Context Bytes (Total)"
                    value={formatBytes(totalContextBytes)}
                    description="Accumulated context size across LLM calls."
                  />
                )}
              {typeof averageContextBytes === 'number' &&
                averageContextBytes > 0 && (
                  <ValueRow
                    label="Context Bytes (Avg)"
                    value={formatBytes(averageContextBytes)}
                    description="Average context size per LLM call."
                  />
                )}
              <ValueRow
                label="LLM Calls"
                value={`${llmCalls}`}
                description="Count of assistant responses."
              />
              <ValueRow
                label="Time"
                value={`${totalTimeMs ? '' : '~'}${formatDuration(resolvedTimeMs)}`}
                description={
                  totalTimeMs
                    ? 'Measured from server events.'
                    : 'Estimated from round-trip latency.'
                }
              />
              <ValueRow
                label="Est. Cost"
                value={formatCurrency(estimatedCost)}
                description="Estimated from bytes and model pricing."
              />

              <div className="pt-3 border-t border-gray-700/50 flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-gray-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-gray-500">
                  Estimates based on typical LLM latency and pricing. Actual
                  usage may vary.
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
