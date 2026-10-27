/**
 * A2UI surface store + translator — addendum §A2.
 *
 * Consumes A2UI v0.9 operations, maintains one surface state per surfaceId,
 * and materialises each surface as an OGUI graph document (§5.1) that flows
 * through the normal validation / repair / renderer path. A translated graph
 * is indistinguishable downstream from a native one except by its provenance.
 */

import {
  getByPointer,
  isBinding,
  parseA2uiOperations,
  pointerToStatePath,
  setByPointer,
} from './a2ui'
import type { A2uiComponent, A2uiOperation, Diagnostic } from './a2ui'
import { BASIC_CATALOG_PROFILE } from './catalog-map'
import type { MappingFn } from './catalog-map'
import type { GraphDocument, UINode } from '../types'

export type { Diagnostic } from './a2ui'

export interface TranslatorOptions {
  /** Mapping overrides/additions, merged over the basic-catalog profile. */
  mappings?: Record<string, MappingFn>
  /**
   * If provided, a createSurface with an unlisted catalogId still uses the
   * basic profile but emits a diagnostic — never a silent fallback.
   */
  knownCatalogIds?: Array<string>
  /** Cap on buffered operations per not-yet-created surface (default 64). */
  maxBufferedOps?: number
}

interface SurfaceState {
  surfaceId: string
  catalogId: string
  rootId?: string
  components: Map<string, A2uiComponent>
  dataModel: unknown
  revision: number
}

const STRUCTURAL_KEYS = new Set([
  'id',
  'component',
  'child',
  'children',
  'tabItems',
  'action',
])

/** Components whose `value` prop is a two-way input binding (§A2.4). */
const INPUT_COMPONENTS = new Set([
  'TextField',
  'CheckBox',
  'ChoicePicker',
  'Slider',
  'DateTimeInput',
])

const OP_KINDS = [
  'createSurface',
  'updateComponents',
  'updateDataModel',
  'deleteSurface',
] as const

export class A2uiSurfaceStore {
  private readonly surfaces = new Map<string, SurfaceState>()
  private readonly buffers = new Map<string, Array<A2uiOperation>>()
  private readonly profile: Record<string, MappingFn>
  private readonly lastBuildDiagnostics = new Map<string, Array<Diagnostic>>()

  constructor(private readonly options: TranslatorOptions = {}) {
    this.profile = { ...BASIC_CATALOG_PROFILE, ...options.mappings }
  }

  /** Parse a tool-result container / array / JSON string and apply every operation in it. */
  applyContainer(input: unknown): Array<Diagnostic> {
    const { operations, diagnostics } = parseA2uiOperations(input)
    const all = [...diagnostics]
    for (const op of operations) all.push(...this.apply(op))
    return all
  }

  apply(op: A2uiOperation): Array<Diagnostic> {
    const diagnostics: Array<Diagnostic> = []
    // oxlint-disable-next-line eslint-js/no-restricted-syntax -- operations are a tagged union keyed by op name; index them structurally to read the common surfaceId
    const record = op as unknown as Record<string, { surfaceId: string }>
    const kind = OP_KINDS.find((k) => k in record)
    const entry = kind ? record[kind] : undefined
    if (!kind || !entry) return diagnostics
    const surfaceId = entry.surfaceId

    if (kind === 'createSurface') {
      const { catalogId, root } = (
        op as Extract<A2uiOperation, { createSurface: unknown }>
      ).createSurface
      if (
        this.options.knownCatalogIds &&
        !this.options.knownCatalogIds.includes(catalogId)
      ) {
        diagnostics.push({
          code: 'catalog-unknown',
          message: `Surface "${surfaceId}" pins unknown catalogId "${catalogId}"; using the basic-catalog profile.`,
          surfaceId,
        })
      }
      if (this.surfaces.has(surfaceId)) {
        diagnostics.push({
          code: 'surface-recreated',
          message: `Surface "${surfaceId}" re-created; previous state discarded.`,
          surfaceId,
        })
      }
      this.surfaces.set(surfaceId, {
        surfaceId,
        catalogId,
        ...(root ? { rootId: root } : {}),
        components: new Map(),
        dataModel: undefined,
        revision: 1,
      })
      // Flush anything that raced ahead of creation, in arrival order.
      const buffered = this.buffers.get(surfaceId) ?? []
      this.buffers.delete(surfaceId)
      for (const pending of buffered) diagnostics.push(...this.apply(pending))
      return diagnostics
    }

    const state = this.surfaces.get(surfaceId)
    if (!state) {
      if (kind === 'deleteSurface') return diagnostics // deleting a ghost is a no-op
      const buffer = this.buffers.get(surfaceId) ?? []
      if (buffer.length < (this.options.maxBufferedOps ?? 64)) {
        buffer.push(op)
        this.buffers.set(surfaceId, buffer)
        diagnostics.push({
          code: 'op-buffered',
          message: `Operation ${kind} for unknown surface "${surfaceId}" buffered until createSurface arrives.`,
          surfaceId,
        })
      } else {
        diagnostics.push({
          code: 'op-buffer-overflow',
          message: `Buffer full for unknown surface "${surfaceId}"; operation dropped.`,
          surfaceId,
        })
      }
      return diagnostics
    }

    switch (kind) {
      case 'updateComponents': {
        const { components } = (
          op as Extract<A2uiOperation, { updateComponents: unknown }>
        ).updateComponents
        for (const component of components)
          state.components.set(component.id, component)
        state.revision++
        break
      }
      case 'updateDataModel': {
        const { path, value } = (
          op as Extract<A2uiOperation, { updateDataModel: unknown }>
        ).updateDataModel
        state.dataModel = setByPointer(state.dataModel, path, value)
        state.revision++
        break
      }
      case 'deleteSurface': {
        this.surfaces.delete(surfaceId)
        this.lastBuildDiagnostics.delete(surfaceId)
        break
      }
    }
    return diagnostics
  }

