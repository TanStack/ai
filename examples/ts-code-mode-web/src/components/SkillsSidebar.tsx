import { useState } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Sparkles,
  Library,
} from 'lucide-react'
import SkillCard from './SkillCard'
import type { SkillInfo } from './SkillCard'

interface SkillsSidebarProps {
  skills: Array<SkillInfo>
  selectedSkillNames: Array<string>
  onRefresh: () => void
  onDelete?: (name: string) => void
  isLoading?: boolean
}

type FilterType = 'all' | 'selected' | 'trusted'

export default function SkillsSidebar({
  skills,
  selectedSkillNames,
  onRefresh,
  onDelete,
  isLoading,
}: SkillsSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [filter, setFilter] = useState<FilterType>('all')

  const filteredSkills = skills.filter((skill) => {
    if (filter === 'selected') return selectedSkillNames.includes(skill.name)
    if (filter === 'trusted') return skill.trustLevel === 'trusted'
    return true
  })

  const trustedCount = skills.filter((s) => s.trustLevel === 'trusted').length
  const totalExecutions = skills.reduce(
    (sum, s) => sum + (s.stats?.executions || 0),
    0
  )

  if (isCollapsed) {
    return (
      <div className="w-12 bg-gray-900 border-r border-gray-700 flex flex-col items-center py-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="text-gray-400 hover:text-white p-2 hover:bg-gray-800 rounded-lg transition-colors"
          title="Expand skills panel"
        >
          <ChevronRight size={20} />
        </button>
        <div className="mt-4 flex flex-col items-center gap-2">
          <Library size={16} className="text-purple-400" />
          <span className="text-xs text-gray-500 writing-vertical">
            {skills.length} skills
          </span>
        </div>
      </div>
    )
  }

  return (
    <div className="w-80 bg-gray-900 border-r border-gray-700 flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Sparkles size={20} className="text-purple-400" />
          Skills
          <span className="text-sm text-gray-500">({skills.length})</span>
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className={`text-gray-400 hover:text-white p-1.5 hover:bg-gray-800 rounded transition-colors ${
              isLoading ? 'animate-spin' : ''
            }`}
            title="Refresh skills"
          >
            <RefreshCw size={16} />
          </button>
          <button
            onClick={() => setIsCollapsed(true)}
            className="text-gray-400 hover:text-white p-1.5 hover:bg-gray-800 rounded transition-colors"
            title="Collapse panel"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-gray-700">
        {(['all', 'selected', 'trusted'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 px-3 py-2 text-sm transition-colors ${
              filter === f
                ? 'text-purple-400 border-b-2 border-purple-400 bg-purple-500/5'
                : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            {f === 'all' && 'All'}
            {f === 'selected' && `Active (${selectedSkillNames.length})`}
            {f === 'trusted' && `Trusted (${trustedCount})`}
          </button>
        ))}
      </div>

      {/* Skills List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700">
        {filteredSkills.length === 0 ? (
          <div className="text-center text-gray-500 py-8 px-4">
            {skills.length === 0 ? (
              <>
                <Library size={32} className="mx-auto mb-3 text-gray-600" />
                <p className="text-sm font-medium mb-2">No skills yet</p>
                <p className="text-xs">
                  The AI will create reusable skills as it solves problems.
                  Skills persist across sessions!
                </p>
              </>
            ) : filter === 'selected' ? (
              <>
                <p className="text-sm">No skills active for this conversation.</p>
                <p className="text-xs mt-2">
                  Skills are automatically selected based on your message context.
                </p>
              </>
            ) : (
              <p className="text-sm">No {filter} skills found.</p>
            )}
          </div>
        ) : (
          filteredSkills.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              isSelected={selectedSkillNames.includes(skill.name)}
              onDelete={onDelete}
            />
          ))
        )}
      </div>

      {/* Footer with stats */}
      {skills.length > 0 && (
        <div className="p-3 border-t border-gray-700 text-xs text-gray-500">
          <div className="flex justify-between">
            <span>
              {trustedCount} trusted • {skills.length - trustedCount} building
            </span>
            <span>{totalExecutions} total runs</span>
          </div>
        </div>
      )}
    </div>
  )
}

