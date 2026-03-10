import { useState, useCallback, useMemo } from 'react'
import type { Report, UINode, UIEvent } from '@/lib/reports/types'

interface UseReportStateOptions {
  initialReport?: Report
}

interface UseReportStateReturn {
  // State
  report: Report | null
  nodes: Map<string, UINode>
  rootIds: string[]

  // Actions
  createReport: (id: string, title: string) => void
  dispatch: (event: UIEvent) => void
  reset: () => void

  // Computed
  getNode: (id: string) => UINode | undefined
  getChildren: (parentId: string) => UINode[]
  getRootNodes: () => UINode[]
}

export function useReportState(
  options?: UseReportStateOptions,
): UseReportStateReturn {
  const [report, setReport] = useState<Report | null>(
    options?.initialReport ?? null,
  )
  const [nodes, setNodes] = useState<Map<string, UINode>>(new Map())
  const [rootIds, setRootIds] = useState<string[]>([])

  const createReport = useCallback((id: string, title: string) => {
    const now = Date.now()
    setReport({
      id,
      title,
      createdAt: now,
      updatedAt: now,
    })
    setNodes(new Map())
    setRootIds([])
  }, [])

  const dispatch = useCallback((event: UIEvent) => {
    switch (event.op) {
      case 'add': {
        const node: UINode = {
          id: event.id,
          type: event.type,
          props: event.props,
          children: [],
          handlers: event.handlers,
        }

        setNodes((prev) => {
          const newMap = new Map(prev)
          newMap.set(event.id, node)

          if (event.parentId) {
            // Add to parent's children
            const parent = newMap.get(event.parentId)
            if (parent) {
              newMap.set(event.parentId, {
                ...parent,
                children: [...parent.children, event.id],
              })
            }
          }

          return newMap
        })

        if (!event.parentId) {
          // Add to root
          setRootIds((prev) => [...prev, event.id])
        }

        // Update report timestamp
        setReport((prev) => (prev ? { ...prev, updatedAt: Date.now() } : prev))
        break
      }

      case 'update': {
        setNodes((prev) => {
          const newMap = new Map(prev)
          const node = newMap.get(event.id)
          if (node) {
            newMap.set(event.id, {
              ...node,
              props: { ...node.props, ...event.props },
            })
          }
          return newMap
        })
        setReport((prev) => (prev ? { ...prev, updatedAt: Date.now() } : prev))
        break
      }

      case 'remove': {
        setNodes((prev) => {
          // Recursively collect all descendant IDs
          const toRemove = new Set<string>()
          const collectDescendants = (id: string) => {
            toRemove.add(id)
            const node = prev.get(id)
            node?.children.forEach(collectDescendants)
          }
          collectDescendants(event.id)

          // Remove from nodes
          const newMap = new Map(prev)
          toRemove.forEach((id) => newMap.delete(id))

          // Remove from parent's children
          newMap.forEach((node, id) => {
            if (node.children.some((childId) => toRemove.has(childId))) {
              newMap.set(id, {
                ...node,
                children: node.children.filter(
                  (childId) => !toRemove.has(childId),
                ),
              })
            }
          })

          return newMap
        })

        // We need to get toRemove again for rootIds update
        setRootIds((prev) => {
          // We need to recalculate toRemove here since we can't access closure
          // For simplicity, just filter by checking if node still exists
          return prev.filter((id) => id !== event.id)
        })

        setReport((prev) => (prev ? { ...prev, updatedAt: Date.now() } : prev))
        break
      }

      case 'reorder': {
        if (event.parentId) {
          setNodes((prev) => {
            const newMap = new Map(prev)
            const parent = newMap.get(event.parentId!)
            if (parent) {
              newMap.set(event.parentId!, {
                ...parent,
                children: event.childIds,
              })
            }
            return newMap
          })
        } else {
          setRootIds(event.childIds)
        }
        setReport((prev) => (prev ? { ...prev, updatedAt: Date.now() } : prev))
        break
      }
    }
  }, [])

  const reset = useCallback(() => {
    setReport(null)
    setNodes(new Map())
    setRootIds([])
  }, [])

  const getNode = useCallback(
    (id: string) => {
      return nodes.get(id)
    },
    [nodes],
  )

  const getChildren = useCallback(
    (parentId: string): UINode[] => {
      const parent = nodes.get(parentId)
      if (!parent) return []
      return parent.children
        .map((childId) => nodes.get(childId))
        .filter((node): node is UINode => node !== undefined)
    },
    [nodes],
  )

  const getRootNodes = useCallback((): UINode[] => {
    return rootIds
      .map((id) => nodes.get(id))
      .filter((node): node is UINode => node !== undefined)
  }, [nodes, rootIds])

  return useMemo(
    () => ({
      report,
      nodes,
      rootIds,
      createReport,
      dispatch,
      reset,
      getNode,
      getChildren,
      getRootNodes,
    }),
    [
      report,
      nodes,
      rootIds,
      createReport,
      dispatch,
      reset,
      getNode,
      getChildren,
      getRootNodes,
    ],
  )
}