  listSurfaces(): Array<string> {
    return [...this.surfaces.keys()]
  }

  /** Materialise a surface as a graph document. Undefined if the surface does not exist or has no components yet. */
  getGraph(surfaceId: string): GraphDocument | undefined {
    return this.getGraphWithDiagnostics(surfaceId).graph
  }

  getGraphWithDiagnostics(surfaceId: string): {
    graph?: GraphDocument
    diagnostics: Array<Diagnostic>
  } {
    const state = this.surfaces.get(surfaceId)
    if (!state || state.components.size === 0) return { diagnostics: [] }
    const diagnostics: Array<Diagnostic> = []
    const push = (code: string, message: string, componentId?: string) =>
      diagnostics.push({
        code,
        message,
        surfaceId,
        ...(componentId ? { componentId } : {}),
      })

    const referenced = new Set<string>()
    for (const comp of state.components.values()) {
      for (const childId of childIdsOf(comp)) referenced.add(childId)
    }
    const orphans = [...state.components.keys()].filter(
      (id) => !referenced.has(id),
    )

    const buildNode = (id: string, seen: Set<string>): UINode | null => {
      const comp = state.components.get(id)
      if (!comp) {
        push(
          'component-missing',
          `Component "${id}" is referenced but not defined on this surface.`,
          id,
        )
        return null
      }
      if (seen.has(id)) {
        push(
          'component-cycle',
          `Component "${id}" participates in a reference cycle; degraded to a Text placeholder.`,
          id,
        )
        return { id, type: 'Text', props: { content: '', variant: 'body' } }
      }
      const nextSeen = new Set(seen).add(id)
      const childNodes = childIdsOf(comp)
        .map((childId) => buildNode(childId, nextSeen))
        .filter((n): n is UINode => n !== null)

      // Resolve props: bindings -> data model values; input values -> OGUI binds.
      const props: Record<string, unknown> = {}
      const bind: Record<string, string> = {}
      for (const [key, value] of Object.entries(comp)) {
        if (STRUCTURAL_KEYS.has(key)) continue
        if (
          (key === 'value' || key === 'selectedValues') &&
          INPUT_COMPONENTS.has(comp.component) &&
          isBinding(value)
        ) {
          bind.value = pointerToStatePath(value.path)
          continue
        }
        props[key] = this.resolveValue(value, state.dataModel, id, push)
      }

      const labels = comp.tabItems?.map((t) => t.title ?? '')
      const childText = childNodes.find((n) => n.type === 'Text')?.props
        ?.content
      const mapping = this.profile[comp.component]
      let result: UINode | null
      if (mapping) {
        result = mapping({
          id,
          props,
          children: childNodes,
          ...(labels && labels.length ? { labels } : {}),
          ...(typeof childText === 'string' ? { childText } : {}),
          addDiagnostic: (code, message) => push(code, message, id),
        })
      } else {
        push(
          'component-unmapped',
          `A2UI component "${comp.component}" ("${id}") has no catalog mapping; degraded per §9.3.`,
          id,
        )
        if (childNodes.length > 0) {
          result = { id, type: 'Stack', props: {}, children: childNodes }
        } else {
          const firstString = Object.values(props).find(
            (v) => typeof v === 'string',
          )
          result = {
            id,
            type: 'Text',
            props: {
              content: typeof firstString === 'string' ? firstString : '',
              variant: 'body',
            },
          }
        }
      }
      if (result) {
        if (Object.keys(bind).length > 0) result.bind = bind
        if (comp.action) {
          const { name, context } = comp.action.event
          result.on = {
            click: context ? { intent: name, payload: context } : name,
          }
        }
      }
      return result
    }

    let root: UINode | null = null
    const rootId =
      state.rootId ?? (orphans.length === 1 ? orphans[0] : undefined)
    if (rootId) {
      root = buildNode(rootId, new Set())
    } else if (orphans.length > 1) {
      push(
        'root-synthesised',
        `Surface "${surfaceId}" has ${orphans.length} unreferenced components and no declared root; wrapped in a synthetic Stack.`,
      )
      const children = orphans
        .map((id) => buildNode(id, new Set()))
        .filter((n): n is UINode => n !== null)
      root = { id: `${surfaceId}__root`, type: 'Stack', props: {}, children }
    }
    if (!root) return { diagnostics }

    // Synthesised fallbackText (§A2.5): resolved Text content, tree order.
    const texts: Array<string> = []
    const walk = (n: UINode) => {
      if (
        n.type === 'Text' &&
        typeof n.props?.content === 'string' &&
        n.props.content !== ''
      ) {
        texts.push(n.props.content)
      }
      if (
        n.type === 'Button' &&
        typeof n.props?.label === 'string' &&
        n.props.label !== ''
      ) {
        texts.push(n.props.label)
      }
      for (const child of n.children ?? []) walk(child)
    }
    walk(root)
    const heading = findFirstHeading(root)
    // §5.1 requires a title; A2UI has none, so synthesise one deterministically.
    const title = heading ?? texts[0] ?? `A2UI surface ${surfaceId}`

    const graph: GraphDocument = {
      specVersion: '0.1',
      graphId: `a2ui:${surfaceId}`,
      revision: state.revision,
      title,
      fallbackText:
        texts.length > 0 ? texts.join('\n') : `A2UI surface ${surfaceId}`,
      provenance: {
        driver: 'a2ui',
        sourceId: surfaceId,
        context: { catalogId: state.catalogId },
      },
      root,
    }
    this.lastBuildDiagnostics.set(surfaceId, diagnostics)
    return { graph, diagnostics }
  }

