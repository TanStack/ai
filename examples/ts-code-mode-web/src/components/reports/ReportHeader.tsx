'use client'

import { X, FileText } from 'lucide-react'
import type { Report } from '@/lib/reports/types'

interface ReportHeaderProps {
  report: Report
  onClose?: () => void
}

export function ReportHeader({ report, onClose }: ReportHeaderProps) {
  const formattedDate = new Date(report.updatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-800/50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center">
          <FileText className="w-5 h-5 text-cyan-400" />
        </div>
        <div>
          <h1 className="text-lg font-semibold text-white">{report.title}</h1>
          <p className="text-xs text-gray-400">Updated {formattedDate}</p>
        </div>
      </div>

      {onClose && (
        <button
          onClick={onClose}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
          title="Close report"
        >
          <X className="w-5 h-5" />
        </button>
      )}
    </div>
  )
}
