'use client'

import { useCallback } from 'react'
import type { HandlerResult } from '@/lib/reports/types'
import { useReportRuntime } from './ReportRuntimeProvider'

export function useEventDispatch() {
  const { reportId } = useReportRuntime()

  const dispatch = useCallback(
    async (
      componentId: string,
      handlerName: string,
      eventData?: Record<string, unknown>,
    ): Promise<HandlerResult> => {
      try {
        const response = await fetch('/api/report-event', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            reportId,
            componentId,
            handlerName,
            eventData,
          }),
        })
        const result = await response.json()
        return result
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      }
    },
    [reportId],
  )

  return { dispatch }
}
