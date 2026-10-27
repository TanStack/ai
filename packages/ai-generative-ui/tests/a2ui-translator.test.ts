import { describe, expect, it } from 'vitest'
import { A2uiSurfaceStore } from '../src/a2ui/index'
import { validateGraph } from '../src/validator'
import type { UINode } from '../src/types'

/** Depth-first search for a node by id. */
function find(node: UINode, id: string): UINode | undefined {
  if (node.id === id) return node
  for (const child of node.children ?? []) {
    const found = find(child, id)
    if (found) return found
  }
  return undefined
}

/** Assert no raw { path } binding objects leaked anywhere in the graph. */
function expectNoLeakedBindings(value: unknown, path = '$'): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => expectNoLeakedBindings(v, `${path}[${i}]`))
    return
  }
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value as object)
    expect(keys, `leaked binding object at ${path}`).not.toEqual(['path'])
    for (const [k, v] of Object.entries(value))
      expectNoLeakedBindings(v, `${path}.${k}`)
  }
}

const FLIGHT_COMPONENTS = [
  { id: 'card', component: 'Card', child: 'col' },
  {
    id: 'col',
    component: 'Column',
    children: ['title', 'route', 'meta', 'bookBtn'],
  },
  { id: 'title', component: 'Text', text: 'Flight Details', usageHint: 'h3' },
  { id: 'route', component: 'Row', children: ['from', 'to'] },
  { id: 'from', component: 'Text', text: { path: '/origin' } },
  { id: 'to', component: 'Text', text: { path: '/destination' } },
  {
    id: 'meta',
    component: 'Text',
    text: { path: '/airline' },
    usageHint: 'caption',
  },
  {
    id: 'bookBtn',
    component: 'Button',
    child: 'bookLabel',
    variant: 'primary',
    action: { event: { name: 'book_flight', context: { flightId: 'UA123' } } },
  },
  { id: 'bookLabel', component: 'Text', text: 'Book' },
]

describe('fixed-schema flight card (addendum §A5.1)', () => {
  it('translates createSurface + updateComponents + updateDataModel into a resolved graph', () => {
    const store = new A2uiSurfaceStore()
    const diagnostics = store.applyContainer({
      a2ui_operations: [
        {
          version: 'v0.9',
          createSurface: {
            surfaceId: 'flight-1',
            catalogId: 'copilotkit://app-dashboard-catalog',
          },
        },
        {
          version: 'v0.9',
          updateComponents: {
            surfaceId: 'flight-1',
            components: FLIGHT_COMPONENTS,
          },
        },
        {
          version: 'v0.9',
          updateDataModel: {
            surfaceId: 'flight-1',
            path: '/',
            value: { origin: 'PDX', destination: 'SFO', airline: 'United' },
          },
        },
      ],
    })
    expect(
      diagnostics.filter((d) => d.code === 'binding-unresolved'),
    ).toHaveLength(0)

    const graph = store.getGraph('flight-1')
    expect(graph).toBeDefined()
    expect(graph!.graphId).toBe('a2ui:flight-1')
    expect(graph!.provenance.driver).toBe('a2ui')
    expect(graph!.provenance.sourceId).toBe('flight-1')
    expect(graph!.provenance.context).toEqual({
      catalogId: 'copilotkit://app-dashboard-catalog',
    })
    expect(graph!.title).toBe('Flight Details')
    expect(graph!.root.type).toBe('Section') // Card -> Section

    expect(find(graph!.root, 'from')!.props!.content).toBe('PDX')
    expect(find(graph!.root, 'to')!.props!.content).toBe('SFO')
    expect(find(graph!.root, 'meta')!.props!.content).toBe('United')
    expect(find(graph!.root, 'route')!.type).toBe('Columns') // Row -> Columns

    const button = find(graph!.root, 'bookBtn')!
    expect(button.type).toBe('Button')
    expect(button.props!.label).toBe('Book') // label consumed from child Text
    expect(button.on).toEqual({
      click: { intent: 'book_flight', payload: { flightId: 'UA123' } },
    })

    expect(graph!.fallbackText).toContain('Flight Details')
    expect(graph!.fallbackText).toContain('PDX')
    expectNoLeakedBindings(graph)

    // The translated graph must satisfy the real validator with no repairs.
    const result = validateGraph(graph, { repair: false })
    expect(result.errors).toEqual([])
    expect(result.valid).toBe(true)
  })
})

