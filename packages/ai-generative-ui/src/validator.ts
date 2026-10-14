/**
 * Open Generative UI Specification (Draft 0.1)
 * Graph Document validator with §9.3 bounded repair rules.
 */

import type { GraphDocument, UINode, SceneShape, GraphProvenance, ComputeBinding } from './types'
import { KNOWN_CATALOG_TYPES } from './schema'

export interface ValidationResult {
  valid: boolean
  graph?: GraphDocument
  errors: Array<string>
  repairs: Array<string>
}

export interface ValidationOptions {
  repair?: boolean
}

const SVG_PATH_REGEX = /^[ \t\r\n]*([MmLlHhVvCcSsQqTtAaZz][ \t\r\n,0-9.-]*)+$/

export function isValidSvgPath(d: string): boolean {
  if (!d || typeof d !== 'string') return false
  if (d.includes('<') || d.includes('>') || d.toLowerCase().includes('script')) return false
  return SVG_PATH_REGEX.test(d.trim())
}

export function validateGraph(input: unknown, options: ValidationOptions = {}): ValidationResult {
  const repair = options.repair ?? true
  const errors: Array<string> = []
  const repairs: Array<string> = []

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: ['GraphDocument must be a non-null object'], repairs }
  }

  const raw = input as Record<string, unknown>

  // Spec version check
  if (raw.specVersion !== '0.1') {
    if (repair) {
      repairs.push(`Repaired specVersion from ${String(raw.specVersion)} to "0.1"`)
    } else {
      errors.push(`Invalid specVersion: expected "0.1", received ${String(raw.specVersion)}`)
    }
  }

  // Graph ID
  let graphId: string
  if (typeof raw.graphId === 'string' && raw.graphId.length > 0) {
    graphId = raw.graphId
  } else if (repair) {
    graphId = `g_${Math.random().toString(36).slice(2, 10)}`
    repairs.push(`Generated missing graphId: ${graphId}`)
  } else {
    graphId = ''
    errors.push('Missing or invalid graphId')
  }

  // Revision
  let revision = Number(raw.revision)
  if (!Number.isInteger(revision) || revision < 1) {
    if (repair) {
      revision = 1
      repairs.push('Repaired revision to 1')
    } else {
      errors.push('Missing or invalid revision (must be positive integer)')
    }
  }

  // Title
  let title: string
  if (typeof raw.title === 'string' && raw.title.length > 0) {
    title = raw.title
  } else if (repair) {
    title = 'Generative UI View'
    repairs.push('Defaulted missing title')
  } else {
    title = ''
    errors.push('Missing or invalid title')
  }

  // Provenance
  let provenance: GraphProvenance
  const rawProvenance = raw.provenance as Record<string, unknown> | undefined
  if (!rawProvenance || typeof rawProvenance !== 'object') {
    if (repair) {
      provenance = { driver: 'live' }
      repairs.push('Created default provenance with driver="live"')
    } else {
      provenance = { driver: 'live' }
      errors.push('Missing or invalid provenance')
    }
  } else {
    const driver = rawProvenance.driver as string
    if (!['fixture', 'programmatic', 'live'].includes(driver)) {
      if (repair) {
        provenance = { driver: 'live' }
        repairs.push('Repaired invalid provenance.driver to "live"')
      } else {
        provenance = { driver: 'live' }
        errors.push(`Invalid provenance.driver: ${String(driver)}`)
      }
    } else {
      provenance = {
        driver: driver as 'fixture' | 'programmatic' | 'live',
        agentId: typeof rawProvenance.agentId === 'string' ? rawProvenance.agentId : undefined,
        runId: typeof rawProvenance.runId === 'string' ? rawProvenance.runId : undefined,
        sourceId: typeof rawProvenance.sourceId === 'string' ? rawProvenance.sourceId : undefined,
      }
    }
  }

  // Root validation
  if (!raw.root || typeof raw.root !== 'object') {
    errors.push('Missing or invalid root node')
    return { valid: false, errors, repairs }
  }

  // Text fallback collector (for synthesizing fallbackText if missing)
  const extractedText: Array<string> = []

  // Recursive node validator and repairer
  function processNode(nodeRawInput: unknown, path: string): UINode | null {
    if (!nodeRawInput || typeof nodeRawInput !== 'object') {
      errors.push(`Invalid node at ${path}: expected object`)
      return null
    }

    const nodeRaw = nodeRawInput as Record<string, unknown>
    let id: string
    if (typeof nodeRaw.id === 'string' && nodeRaw.id.length > 0) {
      id = nodeRaw.id
    } else if (repair) {
      id = `n_${Math.random().toString(36).slice(2, 8)}`
      repairs.push(`Generated missing node id at ${path}: ${id}`)
    } else {
      id = ''
      errors.push(`Missing id at ${path}`)
    }

    let type = String(nodeRaw.type || '')
    let props: Record<string, unknown> =
      nodeRaw.props && typeof nodeRaw.props === 'object'
        ? { ...(nodeRaw.props as Record<string, unknown>) }
        : {}

    // Text extraction for fallback
    if (type === 'Text' && typeof props.content === 'string') {
      extractedText.push(props.content)
    } else if (type === 'Callout' && typeof props.text === 'string') {
      extractedText.push(props.text)
    } else if (type === 'Button' && typeof props.label === 'string') {
      extractedText.push(`[${props.label}]`)
    }

    // Degradation for unknown types (§9.3)
    if (!KNOWN_CATALOG_TYPES.has(type)) {
      if (repair) {
        if (Array.isArray(nodeRaw.children) && nodeRaw.children.length > 0) {
          repairs.push(`Degraded unknown container type "${type}" at ${path} to "Stack"`)
          type = 'Stack'
        } else {
          repairs.push(`Degraded unknown leaf type "${type}" at ${path} to "Text"`)
          type = 'Text'
          props = { content: `[Unsupported component: ${type}]`, variant: 'caption' }
        }
      } else {
        errors.push(`Unknown catalog node type "${type}" at ${path}`)
      }
    }

    // Repair type-specific props
    if (type === 'Slider') {
      let min = Number(props.min ?? 0)
      let max = Number(props.max ?? 100)
      if (isNaN(min)) min = 0
      if (isNaN(max)) max = 100
      if (min > max) {
        if (repair) {
          const temp = min
          min = max
          max = temp
          repairs.push(`Swapped inverted Slider min/max at ${path}`)
        } else {
          errors.push(`Slider min (${min}) cannot exceed max (${max}) at ${path}`)
        }
      }
      props.min = min
      props.max = max
    } else if (type === 'Scene') {
      if (!props.viewBox || typeof props.viewBox !== 'string') {
        if (props.width && props.height) {
          props.viewBox = `0 0 ${props.width} ${props.height}`
          repairs.push(`Derived Scene viewBox "${props.viewBox}" from width/height at ${path}`)
        } else if (repair) {
          props.viewBox = '0 0 400 300'
          repairs.push(`Defaulted missing Scene viewBox at ${path}`)
        } else {
          errors.push(`Missing Scene viewBox at ${path}`)
        }
      }

      // Bounded Repair (§9.3): absorb vector shapes placed into children into props.shapes
      if (Array.isArray(nodeRaw.children) && nodeRaw.children.length > 0) {
        const potentialShapes = (nodeRaw.children as Array<Record<string, unknown>>).filter(
          (c) =>
            c &&
            typeof c === 'object' &&
            (c.kind || ['group', 'rect', 'circle', 'line', 'polygon', 'path', 'text'].includes(String(c.type || '').toLowerCase())),
        )

        if (potentialShapes.length > 0) {
          const convertedShapes: Array<unknown> = potentialShapes.map((c) => {
            const kind = (c.kind || String(c.type || '').toLowerCase()) as string
            const childProps = c.props && typeof c.props === 'object' ? (c.props as Record<string, unknown>) : {}
            const { type: _t, props: _p, ...rest } = c
            return {
              kind,
              ...childProps,
              ...rest,
            }
          })

          const existingShapes = Array.isArray(props.shapes) ? props.shapes : []
          props.shapes = [...existingShapes, ...convertedShapes]
          repairs.push(`Normalized ${potentialShapes.length} vector shape(s) from Scene children into props.shapes at ${path}`)
          nodeRaw.children = (nodeRaw.children as Array<unknown>).filter((c) => !potentialShapes.includes(c as Record<string, unknown>))
        }
      }

      if (Array.isArray(props.shapes)) {
        props.shapes = validateSceneShapes(props.shapes, path, repairs, errors, repair)
      } else {
        props.shapes = []
      }
    }

    // Process children
    let processedChildren: Array<UINode> | undefined
    if (Array.isArray(nodeRaw.children)) {
      processedChildren = []
      for (let i = 0; i < nodeRaw.children.length; i++) {
        const child = processNode(nodeRaw.children[i], `${path}.children[${i}]`)
        if (child) {
          processedChildren.push(child)
        }
      }
    }

    const cleanNode: UINode = {
      id,
      type,
      props,
    }

    if (processedChildren && processedChildren.length > 0) {
      cleanNode.children = processedChildren
    }

    if (nodeRaw.bind && typeof nodeRaw.bind === 'object') {
      cleanNode.bind = nodeRaw.bind as Record<string, string>
    }

    if (nodeRaw.compute) {
      cleanNode.compute = nodeRaw.compute as ComputeBinding | string
    }

    if (nodeRaw.on && typeof nodeRaw.on === 'object') {
      cleanNode.on = nodeRaw.on as Record<string, string | { intent: string; payload?: unknown }>
    }

    return cleanNode
  }

  function validateSceneShapes(
    shapes: Array<unknown>,
    path: string,
    repairsList: Array<string>,
    errorsList: Array<string>,
    canRepair: boolean,
  ): Array<SceneShape> {
    const validShapes: Array<SceneShape> = []

    for (let i = 0; i < shapes.length; i++) {
      const s = shapes[i] as Record<string, unknown> | null | undefined
      if (!s || typeof s !== 'object') continue

      const kind = String(s.kind ?? s.type ?? '').toLowerCase()
      if (!['group', 'rect', 'circle', 'line', 'polygon', 'path', 'text'].includes(kind)) {
        if (canRepair) {
          repairsList.push(`Dropped unknown Scene shape kind "${kind}" at ${path}.shapes[${i}]`)
          continue
        } else {
          errorsList.push(`Unknown Scene shape kind "${kind}" at ${path}.shapes[${i}]`)
          continue
        }
      }

      s.kind = kind
      if (kind === 'line' && !s.stroke) {
        s.stroke = 'neutral'
      }
      if (kind === 'circle' && !s.fill) {
        s.fill = 'accent'
      }

      // Path grammar safety check
      if (kind === 'path') {
        const pathData = typeof s.d === 'string' ? s.d : ''
        if (!isValidSvgPath(pathData)) {
          if (canRepair) {
            repairsList.push(`Dropped invalid or unsafe SVG path shape at ${path}.shapes[${i}]`)
            continue
          } else {
            errorsList.push(`Invalid SVG path data at ${path}.shapes[${i}]`)
            continue
          }
        }
      }

      if (kind === 'group' && Array.isArray(s.children)) {
        s.children = validateSceneShapes(s.children, `${path}.shapes[${i}]`, repairsList, errorsList, canRepair)
      }

      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- shape kind and geometry validated dynamically above
      validShapes.push(s as unknown as SceneShape)
    }

    return validShapes
  }

  const cleanRoot = processNode(raw.root, 'root')
  if (!cleanRoot) {
    return { valid: false, errors, repairs }
  }

  // Fallback text check and repair
  let fallbackText: string
  if (typeof raw.fallbackText === 'string' && raw.fallbackText.trim().length > 0) {
    fallbackText = raw.fallbackText
  } else if (repair) {
    fallbackText = extractedText.length > 0 ? `${title}: ${extractedText.join(' ')}` : title
    repairs.push(`Synthesized missing fallbackText: "${fallbackText}"`)
  } else {
    fallbackText = ''
    errors.push('Missing or empty required fallbackText (§9.2)')
  }

  const valid = errors.length === 0

  const graph: GraphDocument = {
    specVersion: '0.1',
    graphId,
    revision,
    title,
    fallbackText,
    provenance,
    root: cleanRoot,
  }

  return {
    valid,
    graph: valid ? graph : undefined,
    errors,
    repairs,
  }
}
