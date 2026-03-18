'use client'

import type { UINode } from '@/lib/reports/types'
import { AnimatedNodeList } from './NodeRenderer'

interface ReportRendererProps {
  nodes: Map<string, UINode>
  rootIds: string[]
  className?: string
}

export function ReportRenderer({
  nodes,
  rootIds,
  className = '',
}: ReportRendererProps) {
  return (
    <div
      className={`report-renderer space-y-4 text-(--report-text) ${className}`}
      style={{
        // CSS variables for soft blue theme report
        ['--report-bg' as string]: 'rgb(240, 249, 255)',
        ['--report-card-bg' as string]: 'rgb(248, 252, 255)',
        ['--report-border' as string]: 'rgb(186, 220, 244)',
        ['--report-text' as string]: 'rgb(15, 45, 75)',
        ['--report-text-muted' as string]: 'rgb(71, 107, 143)',
        ['--report-accent' as string]: 'rgb(6, 182, 212)',
        ['--report-success' as string]: 'rgb(22, 163, 74)',
        ['--report-warning' as string]: 'rgb(217, 119, 6)',
        ['--report-error' as string]: 'rgb(220, 38, 38)',
      }}
    >
      <AnimatedNodeList ids={rootIds} nodes={nodes} />
    </div>
  )
}
