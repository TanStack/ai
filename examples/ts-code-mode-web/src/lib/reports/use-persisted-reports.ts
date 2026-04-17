'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Report, ReportState, UIEvent, UINode } from './types'
import { applyUIEvent, createEmptyReportState } from './apply-event'

const STORAGE_KEY = 'tanstack-ai-reports'
const STORAGE_VERSION = 1

interface StoredReport {
  report: Report
  nodes: Array<[string, UINode]> // Map entries as array
  rootIds: string[]
}

interface ReportsStorage {
  reports: StoredReport[]
  activeReportId: string | null
  version: number
}

// Debounce helper
function debounce<T extends (...args: never[]) => void>(
  fn: T,
  delay: number,
): T & { cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const debounced = (...args: Parameters<T>) => {
    if (timeoutId) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => fn(...args), delay)
  }

  debounced.cancel = () => {
    if (timeoutId) clearTimeout(timeoutId)
  }

  return debounced as T & { cancel: () => void }
}

export function usePersistedReports() {
  const [reports, setReports] = useState<Map<string, ReportState>>(new Map())
  const [activeReportId, setActiveReportId] = useState<string | null>(null)
  const [isHydrated, setIsHydrated] = useState(false)
  const saveRef = useRef<ReturnType<typeof debounce<() => void>> | null>(null)

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const data: ReportsStorage = JSON.parse(stored)

        if (data.version === STORAGE_VERSION) {
          const reportsMap = new Map<string, ReportState>()
          for (const { report, nodes, rootIds } of data.reports) {
            reportsMap.set(report.id, {
              report,
              nodes: new Map(nodes),
              rootIds,
            })
          }
          setReports(reportsMap)
          setActiveReportId(data.activeReportId)
        }
      }
    } catch (e) {
      console.error('Failed to load reports from storage:', e)
    }
    setIsHydrated(true)
  }, [])

  // Save to localStorage on change (debounced)
  useEffect(() => {
    if (!isHydrated) return

    if (!saveRef.current) {
      saveRef.current = debounce(() => {
        const data: ReportsStorage = {
          reports: Array.from(reports.values()).map(
            ({ report, nodes, rootIds }) => ({
              report,
              nodes: Array.from(nodes.entries()),
              rootIds,
            }),
          ),
          activeReportId,
          version: STORAGE_VERSION,
        }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
        } catch (e) {
          console.error('Failed to save reports to storage:', e)
        }
      }, 500)
    }

    saveRef.current()
    return () => saveRef.current?.cancel()
  }, [reports, activeReportId, isHydrated])

  // Create a new report
  const createReport = useCallback(
    (report: Report, autoSelect: boolean = true) => {
      setReports((prev) => {
        const newMap = new Map(prev)
        newMap.set(report.id, createEmptyReportState(report))
        return newMap
      })
      if (autoSelect) {
        setActiveReportId(report.id)
      }
    },
    [],
  )

  // Delete a report
  const deleteReport = useCallback(
    (reportId: string) => {
      setReports((prev) => {
        const newMap = new Map(prev)
        newMap.delete(reportId)
        return newMap
      })
      if (activeReportId === reportId) {
        setActiveReportId(null)
      }
    },
    [activeReportId],
  )

  // Apply a UI event to a specific report
  const dispatchUIEvent = useCallback((reportId: string, event: UIEvent) => {
    setReports((prev) => {
      const reportState = prev.get(reportId)
      if (!reportState) {
        console.warn(`Report "${reportId}" not found`)
        return prev
      }

      const newState = applyUIEvent(reportState, event)
      const newMap = new Map(prev)
      newMap.set(reportId, newState)
      return newMap
    })
  }, [])

  // Clear all reports
  const clearAll = useCallback(() => {
    setReports(new Map())
    setActiveReportId(null)
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch (e) {
      console.error('Failed to clear reports from storage:', e)
    }
  }, [])

  // Get active report state
  const activeReport = activeReportId ? reports.get(activeReportId) : null

  return {
    // State
    reports,
    activeReportId,
    activeReport,
    isHydrated,

    // Actions
    setActiveReportId,
    createReport,
    deleteReport,
    dispatchUIEvent,
    clearAll,
  }
}
