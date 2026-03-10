'use client'

import { FileText, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import type { ReportState } from '@/lib/reports/types'

interface ReportsListProps {
  reports: Array<ReportState>
  activeReportId: string | null
  onSelectReport: (reportId: string) => void
  onDeleteReport?: (reportId: string) => void
}

export function ReportsList({
  reports,
  activeReportId,
  onSelectReport,
  onDeleteReport,
}: ReportsListProps) {
  const [isExpanded, setIsExpanded] = useState(true)

  return (
    <div className="border-t border-gray-700">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:bg-gray-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span>Reports</span>
          <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-700 text-gray-400">
            {reports.length}
          </span>
        </div>
      </button>

      {/* Reports List */}
      {isExpanded && (
        <div className="px-2 pb-2 space-y-1">
          {reports.length === 0 ? (
            <div className="px-3 py-4 text-center">
              <p className="text-sm text-gray-500">No reports yet</p>
              <p className="text-xs text-gray-600 mt-1">
                Ask the AI to create a report
              </p>
            </div>
          ) : (
            reports.map((reportState) => {
              const isActive = reportState.report.id === activeReportId
              const componentCount = reportState.nodes.size

              return (
                <div
                  key={reportState.report.id}
                  className={`group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-cyan-500/20 border border-cyan-500/30'
                      : 'hover:bg-gray-800/50 border border-transparent'
                  }`}
                  onClick={() => onSelectReport(reportState.report.id)}
                >
                  <FileText
                    className={`w-4 h-4 flex-shrink-0 ${
                      isActive ? 'text-cyan-400' : 'text-gray-500'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm truncate ${
                        isActive ? 'text-white' : 'text-gray-300'
                      }`}
                    >
                      {reportState.report.title}
                    </p>
                    <p className="text-xs text-gray-500">
                      {componentCount} component
                      {componentCount !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {onDeleteReport && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onDeleteReport(reportState.report.id)
                      }}
                      className="p-1 rounded opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                      title="Delete report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
