'use client'

import { FileText, Sparkles, BarChart3, Table2 } from 'lucide-react'

interface EmptyReportStateProps {
  onSuggestionClick?: (suggestion: string) => void
}

const SUGGESTIONS = [
  {
    icon: BarChart3,
    label: 'Compare Libraries',
    prompt: 'Create a report comparing zustand, jotai, and redux-toolkit',
  },
  {
    icon: Table2,
    label: 'Package Analysis',
    prompt: 'Create a detailed report analyzing @tanstack/query',
  },
  {
    icon: Sparkles,
    label: 'Framework Battle',
    prompt: 'Create a report comparing React, Vue, and Svelte popularity',
  },
]

export function EmptyReportState({ onSuggestionClick }: EmptyReportStateProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      {/* Icon */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/20 flex items-center justify-center">
          <FileText className="w-10 h-10 text-cyan-400" />
        </div>
        <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-purple-500/30 border border-purple-400/50 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-purple-300" />
        </div>
      </div>

      {/* Text */}
      <h2 className="text-2xl font-bold text-white mb-3">Create a Report</h2>
      <p className="text-gray-400 max-w-md mb-8 leading-relaxed">
        Ask the AI to create interactive reports with charts, metrics, and data
        tables. Watch as components build up in real-time!
      </p>

      {/* Suggestions */}
      <div className="w-full max-w-lg space-y-2">
        <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Try these examples
        </p>
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion.label}
            onClick={() => onSuggestionClick?.(suggestion.prompt)}
            className="w-full flex items-center gap-4 px-4 py-3 rounded-xl bg-gray-800/50 hover:bg-gray-800 border border-gray-700/50 hover:border-cyan-500/30 text-left transition-all group"
          >
            <div className="w-10 h-10 rounded-lg bg-gray-700/50 group-hover:bg-cyan-500/20 flex items-center justify-center transition-colors">
              <suggestion.icon className="w-5 h-5 text-gray-400 group-hover:text-cyan-400 transition-colors" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-white">
                {suggestion.label}
              </p>
              <p className="text-xs text-gray-500 line-clamp-1">
                {suggestion.prompt}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* Tip */}
      <div className="mt-8 px-4 py-3 rounded-lg bg-purple-500/10 border border-purple-500/20 max-w-md">
        <p className="text-xs text-purple-300">
          <span className="font-medium">Pro tip:</span> You can ask the AI to
          modify existing reports by referencing them by name.
        </p>
      </div>
    </div>
  )
}
