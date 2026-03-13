import { useMemo } from 'react'
import { Database, Zap } from 'lucide-react'
import type { UIMessage } from '@tanstack/ai-react'
import type { VMEvent } from './JavaScriptVM'

interface MessageSizeOverlayProps {
  messages: Array<UIMessage>
  toolCallEvents: Map<string, Array<VMEvent>>
}

/**
 * Format bytes to a human-readable string (KB, MB, etc.)
 */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Calculate the actual byte size of the messages array
 */
function calculateActualSize(messages: Array<UIMessage>): number {
  return new TextEncoder().encode(JSON.stringify(messages)).length
}

/**
 * Calculate the theoretical byte size if all external tool calls were stored
 * as individual tool call parts in the messages array.
 */
function calculateTheoreticalSize(
  messages: Array<UIMessage>,
  toolCallEvents: Map<string, Array<VMEvent>>,
): number {
  // Start with the actual messages size
  let theoreticalSize = calculateActualSize(messages)

  // For each tool call's events, calculate the size of synthetic tool calls
  for (const events of toolCallEvents.values()) {
    // Group external_call events with their corresponding external_result events
    const externalCalls: Array<{ call: VMEvent; result?: VMEvent }> = []

    for (const event of events) {
      if (event.eventType === 'code_mode:external_call') {
        externalCalls.push({ call: event })
      } else if (event.eventType === 'code_mode:external_result') {
        // Find the matching call (most recent one for this function)
        const callData = event.data as { function?: string }
        const matchingCall = [...externalCalls]
          .reverse()
          .find(
            (c) =>
              !c.result &&
              (c.call.data as { function?: string })?.function ===
                callData?.function,
          )
        if (matchingCall) {
          matchingCall.result = event
        }
      }
    }

    // Calculate size of synthetic tool call parts for each external call
    for (const { call, result } of externalCalls) {
      const callData = call.data as {
        function?: string
        args?: unknown
      }
      const resultData = result?.data as { result?: unknown }

      // Create a synthetic tool call structure similar to what would be in messages
      const syntheticToolCall = {
        type: 'tool-call',
        id: `synthetic-${call.id}`,
        name: callData?.function || 'unknown',
        arguments: JSON.stringify(callData?.args || {}),
        state: 'input-complete',
        output: resultData?.result,
      }

      // Add the size of this synthetic tool call
      theoreticalSize += new TextEncoder().encode(
        JSON.stringify(syntheticToolCall),
      ).length
    }
  }

  return theoreticalSize
}

/**
 * A fixed overlay that shows the comparison between actual message size
 * and theoretical size if code mode external calls were stored in messages.
 */
export default function MessageSizeOverlay({
  messages,
  toolCallEvents,
}: MessageSizeOverlayProps) {
  const { actualSize, theoreticalSize, savings, savingsPercent } =
    useMemo(() => {
      const actual = calculateActualSize(messages)
      const theoretical = calculateTheoreticalSize(messages, toolCallEvents)
      const saved = theoretical - actual
      const percent = theoretical > 0 ? (saved / theoretical) * 100 : 0

      return {
        actualSize: actual,
        theoreticalSize: theoretical,
        savings: saved,
        savingsPercent: percent,
      }
    }, [messages, toolCallEvents])

  // Don't show if there are no messages
  if (messages.length === 0) {
    return null
  }

  // Don't show savings if there are no external calls
  const hasExternalCalls = toolCallEvents.size > 0

  return (
    <div className="fixed bottom-4 right-4 z-50 bg-gray-900/95 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-xl p-3 min-w-[200px]">
      <div className="flex items-center gap-2 mb-2 text-xs font-medium text-gray-400 uppercase tracking-wide">
        <Database className="w-3.5 h-3.5" />
        <span>Message Size</span>
      </div>

      <div className="space-y-2">
        {/* Actual size */}
        <div className="flex items-center justify-between gap-4">
          <span className="text-xs text-gray-400">Actual:</span>
          <span className="text-sm font-mono text-cyan-400">
            {formatBytes(actualSize)}
          </span>
        </div>

        {/* Theoretical size - only show if there are external calls */}
        {hasExternalCalls && (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-gray-400">Without Code Mode:</span>
              <span className="text-sm font-mono text-gray-500">
                {formatBytes(theoreticalSize)}
              </span>
            </div>

            {/* Savings indicator */}
            {savings > 0 && (
              <div className="pt-2 border-t border-gray-700/50">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <Zap className="w-3.5 h-3.5" />
                    <span>Saved:</span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm font-mono text-emerald-400">
                      {formatBytes(savings)}
                    </span>
                    <span className="text-xs text-emerald-500/70 ml-1">
                      ({savingsPercent.toFixed(0)}%)
                    </span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
