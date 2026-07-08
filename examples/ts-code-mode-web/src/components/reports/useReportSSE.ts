'use client'

import { useEffect, useRef, useCallback } from 'react'
import type { RefreshResult, UIEffect, UIUpdate } from '@/lib/reports/types'

interface SSEMessage {
  type: 'connected' | 'ping' | 'refresh' | 'effects'
  reportId?: string
  results?: RefreshResult[]
  effects?: UIEffect[]
}

interface UseReportSSEOptions {
  reportId: string | null
  onRefresh: (results: RefreshResult[]) => void
  onEffects?: (effects: UIEffect[]) => void
  enabled?: boolean
}

/**
 * Hook to connect to SSE endpoint for receiving push updates.
 * Automatically reconnects on disconnect.
 */
export function useReportSSE({
  reportId,
  onRefresh,
  onEffects,
  enabled = true,
}: UseReportSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const connect = useCallback(() => {
    if (!reportId || !enabled) return

    // Clean up existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }

    const eventSource = new EventSource(`/api/report-sse?reportId=${reportId}`)
    eventSourceRef.current = eventSource

    eventSource.onmessage = (event) => {
      try {
        const data: SSEMessage = JSON.parse(event.data)

        if (data.type === 'refresh' && data.results) {
          onRefresh(data.results)
        }

        if (data.type === 'effects' && data.effects && onEffects) {
          onEffects(data.effects)
        }
        // 'connected' and 'ping' messages are handled silently
      } catch {
        console.error('[useReportSSE] Failed to parse message:', event.data)
      }
    }

    eventSource.onerror = () => {
      // Close the connection and schedule reconnect
      eventSource.close()
      eventSourceRef.current = null

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect()
      }, 3000)
    }
  }, [reportId, enabled, onRefresh, onEffects])

  useEffect(() => {
    connect()

    return () => {
      // Clean up on unmount
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
        reconnectTimeoutRef.current = null
      }
    }
  }, [connect])
}

/**
 * Helper to convert refresh results to UI updates for use with applyUIUpdates.
 */
export function refreshResultsToUIUpdates(
  results: RefreshResult[],
): UIUpdate[] {
  return results
    .filter((r) => r.success && r.props)
    .map((r) => ({
      type: 'update' as const,
      componentId: r.componentId,
      props: r.props,
    }))
}
