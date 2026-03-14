import { useCallback, useEffect, useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  ChevronDown,
  ChevronRight,
  Code,
  Loader2,
  Play,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { Header } from '@/components'

export const Route = createFileRoute('/_structured-output/structured-output')({
  component: StructuredOutputPage,
})

const FIXED_PROMPT =
  'Use city tools to compare Tokyo and Barcelona. Then produce a concise travel recommendation report with key findings and practical next steps.'

interface SkillWithCode {
  id: string
  name: string
  description: string
  code: string
  trustLevel: 'untrusted' | 'provisional' | 'trusted'
  usageHints?: Array<string>
  stats?: { executions: number; successRate: number }
}

function SkillsDialog({
  open,
  onClose,
  skills,
  onDelete,
  onDeleteAll,
  onRefresh,
  isLoading,
}: {
  open: boolean
  onClose: () => void
  skills: Array<SkillWithCode>
  onDelete: (name: string) => void
  onDeleteAll: () => void
  onRefresh: () => void
  isLoading: boolean
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!open) return null

  const trustColors: Record<string, string> = {
    untrusted: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
    provisional: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    trusted: 'bg-green-500/20 text-green-400 border-green-500/30',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col bg-gray-900 border border-gray-700 rounded-xl shadow-2xl mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-400" />
            <h2 className="font-semibold text-white">
              Registered Skills
              <span className="ml-2 text-sm text-gray-400 font-normal">
                ({skills.length})
              </span>
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors disabled:opacity-50"
              title="Refresh skills"
            >
              <RefreshCw
                className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
            {skills.length > 0 && (
              <button
                onClick={() => {
                  if (confirm(`Delete all ${skills.length} skills?`)) {
                    onDeleteAll()
                  }
                }}
                className="px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/30 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Delete All
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {skills.length === 0 ? (
            <div className="py-12 text-center text-gray-500">
              <Sparkles className="w-8 h-8 mx-auto mb-3 text-gray-600" />
              <p className="text-sm font-medium">No skills registered yet</p>
              <p className="text-xs mt-1 text-gray-600">
                Enable "With Skills" and run the demo — the AI will create
                reusable skills as it works.
              </p>
            </div>
          ) : (
            skills.map((skill) => {
              const isExpanded = expandedId === skill.id
              return (
                <div
                  key={skill.id}
                  className="rounded-lg border border-gray-700 overflow-hidden"
                >
                  <button
                    className="w-full flex items-center gap-3 px-4 py-3 bg-gray-800/50 hover:bg-gray-800 transition-colors text-left"
                    onClick={() => setExpandedId(isExpanded ? null : skill.id)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="text-sm font-mono text-purple-300">
                          skill_{skill.name}
                        </code>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded border ${trustColors[skill.trustLevel] ?? ''}`}
                        >
                          {skill.trustLevel}
                        </span>
                      </div>
                      {skill.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">
                          {skill.description}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        if (confirm(`Delete skill "${skill.name}"?`)) {
                          onDelete(skill.name)
                        }
                      }}
                      className="p-1.5 rounded text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-colors shrink-0"
                      title="Delete skill"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-gray-700 bg-gray-950">
                      <pre className="p-4 text-xs text-gray-300 overflow-x-auto max-h-64 overflow-y-auto font-mono leading-relaxed">
                        {skill.code || '// No code available'}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function StructuredOutputPage() {
  const [result, setResult] = useState<unknown>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const [withSkills, setWithSkills] = useState(false)
  const [skills, setSkills] = useState<Array<SkillWithCode>>([])
  const [isLoadingSkills, setIsLoadingSkills] = useState(false)
  const [skillsDialogOpen, setSkillsDialogOpen] = useState(false)

  const loadSkills = useCallback(async () => {
    setIsLoadingSkills(true)
    try {
      const response = await fetch('/api/structured-output-skills')
      if (response.ok) {
        const data = await response.json()
        setSkills(data)
      }
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      setIsLoadingSkills(false)
    }
  }, [])

  const deleteSkill = useCallback(async (name: string) => {
    try {
      const response = await fetch(
        `/api/structured-output-skills?name=${encodeURIComponent(name)}`,
        { method: 'DELETE' },
      )
      if (response.ok) {
        setSkills((prev) => prev.filter((s) => s.name !== name))
      }
    } catch (err) {
      console.error('Failed to delete skill:', err)
    }
  }, [])

  const deleteAllSkills = useCallback(async () => {
    try {
      const response = await fetch('/api/structured-output-skills?all=true', {
        method: 'DELETE',
      })
      if (response.ok) {
        setSkills([])
      }
    } catch (err) {
      console.error('Failed to delete all skills:', err)
    }
  }, [])

  useEffect(() => {
    if (withSkills) {
      loadSkills()
    }
  }, [withSkills, loadSkills])

  const runDemo = useCallback(async () => {
    setResult(null)
    setError(null)
    setIsLoading(true)

    try {
      const response = await fetch('/api/structured-output', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: FIXED_PROMPT,
          provider: 'anthropic',
          model: 'claude-haiku-4-5',
          withSkills,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        setError(data.error || 'Request failed')
        return
      }

      setResult(data)

      if (withSkills) {
        loadSkills()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed')
    } finally {
      setIsLoading(false)
    }
  }, [withSkills, loadSkills])

  return (
    <div className="flex flex-col h-screen bg-gray-900">
      <Header />

      <div className="flex-1 flex flex-col max-w-5xl mx-auto w-full">
        <div className="border-b border-pink-500/20 bg-gray-800 p-4 space-y-3">
          <p className="text-sm text-gray-400">Fixed prompt:</p>
          <p className="text-sm text-gray-100 bg-gray-900 border border-gray-700 rounded-lg p-3">
            {FIXED_PROMPT}
          </p>

          <div className="flex items-center gap-4">
            <button
              onClick={runDemo}
              disabled={isLoading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-pink-600 hover:bg-pink-500 text-white font-medium disabled:opacity-50"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              {isLoading ? 'Running...' : 'Run Demo'}
            </button>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={withSkills}
                onChange={(e) => setWithSkills(e.target.checked)}
                className="w-4 h-4 accent-purple-500"
              />
              <span className="text-sm text-gray-300">With Skills</span>
            </label>

            {withSkills && (
              <button
                onClick={() => setSkillsDialogOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 border border-purple-500/30 rounded-lg transition-colors"
              >
                <Sparkles className="w-3.5 h-3.5" />
                {skills.length} Skills
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {!result && !error && !isLoading && (
            <div className="flex-1 flex items-center justify-center text-gray-400 px-8 pt-16">
              <div className="max-w-2xl text-center space-y-3">
                <Sparkles className="w-10 h-10 mx-auto text-pink-400/80" />
                <p className="text-lg font-medium">Structured Output Demo</p>
                <p className="text-sm text-gray-500">
                  Click Run Demo. The model will use Code Mode tools to research
                  cities, then return structured JSON.
                </p>
              </div>
            </div>
          )}

          {isLoading && (
            <div className="text-sm text-pink-300 animate-pulse">
              Running Code Mode and generating structured output...
            </div>
          )}

          {error && (
            <div className="text-sm text-red-300 border border-red-500/30 bg-red-900/20 rounded-lg p-3">
              {error}
            </div>
          )}

          {result !== null && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-pink-300">
                <Code className="w-4 h-4" />
                Structured JSON Output
              </div>
              <pre className="text-xs text-gray-100 bg-gray-900 border border-gray-700 rounded-lg p-4 overflow-x-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>

      <SkillsDialog
        open={skillsDialogOpen}
        onClose={() => setSkillsDialogOpen(false)}
        skills={skills}
        onDelete={deleteSkill}
        onDeleteAll={deleteAllSkills}
        onRefresh={loadSkills}
        isLoading={isLoadingSkills}
      />
    </div>
  )
}