  /** Diagnostics from the most recent graph build for a surface. */
  buildDiagnostics(surfaceId: string): Array<Diagnostic> {
    return this.lastBuildDiagnostics.get(surfaceId) ?? []
  }

  private resolveValue(
    value: unknown,
    dataModel: unknown,
    componentId: string,
    push: (code: string, message: string, componentId?: string) => void,
  ): unknown {
    if (isBinding(value)) {
      const resolved = getByPointer(dataModel, value.path)
      if (resolved === undefined) {
        push(
          'binding-unresolved',
          `Binding "${value.path}" on "${componentId}" does not resolve against the current data model.`,
          componentId,
        )
      }
      return resolved
    }
    if (Array.isArray(value)) {
      return value.map((v) =>
        this.resolveValue(v, dataModel, componentId, push),
      )
    }
    if (typeof value === 'object' && value !== null) {
      const out: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(value)) {
        out[k] = this.resolveValue(v, dataModel, componentId, push)
      }
      return out
    }
    return value
  }
}

function childIdsOf(comp: A2uiComponent): Array<string> {
  const ids: Array<string> = []
  if (typeof comp.child === 'string') ids.push(comp.child)
  if (Array.isArray(comp.children)) ids.push(...comp.children)
  if (Array.isArray(comp.tabItems))
    for (const tab of comp.tabItems) ids.push(tab.child)
  // Modal references its parts from props rather than child/children.
  for (const key of ['entryPointChildId', 'contentChildId']) {
    if (typeof comp[key] === 'string') ids.push(comp[key] as string)
  }
  return ids
}

function findFirstHeading(node: UINode): string | undefined {
  if (
    node.type === 'Text' &&
    node.props?.variant === 'heading' &&
    typeof node.props.content === 'string'
  ) {
    return node.props.content
  }
  for (const child of node.children ?? []) {
    const found = findFirstHeading(child)
    if (found) return found
  }
  return undefined
}
