'use client'

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react'
import type { DataTableProps, DataTableColumn } from '@/lib/reports/types'

function formatCellValue(
  value: unknown,
  format?: DataTableColumn['format'],
): string {
  if (value === null || value === undefined) return '-'

  switch (format) {
    case 'number':
      return typeof value === 'number'
        ? new Intl.NumberFormat('en-US').format(value)
        : String(value)
    case 'currency':
      return typeof value === 'number'
        ? new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
          }).format(value)
        : String(value)
    case 'percent':
      return typeof value === 'number'
        ? new Intl.NumberFormat('en-US', {
            style: 'percent',
            minimumFractionDigits: 1,
          }).format(value / 100)
        : String(value)
    case 'date':
      if (value instanceof Date) {
        return value.toLocaleDateString('en-US')
      }
      if (typeof value === 'string' || typeof value === 'number') {
        return new Date(value).toLocaleDateString('en-US')
      }
      return String(value)
    case 'text':
    default:
      return String(value)
  }
}

export function DataTable({
  columns,
  rows,
  pageSize = 10,
  showPagination = true,
  striped = true,
  compact = false,
  sortBy: initialSortBy,
  sortDirection: initialSortDirection = 'asc',
}: DataTableProps) {
  const [sortBy, setSortBy] = useState<string | undefined>(initialSortBy)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(
    initialSortDirection,
  )
  const [currentPage, setCurrentPage] = useState(0)

  const sortedRows = useMemo(() => {
    if (!sortBy) return rows

    return [...rows].sort((a, b) => {
      const aVal = a[sortBy]
      const bVal = b[sortBy]

      if (aVal === null || aVal === undefined) return 1
      if (bVal === null || bVal === undefined) return -1

      let comparison = 0
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal
      } else {
        comparison = String(aVal).localeCompare(String(bVal))
      }

      return sortDirection === 'asc' ? comparison : -comparison
    })
  }, [rows, sortBy, sortDirection])

  const paginatedRows = useMemo(() => {
    if (pageSize === 0 || !showPagination) return sortedRows
    const start = currentPage * pageSize
    return sortedRows.slice(start, start + pageSize)
  }, [sortedRows, currentPage, pageSize, showPagination])

  const totalPages = pageSize > 0 ? Math.ceil(rows.length / pageSize) : 1

  const handleSort = (columnKey: string) => {
    const column = columns.find((c) => c.key === columnKey)
    if (column?.sortable === false) return

    if (sortBy === columnKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(columnKey)
      setSortDirection('asc')
    }
  }

  const alignClasses = {
    left: 'text-left',
    center: 'text-center',
    right: 'text-right',
  }

  const cellPadding = compact ? 'px-3 py-1.5' : 'px-4 py-3'

  return (
    <div className="bg-[var(--report-card-bg)] rounded-lg border border-[var(--report-border)] overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--report-border)] bg-sky-100/50">
              {columns.map((column) => {
                const isSortable = column.sortable !== false
                const isSorted = sortBy === column.key

                return (
                  <th
                    key={column.key}
                    className={`${cellPadding} font-medium text-[var(--report-text-muted)] ${alignClasses[column.align || 'left']} ${isSortable ? 'cursor-pointer hover:text-[var(--report-text)] select-none' : ''}`}
                    style={column.width ? { width: column.width } : undefined}
                    onClick={() => isSortable && handleSort(column.key)}
                  >
                    <div className="flex items-center gap-1">
                      <span>{column.label}</span>
                      {isSortable &&
                        isSorted &&
                        (sortDirection === 'asc' ? (
                          <ChevronUp className="w-4 h-4" />
                        ) : (
                          <ChevronDown className="w-4 h-4" />
                        ))}
                    </div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className={`border-b border-[var(--report-border)] last:border-0 hover:bg-sky-50/50 transition-colors ${striped && rowIndex % 2 === 1 ? 'bg-sky-50/30' : ''}`}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={`${cellPadding} text-[var(--report-text)] ${alignClasses[column.align || 'left']}`}
                  >
                    {formatCellValue(row[column.key], column.format)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showPagination && pageSize > 0 && totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--report-border)] bg-sky-50/50">
          <span className="text-sm text-[var(--report-text-muted)]">
            Showing {currentPage * pageSize + 1} to{' '}
            {Math.min((currentPage + 1) * pageSize, rows.length)} of{' '}
            {rows.length}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(0, p - 1))}
              disabled={currentPage === 0}
              className="p-1 rounded hover:bg-sky-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-[var(--report-text)]" />
            </button>
            <span className="text-sm text-[var(--report-text)]">
              Page {currentPage + 1} of {totalPages}
            </span>
            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(totalPages - 1, p + 1))
              }
              disabled={currentPage >= totalPages - 1}
              className="p-1 rounded hover:bg-sky-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-[var(--report-text)]" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
