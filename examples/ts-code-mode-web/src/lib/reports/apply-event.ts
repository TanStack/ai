import type {
  RefreshResult,
  Report,
  UINode,
  UIEvent,
  ReportState,
  UIUpdate,
} from './types'

/**
 * Apply a UIEvent to a ReportState, returning a new immutable state.
 * This pure function can be used to process report events from the server.
 */
export function applyUIEvent(state: ReportState, event: UIEvent): ReportState {
  const { nodes, rootIds, report } = state
  const newNodes = new Map(nodes)
  let newRootIds = [...rootIds]

  switch (event.op) {
    case 'add': {
      const node: UINode = {
        id: event.id,
        type: event.type,
        props: event.props,
        children: [],
        handlers: event.handlers,
        subscriptions: event.subscriptions,
        dataSource: event.dataSource,
      }

      newNodes.set(event.id, node)

      if (event.parentId) {
        const parent = newNodes.get(event.parentId)
        if (parent) {
          newNodes.set(event.parentId, {
            ...parent,
            children: [...parent.children, event.id],
          })
        }
      } else {
        newRootIds = [...newRootIds, event.id]
      }
      break
    }

    case 'update': {
      const node = newNodes.get(event.id)
      if (node) {
        newNodes.set(event.id, {
          ...node,
          props: { ...node.props, ...event.props },
        })
      }
      break
    }

    case 'remove': {
      // Collect all descendant IDs recursively
      const toRemove = new Set<string>()
      const collect = (id: string) => {
        toRemove.add(id)
        const node = newNodes.get(id)
        node?.children.forEach(collect)
      }
      collect(event.id)

      // Remove nodes
      toRemove.forEach((id) => newNodes.delete(id))

      // Remove from parent's children
      newNodes.forEach((node, id) => {
        const filtered = node.children.filter(
          (childId) => !toRemove.has(childId),
        )
        if (filtered.length !== node.children.length) {
          newNodes.set(id, { ...node, children: filtered })
        }
      })

      // Remove from root
      newRootIds = newRootIds.filter((id) => !toRemove.has(id))
      break
    }

    case 'reorder': {
      if (event.parentId) {
        const parent = newNodes.get(event.parentId)
        if (parent) {
          newNodes.set(event.parentId, {
            ...parent,
            children: event.childIds,
          })
        }
      } else {
        newRootIds = event.childIds
      }
      break
    }
  }

  return {
    report: { ...report, updatedAt: Date.now() },
    nodes: newNodes,
    rootIds: newRootIds,
  }
}

/**
 * Create an empty ReportState from a Report
 */
export function createEmptyReportState(report: Report): ReportState {
  return {
    report,
    nodes: new Map(),
    rootIds: [],
  }
}

/**
 * Apply handler-driven UI updates to a ReportState.
 */
export function applyUIUpdates(
  state: ReportState,
  updates: UIUpdate[],
): ReportState {
  let nextState = state

  for (const update of updates) {
    if (update.type === 'update') {
      nextState = applyUIEvent(nextState, {
        op: 'update',
        id: update.componentId,
        props: update.props ?? {},
      })
    } else if (update.type === 'remove') {
      nextState = applyUIEvent(nextState, {
        op: 'remove',
        id: update.componentId,
      })
    }
  }

  return nextState
}

/**
 * Apply refresh results from subscription invalidation.
 * Merges the new props from each result into the corresponding component.
 */
export function applyRefreshResults(
  state: ReportState,
  results: RefreshResult[],
): ReportState {
  let nextState = state

  for (const result of results) {
    if (!result.success || !result.props) continue

    nextState = applyUIEvent(nextState, {
      op: 'update',
      id: result.componentId,
      props: result.props,
    })
  }

  return nextState
}
