'use client'

import { useCallback } from 'react'
import type { UIEffect } from '@/lib/reports/types'
import { useReportRuntime } from './ReportRuntimeProvider'

export function useEffectsHandler() {
  const { pushToast } = useReportRuntime()

  const handleEffects = useCallback(
    (effects: UIEffect[]) => {
      for (const effect of effects) {
        if (effect.type === 'toast') {
          const message =
            typeof effect.params.message === 'string'
              ? effect.params.message
              : 'Action completed'
          const variant =
            typeof effect.params.variant === 'string'
              ? (effect.params.variant as 'default' | 'success' | 'error')
              : 'default'
          pushToast(message, variant)
        }
      }
    },
    [pushToast],
  )

  return { handleEffects }
}
