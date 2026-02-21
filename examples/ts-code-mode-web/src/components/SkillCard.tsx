import { Sparkles, Trash2 } from 'lucide-react'

export interface SkillInfo {
  id: string
  name: string
  description: string
  trustLevel: 'untrusted' | 'provisional' | 'trusted'
  usageHints?: Array<string>
  invocationCount?: number
  stats?: {
    executions: number
    successRate: number
  }
}

interface SkillCardProps {
  skill: SkillInfo
  isSelected: boolean
  onDelete?: (name: string) => void
}

export default function SkillCard({ skill, isSelected, onDelete }: SkillCardProps) {
  const trustColors = {
    untrusted: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    provisional: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    trusted: 'bg-green-500/20 text-green-400 border-green-500/30',
  }

  const trustIcons = {
    untrusted: '○',
    provisional: '◐',
    trusted: '✓',
  }

  const handleDelete = () => {
    if (onDelete && confirm(`Delete skill "${skill.name}"?`)) {
      onDelete(skill.name)
    }
  }

  return (
    <div
      className={`p-3 rounded-lg border transition-all ${
        isSelected
          ? 'bg-purple-500/10 border-purple-500/50'
          : 'bg-gray-800/50 border-gray-700 hover:border-gray-600'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Sparkles
              size={14}
              className={isSelected ? 'text-purple-400' : 'text-gray-500'}
            />
            <code className="text-sm font-mono text-purple-300 truncate">
              skill_{skill.name}
            </code>
            {isSelected && (
              <span className="text-xs bg-purple-500/20 text-purple-300 px-1.5 py-0.5 rounded">
                active
              </span>
            )}
          </div>
          <p className="text-xs text-gray-400 mt-1 line-clamp-2">
            {skill.description}
          </p>
        </div>
        {onDelete && (
          <button
            onClick={handleDelete}
            className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Delete skill"
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        <span
          className={`text-xs px-2 py-0.5 rounded border ${
            trustColors[skill.trustLevel]
          }`}
        >
          {trustIcons[skill.trustLevel]} {skill.trustLevel}
        </span>
        {skill.stats && skill.stats.executions > 0 && (
          <span className="text-xs text-gray-500">
            {skill.stats.executions} runs •{' '}
            {Math.round(skill.stats.successRate * 100)}%
          </span>
        )}
      </div>

      {skill.usageHints && skill.usageHints.length > 0 && (
        <p className="text-xs text-gray-500 mt-2 italic truncate">
          💡 {skill.usageHints[0]}
        </p>
      )}
    </div>
  )
}

