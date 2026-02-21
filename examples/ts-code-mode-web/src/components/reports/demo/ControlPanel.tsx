'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, RefreshCw, Trash2 } from 'lucide-react'
import type { UINode, ComponentType, UIEvent } from '@/lib/reports/types'

const COMPONENT_CATEGORIES: Record<string, ComponentType[]> = {
  Layout: ['vbox', 'hbox', 'grid', 'card', 'section'],
  Content: ['text', 'metric', 'badge', 'markdown', 'divider', 'spacer', 'button'],
  Data: ['chart', 'sparkline', 'dataTable', 'progress'],
  Special: ['placeholder', 'error', 'empty'],
  Interactive: ['excalidraw'],
}

// Default props for each component type
const DEFAULT_PROPS: Record<ComponentType, Record<string, unknown>> = {
  vbox: { gap: 'md' },
  hbox: { gap: 'md', justify: 'start' },
  grid: { cols: 3, gap: 'md' },
  card: { title: 'Card Title', variant: 'default' },
  section: { title: 'Section Title', defaultOpen: true },
  text: { content: 'Sample text', variant: 'body' },
  metric: { value: 1234, label: 'Metric Label', format: 'number' },
  badge: { label: 'Badge', variant: 'default' },
  markdown: { content: '**Bold** and *italic* text' },
  divider: { variant: 'solid', spacing: 'md' },
  spacer: { size: 'md' },
  chart: {
    type: 'line',
    data: [
      { x: 'A', y: 10 },
      { x: 'B', y: 20 },
      { x: 'C', y: 15 },
    ],
    xKey: 'x',
    yKey: 'y',
    height: 200,
  },
  sparkline: { data: [5, 10, 8, 15, 12, 20], height: 32, width: 100 },
  dataTable: {
    columns: [
      { key: 'name', label: 'Name' },
      { key: 'value', label: 'Value' },
    ],
    rows: [
      { name: 'Item 1', value: 100 },
      { name: 'Item 2', value: 200 },
    ],
  },
  progress: { value: 65, label: 'Progress', showValue: true },
  placeholder: { height: 100, label: 'Loading...' },
  error: { message: 'An error occurred', variant: 'inline' },
  empty: { title: 'No data', description: 'Add some data to get started' },
  button: { label: 'Click Me', variant: 'primary' },
  excalidraw: { width: '100%', height: 400, elements: [], theme: 'light' },
}

interface ControlPanelProps {
  nodes: Map<string, UINode>
  selectedId: string | null
  onDispatch: (event: UIEvent) => void
  onSelectId: (id: string | null) => void
}

export function ControlPanel({
  nodes,
  selectedId,
  onDispatch,
  onSelectId,
}: ControlPanelProps) {
  const [componentType, setComponentType] = useState<ComponentType>('card')
  const [componentId, setComponentId] = useState('')
  const [parentId, setParentId] = useState<string>('')
  const [propsJson, setPropsJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)

  // Generate a unique ID suggestion
  const suggestedId = useMemo(() => {
    const base = componentType
    let counter = 1
    while (nodes.has(`${base}-${counter}`)) {
      counter++
    }
    return `${base}-${counter}`
  }, [componentType, nodes])

  // Update props when component type changes
  useEffect(() => {
    const defaultProps = DEFAULT_PROPS[componentType] || {}
    setPropsJson(JSON.stringify(defaultProps, null, 2))
    setJsonError(null)
  }, [componentType])

  // Update form when a node is selected
  useEffect(() => {
    if (selectedId) {
      const node = nodes.get(selectedId)
      if (node) {
        setComponentType(node.type)
        setComponentId(node.id)
        setPropsJson(JSON.stringify(node.props, null, 2))
        // Find parent
        for (const [id, n] of nodes) {
          if (n.children.includes(selectedId)) {
            setParentId(id)
            return
          }
        }
        setParentId('') // It's a root node
      }
    }
  }, [selectedId, nodes])

  // Get all container nodes for parent dropdown
  const containerNodes = useMemo(() => {
    const containers: Array<{ id: string; type: ComponentType }> = []
    nodes.forEach((node, id) => {
      if (['vbox', 'hbox', 'grid', 'card', 'section'].includes(node.type)) {
        containers.push({ id, type: node.type })
      }
    })
    return containers
  }, [nodes])

  const validateJson = (json: string): Record<string, unknown> | null => {
    try {
      const parsed = JSON.parse(json)
      setJsonError(null)
      return parsed
    } catch (e) {
      setJsonError((e as Error).message)
      return null
    }
  }

  const handleAdd = () => {
    const props = validateJson(propsJson)
    if (!props) return

    const id = componentId || suggestedId
    if (nodes.has(id)) {
      setJsonError(`ID "${id}" already exists`)
      return
    }

    const event: UIEvent = {
      op: 'add',
      id,
      type: componentType,
      props,
      ...(parentId ? { parentId } : {}),
    }

    onDispatch(event)
    setComponentId('')
    onSelectId(null)
  }

  const handleUpdate = () => {
    if (!selectedId) return

    const props = validateJson(propsJson)
    if (!props) return

    const event: UIEvent = {
      op: 'update',
      id: selectedId,
      props,
    }

    onDispatch(event)
  }

  const handleDelete = () => {
    if (!selectedId) return

    const event: UIEvent = {
      op: 'remove',
      id: selectedId,
    }

    onDispatch(event)
    onSelectId(null)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-300">Control Panel</span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Component Type */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Component Type
          </label>
          <select
            value={componentType}
            onChange={(e) => setComponentType(e.target.value as ComponentType)}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
          >
            {Object.entries(COMPONENT_CATEGORIES).map(([category, types]) => (
              <optgroup key={category} label={category}>
                {types.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Component ID */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            ID {!selectedId && <span className="text-gray-600">(auto: {suggestedId})</span>}
          </label>
          <input
            type="text"
            value={componentId}
            onChange={(e) => setComponentId(e.target.value)}
            placeholder={suggestedId}
            disabled={!!selectedId}
            className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:opacity-50"
          />
        </div>

        {/* Parent (only for add) */}
        {!selectedId && (
          <div>
            <label className="block text-xs text-gray-400 mb-1">
              Parent {!parentId && <span className="text-gray-600">(root)</span>}
            </label>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-500"
            >
              <option value="">— Root Level —</option>
              {containerNodes.map(({ id, type }) => (
                <option key={id} value={id}>
                  {type} #{id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Props JSON */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">
            Props (JSON)
          </label>
          <textarea
            value={propsJson}
            onChange={(e) => {
              setPropsJson(e.target.value)
              validateJson(e.target.value)
            }}
            rows={8}
            className={`w-full bg-gray-800 border rounded px-2 py-1.5 text-sm text-white font-mono focus:outline-none focus:ring-1 focus:ring-cyan-500 resize-none ${
              jsonError ? 'border-red-500' : 'border-gray-700'
            }`}
          />
          {jsonError && (
            <p className="text-xs text-red-400 mt-1">{jsonError}</p>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          {selectedId ? (
            <>
              <button
                onClick={handleUpdate}
                disabled={!!jsonError}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Update
              </button>
              <button
                onClick={handleDelete}
                className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white text-sm rounded transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => {
                  onSelectId(null)
                  setComponentId('')
                }}
                className="px-3 py-2 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
              >
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={handleAdd}
              disabled={!!jsonError}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Component
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
