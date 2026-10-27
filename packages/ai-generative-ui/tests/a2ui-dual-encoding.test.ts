import { describe, expect, it } from 'vitest'
import { A2uiSurfaceStore } from '../src/a2ui/index'
import { validateGraph } from '../src/validator'
import type { GraphDocument, UINode } from '../src/types'

/**
 * Addendum §A5.7 — the portability proof.
 *
 * The same monthly-spend dashboard, authored two ways: natively as an OGUI
 * graph, and as A2UI v0.9 operations. Both must produce the SAME renderable
 * tree (node types, props, children, binds) modulo the fields A2UI has no
 * equivalent for and the adapter synthesises — graphId, title, fallbackText,
 * provenance. This is the test that makes "parallel mechanism" a claim
 * instead of a slogan: one renderer, one catalog, two ingresses.
 */

// ---- (1) Native authoring: an OGUI graph a programmatic driver would emit ---
const NATIVE: GraphDocument = {
  specVersion: '0.1',
  graphId: 'dash-native',
  revision: 1,
  title: 'Monthly Spend',
  fallbackText: 'Monthly Spend',
  provenance: { driver: 'programmatic' },
  root: {
    id: 'root',
    type: 'Stack',
    props: {},
    children: [
      {
        id: 'h',
        type: 'Text',
        props: { content: 'Monthly Spend', variant: 'heading' },
      },
      {
        id: 'row',
        type: 'Columns',
        props: { count: 2 },
        children: [
          {
            id: 'm1',
            type: 'Metric',
            props: { label: 'Total', value: '$4,200', delta: '+8%' },
          },
          {
            id: 'm2',
            type: 'Metric',
            props: { label: 'Budget', value: '$5,000' },
          },
        ],
      },
      {
        id: 'chart',
        type: 'Chart',
        props: {
          kind: 'bar',
          title: 'By week',
          data: [
            { label: 'Wk1', value: 10 },
            { label: 'Wk2', value: 14 },
            { label: 'Wk3', value: 9 },
            { label: 'Wk4', value: 18 },
          ],
        },
      },
    ],
  },
}

// ---- (2) The same dashboard as A2UI v0.9 operations -------------------------
function translateA2ui(): GraphDocument {
  const store = new A2uiSurfaceStore()
  store.applyContainer({
    a2ui_operations: [
      {
        version: 'v0.9',
        createSurface: { surfaceId: 'dash', catalogId: 'basic', root: 'root' },
      },
      {
        version: 'v0.9',
        updateComponents: {
          surfaceId: 'dash',
          components: [
            {
              id: 'root',
              component: 'Column',
              children: ['h', 'row', 'chart'],
            },
            {
              id: 'h',
              component: 'Text',
              text: 'Monthly Spend',
              usageHint: 'h2',
            },
            { id: 'row', component: 'Row', children: ['m1', 'm2'] },
            {
              id: 'm1',
              component: 'Metric',
              label: 'Total',
              value: '$4,200',
              trend: '+8%',
            },
            { id: 'm2', component: 'Metric', label: 'Budget', value: '$5,000' },
            {
              id: 'chart',
              component: 'BarChart',
              title: 'By week',
              data: [
                { label: 'Wk1', value: 10 },
                { label: 'Wk2', value: 14 },
                { label: 'Wk3', value: 9 },
                { label: 'Wk4', value: 18 },
              ],
            },
          ],
        },
      },
    ],
  })
  const graph = store.getGraph('dash')
  if (!graph) throw new Error('translation produced no graph')
  return graph
}

describe('dual-encoded dashboard (addendum §A5.7)', () => {
  it('the A2UI translation and the native graph render as structurally equal trees', () => {
    const translated = translateA2ui()

    // Both are valid graphs the renderer can consume, with no repair needed.
    expect(validateGraph(NATIVE, { repair: false }).valid).toBe(true)
    expect(validateGraph(translated, { repair: false }).valid).toBe(true)

    // The renderable tree is identical — same catalog types, props, children.
    expect(translated.root).toEqual(NATIVE.root)
  })

  it('provenance is the only thing that tells the two apart', () => {
    const translated = translateA2ui()
    expect(translated.provenance.driver).toBe('a2ui')
    expect(translated.provenance.context).toEqual({ catalogId: 'basic' })
    // A native graph carries no a2ui provenance.
    expect(NATIVE.provenance.driver).not.toBe('a2ui')
  })
})

/** Guard: trees compared above actually contain the catalog nodes we claim. */
function typesOf(node: UINode, acc: Array<string> = []): Array<string> {
  acc.push(node.type)
  for (const c of node.children ?? []) typesOf(c, acc)
  return acc
}

describe('dual-encoding coverage', () => {
  it('exercises layout, content, metric, and chart catalog nodes', () => {
    const types = new Set(typesOf(translateA2ui().root))
    expect(types).toEqual(
      new Set(['Stack', 'Text', 'Columns', 'Metric', 'Chart']),
    )
  })
})
