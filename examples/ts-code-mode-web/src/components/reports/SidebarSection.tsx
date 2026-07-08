'use client'

import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface SidebarSectionProps {
  title: string
  count?: number
  defaultOpen?: boolean
  collapsible?: boolean
  className?: string
  minHeight?: number
  actions?: ReactNode
  /** When true, content will grow to fill available space and be scrollable */
  flexContent?: boolean
  children: ReactNode
}

export function SidebarSection({
  title,
  count,
  defaultOpen = true,
  collapsible = true,
  className = '',
  minHeight,
  actions,
  flexContent = false,
  children,
}: SidebarSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div
      className={`flex flex-col border-b border-gray-700/50 ${flexContent ? 'min-h-0' : ''} ${className}`}
      style={minHeight && isOpen ? { minHeight } : undefined}
    >
      {/* Header */}
      <button
        onClick={() => collapsible && setIsOpen(!isOpen)}
        disabled={!collapsible}
        className={`flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-colors shrink-0 ${
          collapsible
            ? 'text-gray-300 hover:bg-gray-800/50 cursor-pointer'
            : 'text-gray-300 cursor-default'
        }`}
      >
        <div className="flex items-center gap-2">
          {collapsible && (
            <span className="text-gray-500">
              {isOpen ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </span>
          )}
          <span>{title}</span>
          {count !== undefined && (
            <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-700/50 text-gray-400">
              {count}
            </span>
          )}
        </div>
        {actions && (
          <div
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1"
          >
            {actions}
          </div>
        )}
      </button>

      {/* Content */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: flexContent ? '100%' : 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className={
              flexContent
                ? 'flex-1 min-h-0 flex flex-col'
                : 'overflow-hidden flex-1'
            }
          >
            <div
              className={
                flexContent
                  ? 'px-2 pb-2 flex-1 min-h-0 flex flex-col overflow-hidden'
                  : 'px-2 pb-2'
              }
            >
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
