'use client'

import { useState } from 'react'
import { ChevronRight, ChevronDown, Trash2, GripVertical } from 'lucide-react'
import type { UINode, ComponentType } from '@/lib/reports/types'

// Components that can have children (layout components)
const CONTAINER_TYPES: Set<ComponentType> = new Set([
  'vbox',
  'hbox',
  'grid',
  'card',
  'section',
])

interface ComponentTreeProps {
  nodes: Map<string, UINode>
  rootIds: string[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}

interface TreeNodeProps {
  node: UINode
  nodes: Map<string, UINode>
  depth: number
  selectedId: string | null
  onSelect: (id: string | null) => void
  onDelete: (id: string) => void
}

function TreeNode({
  node,
  nodes,
  depth,
  selectedId,
  onSelect,
  onDelete,
}: TreeNodeProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const hasChildren = node.children.length > 0
  const isContainer = CONTAINER_TYPES.has(node.type)
  const isSelected = selectedId === node.id

  const childNodes = node.children
    .map((childId) => nodes.get(childId))
    .filter((n): n is UINode => n !== undefined)

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 hover:bg-gray-700/50 cursor-pointer transition-colors group ${
          isSelected ? 'bg-cyan-500/20 border-l-2 border-cyan-500' : ''
        }`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => onSelect(isSelected ? null : node.id)}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
            className="p-0.5 hover:bg-gray-600 rounded"
          >
            {isExpanded ? (
              <ChevronDown className="w-3 h-3 text-gray-400" />
            ) : (
              <ChevronRight className="w-3 h-3 text-gray-400" />
            )}
          </button>
        ) : (
          <span className="w-4" />
        )}

        {/* Drag handle (visual only for now) */}
        <GripVertical className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Node info */}
        <span className="text-xs font-mono text-cyan-400">{node.type}</span>
        <span className="text-xs text-gray-500">#{node.id}</span>

        {/* Container badge */}
        {isContainer && (
          <span className="text-xs text-gray-600 ml-auto mr-6">
            ({node.children.length})
          </span>
        )}

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete(node.id)
          }}
          className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded opacity-0 group-hover:opacity-100 transition-all absolute right-2"
          title="Delete node"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {childNodes.map((childNode) => (
            <TreeNode
              key={childNode.id}
              node={childNode}
              nodes={nodes}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function ComponentTree({
  nodes,
  rootIds,
  selectedId,
  onSelect,
  onDelete,
}: ComponentTreeProps) {
  const rootNodes = rootIds
    .map((id) => nodes.get(id))
    .filter((n): n is UINode => n !== undefined)

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-300">
          Component Tree ({nodes.size})
        </span>
      </div>

      <div className="flex-1 overflow-y-auto relative">
        {rootNodes.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No components yet
          </div>
        ) : (
          <div className="py-1">
            {rootNodes.map((node) => (
              <TreeNode
                key={node.id}
                node={node}
                nodes={nodes}
                depth={0}
                selectedId={selectedId}
                onSelect={onSelect}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