describe('progressive dashboard (§A5.2)', () => {
  it('yields a new revision per data-model patch, resolving bindings as data arrives', () => {
    const store = new A2uiSurfaceStore()
    store.applyContainer([
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'dash', catalogId: 'basic' },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'dash',
          components: [
            { id: 'root', component: 'Column', children: ['h', 's'] },
            { id: 'h', component: 'Text', text: 'Spend', usageHint: 'h2' },
            { id: 's', component: 'Text', text: { path: '/summary' } },
          ],
        },
      },
    ])
    const early = store.getGraphWithDiagnostics('dash')
    expect(early.graph!.fallbackText).toContain('Spend')
    expect(early.diagnostics.some((d) => d.code === 'binding-unresolved')).toBe(
      true,
    )
    const earlyRevision = early.graph!.revision

    store.apply({
      version: 'v0.9',
      updateDataModel: {
        surfaceId: 'dash',
        path: '/summary',
        value: 'On track',
      },
    })
    const later = store.getGraph('dash')!
    expect(later.revision).toBeGreaterThan(earlyRevision)
    expect(find(later.root, 's')!.props!.content).toBe('On track')
    expectNoLeakedBindings(later)
  })
})

describe('shape discipline applied through the store (§A5.3)', () => {
  it('ignores flat legacy operations so no surface is created', () => {
    const store = new A2uiSurfaceStore()
    const diagnostics = store.applyContainer([
      { type: 'create_surface', surfaceId: 'x', catalogId: 'basic' },
    ])
    expect(diagnostics.some((d) => d.code === 'flat-op-ignored')).toBe(true)
    expect(store.listSurfaces()).toHaveLength(0)
  })
})

describe('degradation via the translator (§A5.4)', () => {
  it('degrades unknown containers to Stack and unknown leaves to Text', () => {
    const store = new A2uiSurfaceStore()
    store.applyContainer([
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'd', catalogId: 'basic' },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'd',
          components: [
            { id: 'root', component: 'MysteryBox', children: ['leaf'] },
            { id: 'leaf', component: 'Sparkle', caption: 'shiny' },
          ],
        },
      },
    ])
    const { graph, diagnostics } = store.getGraphWithDiagnostics('d')
    expect(graph!.root.type).toBe('Stack')
    expect(find(graph!.root, 'leaf')!.props!.content).toBe('shiny')
    expect(
      diagnostics.filter((d) => d.code === 'component-unmapped'),
    ).toHaveLength(2)
  })

  it('converts an input bound value into an OGUI bind, not a frozen literal', () => {
    const store = new A2uiSurfaceStore()
    store.applyContainer([
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'f', catalogId: 'basic' },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'f',
          components: [
            {
              id: 'name',
              component: 'TextField',
              label: 'Name',
              value: { path: '/passenger/name' },
            },
          ],
        },
      },
    ])
    const field = store.getGraph('f')!.root
    expect(field.type).toBe('TextInput')
    expect(field.bind).toEqual({ value: 'passenger.name' })
    expectNoLeakedBindings(store.getGraph('f'))
  })
})

describe('lifecycle (§A5.5)', () => {
  it('deleteSurface removes the surface; ops before creation are buffered and applied', () => {
    const store = new A2uiSurfaceStore()
    const buffered = store.apply({
      version: 'v0.9',
      updateComponents: {
        surfaceId: 'late',
        components: [{ id: 't', component: 'Text', text: 'buffered' }],
      },
    })
    expect(buffered.some((d) => d.code === 'op-buffered')).toBe(true)
    store.apply({
      version: 'v0.9',
      createSurface: { surfaceId: 'late', catalogId: 'basic' },
    })
    expect(store.getGraph('late')!.fallbackText).toContain('buffered')

    store.apply({ version: 'v0.9', deleteSurface: { surfaceId: 'late' } })
    expect(store.getGraph('late')).toBeUndefined()
    expect(store.listSurfaces()).toHaveLength(0)
  })
})
