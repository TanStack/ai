import { useState } from 'react'
import type { ButtonProps, UIUpdate } from '@/lib/reports/types'
import { useEventDispatch } from '../../useEventDispatch'
import { useEffectsHandler } from '../../useEffectsHandler'
import { useReportRuntime } from '../../ReportRuntimeProvider'

type ButtonRendererProps = ButtonProps & {
  handlers?: Record<string, string>
}

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-cyan-600 text-white hover:bg-cyan-700',
  secondary: 'bg-gray-700 text-white hover:bg-gray-600',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  ghost: 'bg-transparent text-[var(--report-text)] hover:bg-white/10',
}

export function Button({
  id,
  label,
  variant = 'primary',
  disabled = false,
  handlers,
}: ButtonRendererProps) {
  const { dispatch } = useEventDispatch()
  const { handleEffects } = useEffectsHandler()
  const { applyUIUpdates } = useReportRuntime()
  const [isLoading, setIsLoading] = useState(false)

  const hasHandler = !!handlers?.onPress

  const handleClick = async () => {
    if (!hasHandler || disabled || isLoading) return

    console.log('[Button] Clicked:', id)
    setIsLoading(true)
    try {
      const result = await dispatch(id, 'onPress')
      console.log('[Button] Handler result:', result)

      if (result.effects?.length) {
        console.log('[Button] Processing effects:', result.effects)
        handleEffects(result.effects)
      }
      if (result.uiUpdates?.length) {
        console.log('[Button] Processing UI updates:', result.uiUpdates)
        applyUIUpdates(result.uiUpdates)
      }
      // Apply refresh results from subscription invalidation
      if (result.refreshResults?.length) {
        console.log(
          '[Button] Processing refresh results:',
          JSON.stringify(result.refreshResults, null, 2),
        )
        const refreshUpdates: UIUpdate[] = result.refreshResults
          .filter((r) => r.success && r.props)
          .map((r) => ({
            type: 'update' as const,
            componentId: r.componentId,
            props: r.props,
          }))
        console.log(
          '[Button] Converted to UI updates:',
          JSON.stringify(refreshUpdates, null, 2),
        )
        if (refreshUpdates.length > 0) {
          console.log(
            '[Button] Calling applyUIUpdates with',
            refreshUpdates.length,
            'updates',
          )
          applyUIUpdates(refreshUpdates)
        } else {
          console.log('[Button] No valid refresh updates to apply')
        }
      } else {
        console.log('[Button] No refresh results in response')
      }
      if (!result.success) {
        console.log('[Button] Handler failed:', result.error)
        handleEffects([
          {
            type: 'toast',
            params: {
              message: result.error || 'Action failed',
              variant: 'error',
            },
          },
        ])
      }
    } catch (error) {
      console.error('[Button] Exception during handler:', error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={disabled || isLoading}
      className={`inline-flex items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
        variantClasses[variant]
      } ${isLoading ? 'opacity-60 cursor-wait' : ''}`}
    >
      {isLoading ? 'Working...' : label}
    </button>
  )
}
