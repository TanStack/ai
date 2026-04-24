'use client'

import { useState } from 'react'
import { ChevronDown, X, Trash2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Report } from '@/lib/reports/types'

interface ReportSelectorProps {
  reports: Report[]
  activeReportId: string
  onSelectReport: (reportId: string) => void
  onCloseReport: () => void
  onClearAll: () => void
}

export function ReportSelector({
  reports,
  activeReportId,
  onSelectReport,
  onCloseReport,
  onClearAll,
}: ReportSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const activeReport = reports.find((r) => r.id === activeReportId)

  return (
    <div className="flex items-center gap-2 p-3 border-b border-sky-200/60 bg-sky-100/50">
      <div className="relative flex-1">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between px-3 py-2 text-left bg-white/60 hover:bg-white/80 rounded-lg transition-colors border border-sky-200/40"
        >
          <span className="truncate font-medium text-slate-700">
            {activeReport?.title ?? 'Select Report'}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0 ml-2" />
        </button>

        <AnimatePresence>
          {isOpen && (
            <>
              {/* Backdrop */}
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsOpen(false)}
              />

              {/* Dropdown */}
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.96 }}
                transition={{ duration: 0.15 }}
                className="absolute left-0 right-0 top-full mt-1 bg-white border border-sky-200/60 rounded-lg shadow-xl z-50 overflow-hidden"
              >
                <div className="py-1 max-h-64 overflow-auto">
                  {reports.map((report) => (
                    <button
                      key={report.id}
                      onClick={() => {
                        onSelectReport(report.id)
                        setIsOpen(false)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-sky-50 transition-colors"
                    >
                      {report.id === activeReportId && (
                        <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 flex-shrink-0" />
                      )}
                      <span
                        className={`truncate ${
                          report.id === activeReportId
                            ? 'font-medium text-slate-800'
                            : 'text-slate-600'
                        }`}
                      >
                        {report.title}
                      </span>
                    </button>
                  ))}
                </div>

                {reports.length > 0 && (
                  <div className="border-t border-sky-200/60">
                    <button
                      onClick={() => {
                        if (confirm('Clear all reports?')) {
                          onClearAll()
                          setIsOpen(false)
                        }
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left text-red-600 hover:text-red-700 hover:bg-red-50 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Clear All Reports</span>
                    </button>
                  </div>
                )}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={onCloseReport}
        className="p-2 text-slate-500 hover:text-slate-700 hover:bg-sky-100 rounded-lg transition-colors"
        title="Close report panel"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  )
}
