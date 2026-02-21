'use client'

import { useState, useEffect, useRef } from 'react'
import { Sparkles, ChevronDown, Trash2, Info, RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { SkillInfo } from './SkillCard'

interface SkillsDropdownProps {
  skills: SkillInfo[]
  onDeleteSkill: (name: string) => void
  onRefresh?: () => void
  isLoading?: boolean
}

export function SkillsDropdown({
  skills,
  onDeleteSkill,
  onRefresh,
  isLoading = false,
}: SkillsDropdownProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isPulsing, setIsPulsing] = useState(false)
  const prevCountRef = useRef(skills.length)

  // Pulse animation when new skill is added
  useEffect(() => {
    if (skills.length > prevCountRef.current) {
      setIsPulsing(true)
      const timer = setTimeout(() => setIsPulsing(false), 300)
      return () => clearTimeout(timer)
    }
    prevCountRef.current = skills.length
  }, [skills.length])

  return (
    <div className="relative">
      <motion.button
        animate={isPulsing ? { scale: [1, 1.1, 1] } : {}}
        transition={{ duration: 0.3 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100 hover:bg-gray-700/50 rounded-lg transition-colors"
      >
        <Sparkles className="w-4 h-4" />
        <span>Skills</span>
        <motion.span
          key={skills.length}
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-xs text-gray-500"
        >
          ({skills.length})
        </motion.span>
        <ChevronDown className="w-3 h-3 text-gray-500" />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-40"
              onClick={() => setIsOpen(false)}
            />

            {/* Dropdown panel */}
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute right-0 top-full mt-2 w-80 bg-gray-900 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
                <h3 className="font-medium text-gray-200">Skills</h3>
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    disabled={isLoading}
                    className={`p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700/50 transition-colors ${
                      isLoading ? 'animate-spin' : ''
                    }`}
                    title="Refresh skills"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="p-2">
                {skills.length === 0 ? (
                  <div className="py-6 text-center">
                    <p className="text-gray-500 text-sm">No skills yet</p>
                    <p className="mt-1 text-xs text-gray-600">
                      The AI will create reusable skills as needed.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-64 overflow-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-gray-700">
                    {skills.map((skill) => (
                      <div
                        key={skill.id}
                        className="group flex items-start gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/50 transition-colors"
                      >
                        <Sparkles className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium text-gray-200 truncate">
                              {skill.name}
                            </p>
                            {skill.invocationCount && skill.invocationCount > 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400">
                                {skill.invocationCount}×
                              </span>
                            )}
                          </div>
                          {skill.description && (
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {skill.description}
                            </p>
                          )}
                          {skill.trustLevel === 'trusted' && (
                            <span className="text-[10px] text-green-400 mt-1 inline-block">
                              ✓ trusted
                            </span>
                          )}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            onDeleteSkill(skill.name)
                          }}
                          className="p-1.5 rounded opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 hover:bg-red-400/10 transition-all"
                          title="Delete skill"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="px-4 py-3 border-t border-gray-700/50 bg-gray-800/30">
                <div className="flex items-start gap-2 text-xs text-gray-500">
                  <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                  <span>Skills persist across sessions and compound over time.</span>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
