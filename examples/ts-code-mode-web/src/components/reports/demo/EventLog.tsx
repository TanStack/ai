'use client'

import { Plus, RefreshCw, Trash2, ArrowUpDown, X } from 'lucide-react'
import type { UIEvent } from '@/lib/reports/types'

interface EventLogEntry {
  id: string
  event: UIEvent
  timestamp: number
}

interface EventLogProps {
  events: EventLogEntry[]
  onClear: () => void
  onReplay?: (event: UIEvent) => void
}

const opIcons = {
  add: Plus,
  update: RefreshCw,
  remove: Trash2,
  reorder: ArrowUpDown,
}

const opColors = {
  add: 'text-green-400 bg-green-500/20',
  update: 'text-blue-400 bg-blue-500/20',
  remove: 'text-red-400 bg-red-500/20',
  reorder: 'text-amber-400 bg-amber-500/20',
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

function getEventSummary(event: UIEvent): string {
  switch (event.op) {
    case 'add':
      return `${event.type}${event.parentId ? ` → ${event.parentId}` : ''}`
    case 'update':
      return `${Object.keys(event.props).join(', ')}`
    case 'remove':
      return event.id
    case 'reorder':
      return `${event.childIds.length} items${event.parentId ? ` in ${event.parentId}` : ''}`
  }
}

export function EventLog({ events, onClear, onReplay }: EventLogProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-300">
          Event Log ({events.length})
        </span>
        <button
          onClick={onClear}
          disabled={events.length === 0}
          className="p-1 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Clear log"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No events yet
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {events.map((entry) => {
              const Icon = opIcons[entry.event.op]
              const colorClass = opColors[entry.event.op]

              return (
                <div
                  key={entry.id}
                  className={`px-3 py-2 hover:bg-gray-800/50 transition-colors ${onReplay ? 'cursor-pointer' : ''}`}
                  onClick={() => onReplay?.(entry.event)}
                  title={onReplay ? 'Click to replay' : undefined}
                >
                  <div className="flex items-center gap-2">
                    <div className={`p-1 rounded ${colorClass}`}>
                      <Icon className="w-3 h-3" />
                    </div>
                    <span className="text-xs font-mono text-gray-400">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                  <div className="mt-1 ml-7">
                    <span className="text-sm font-medium text-gray-200">
                      {entry.event.op}
                    </span>
                    {entry.event.op !== 'reorder' && 'id' in entry.event && (
                      <span className="text-sm text-cyan-400 ml-2">
                        #{entry.event.id}
                      </span>
                    )}
                    <p className="text-xs text-gray-500 truncate">
                      {getEventSummary(entry.event)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
