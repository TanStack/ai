'use client'

import { motion, AnimatePresence } from 'framer-motion'
import type { UINode, ComponentType } from '@/lib/reports/types'
import {
  VBox,
  HBox,
  Grid,
  Card,
  Section,
  Text,
  Metric,
  Badge,
  Markdown,
  Divider,
  Spacer,
  Button,
  Chart,
  Sparkline,
  DataTable,
  Progress,
  Placeholder,
  ErrorDisplay,
  Empty,
} from './primitives'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const componentMap: Record<ComponentType, React.ComponentType<any>> = {
  vbox: VBox,
  hbox: HBox,
  grid: Grid,
  card: Card,
  section: Section,
  text: Text,
  metric: Metric,
  badge: Badge,
  markdown: Markdown,
  divider: Divider,
  spacer: Spacer,
  button: Button,
  chart: Chart,
  sparkline: Sparkline,
  dataTable: DataTable,
  progress: Progress,
  placeholder: Placeholder,
  error: ErrorDisplay,
  empty: Empty,
}

const nodeVariants = {
  initial: { opacity: 0, y: 10, scale: 0.95 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, scale: 0.95, y: -10 },
}

interface NodeRendererProps {
  node: UINode
  nodes: Map<string, UINode>
}

export function NodeRenderer({ node, nodes }: NodeRendererProps) {
  const Component = componentMap[node.type]
  if (!Component) {
    console.warn(`Unknown component type: ${node.type}`)
    return null
  }

  const children = node.children.map((childId) => {
    const childNode = nodes.get(childId)
    if (!childNode) return null
    return <NodeRenderer key={childId} node={childNode} nodes={nodes} />
  })

  const componentProps =
    node.type === 'button'
      ? { ...node.props, handlers: node.handlers }
      : node.props

  return (
    <motion.div
      variants={nodeVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.2, ease: 'easeOut' }}
      layout
    >
      <Component {...componentProps} id={node.id}>
        {children.length > 0 ? children : undefined}
      </Component>
    </motion.div>
  )
}

interface AnimatedNodeListProps {
  ids: string[]
  nodes: Map<string, UINode>
}

export function AnimatedNodeList({ ids, nodes }: AnimatedNodeListProps) {
  return (
    <AnimatePresence mode="popLayout">
      {ids.map((id) => {
        const node = nodes.get(id)
        if (!node) return null
        // Key is stable (just id), but node prop changes trigger re-renders
        return <NodeRenderer key={id} node={node} nodes={nodes} />
      })}
    </AnimatePresence>
  )
}
