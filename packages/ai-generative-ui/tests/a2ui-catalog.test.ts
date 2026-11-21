import { describe, expect, it } from 'vitest'
import { A2uiSurfaceStore } from '../src/a2ui/index'
import type { MappingFn } from '../src/a2ui/index'
import type { UINode } from '../src/types'

/** Build a one-batch surface and return its graph root + diagnostics. */
function build(
  components: Array<Record<string, unknown>>,
  opts?: ConstructorParameters<typeof A2uiSurfaceStore>[0],
  dataModel?: unknown,
) {
  const store = new A2uiSurfaceStore(opts)
  store.applyContainer([
    { version: 'v0.9', createSurface: { surfaceId: 's', catalogId: 'basic' } },
    { version: 'v0.9', updateComponents: { surfaceId: 's', components } },
    ...(dataModel !== undefined
      ? [
          {
            version: 'v0.9',
            updateDataModel: { surfaceId: 's', path: '/', value: dataModel },
          },
        ]
      : []),
  ])
  return store.getGraphWithDiagnostics('s')
}

function find(node: UINode, id: string): UINode | undefined {
  if (node.id === id) return node
  for (const child of node.children ?? []) {
    const found = find(child, id)
    if (found) return found
  }
  return undefined
}

describe('catalog mapping — content prop names (addendum §A3)', () => {
  it('Text -> content, with usageHint driving variant', () => {
    const { graph } = build([
      { id: 'root', component: 'Column', children: ['a', 'b', 'c'] },
      { id: 'a', component: 'Text', text: 'Title', usageHint: 'h1' },
      { id: 'b', component: 'Text', text: 'body copy' },
      { id: 'c', component: 'Text', text: 'small', usageHint: 'caption' },
    ])
    expect(find(graph!.root, 'a')!.props).toEqual({
      content: 'Title',
      variant: 'heading',
    })
    expect(find(graph!.root, 'b')!.props!.variant).toBe('body')
    expect(find(graph!.root, 'c')!.props!.variant).toBe('caption')
  })

  it('Image -> src/alt, synthesising empty alt with a diagnostic', () => {
    const { graph, diagnostics } = build([
      { id: 'img', component: 'Image', url: 'https://x/y.png' },
    ])
    expect(graph!.root.type).toBe('Image')
    expect(graph!.root.props).toEqual({ src: 'https://x/y.png', alt: '' })
    expect(diagnostics.some((d) => d.code === 'image-alt-synthesised')).toBe(
      true,
    )
  })
})

describe('catalog mapping — structural drift (§A3)', () => {
  it('List -> leaf with items[] built from text children', () => {
    const { graph } = build([
      { id: 'list', component: 'List', children: ['x', 'y'] },
      { id: 'x', component: 'Text', text: 'first' },
      { id: 'y', component: 'Text', text: 'second' },
    ])
    expect(graph!.root.type).toBe('List')
    expect(graph!.root.props!.items).toEqual(['first', 'second'])
    expect(graph!.root.children).toBeUndefined()
  })

  it('List with non-text children degrades to a Stack, with a diagnostic', () => {
    const { graph, diagnostics } = build([
      { id: 'list', component: 'List', children: ['img'] },
      { id: 'img', component: 'Image', url: 'u', alt: 'a' },
    ])
    expect(graph!.root.type).toBe('Stack')
    expect(diagnostics.some((d) => d.code === 'list-degraded-to-stack')).toBe(
      true,
    )
  })

  it('Tabs -> tabs[{id,label}] with each panel child tagged props.tabId', () => {
    const { graph } = build([
      {
        id: 'tabs',
        component: 'Tabs',
        tabItems: [
          { title: 'One', child: 'p1' },
          { title: 'Two', child: 'p2' },
        ],
      },
      { id: 'p1', component: 'Text', text: 'panel one' },
      { id: 'p2', component: 'Text', text: 'panel two' },
    ])
    expect(graph!.root.type).toBe('Tabs')
    expect(graph!.root.props!.tabs).toEqual([
      { id: 'p1', label: 'One' },
      { id: 'p2', label: 'Two' },
    ])
    expect(find(graph!.root, 'p1')!.props!.tabId).toBe('p1')
    expect(find(graph!.root, 'p2')!.props!.tabId).toBe('p2')
  })

  it('Row -> Columns, chunking more than four children', () => {
    const kids = Array.from({ length: 5 }, (_, i) => `k${i}`)
    const { graph, diagnostics } = build([
      { id: 'row', component: 'Row', children: kids },
      ...kids.map((id) => ({ id, component: 'Text', text: id })),
    ])
    expect(graph!.root.type).toBe('Stack') // chunked
    expect(graph!.root.children!.every((c) => c.type === 'Columns')).toBe(true)
    expect(diagnostics.some((d) => d.code === 'row-chunked')).toBe(true)
  })
})

describe('catalog mapping — degradations (§A5.4)', () => {
  it('DateTimeInput -> TextInput with a diagnostic', () => {
    const { graph, diagnostics } = build([
      { id: 'dt', component: 'DateTimeInput', label: 'When?' },
    ])
    expect(graph!.root.type).toBe('TextInput')
    expect(diagnostics.some((d) => d.code === 'datetime-degraded')).toBe(true)
  })

  it('Divider and Icon are dropped with diagnostics', () => {
    const { graph, diagnostics } = build([
      { id: 'root', component: 'Column', children: ['d', 'i', 't'] },
      { id: 'd', component: 'Divider' },
      { id: 'i', component: 'Icon', name: 'star' },
      { id: 't', component: 'Text', text: 'kept' },
    ])
    // Only the Text child survives.
    expect(graph!.root.children).toHaveLength(1)
    expect(graph!.root.children![0]!.id).toBe('t')
    expect(diagnostics.some((d) => d.code === 'divider-dropped')).toBe(true)
    expect(diagnostics.some((d) => d.code === 'icon-dropped')).toBe(true)
  })

  it('Modal flattens to a Section with a diagnostic', () => {
    const { graph, diagnostics } = build([
      { id: 'm', component: 'Modal', child: 'body' },
      { id: 'body', component: 'Text', text: 'hi' },
    ])
    expect(graph!.root.type).toBe('Section')
    expect(diagnostics.some((d) => d.code === 'modal-flattened')).toBe(true)
  })

  it('ChoicePicker multiple-selection emits a single-select diagnostic', () => {
    const { diagnostics } = build([
      {
        id: 'c',
        component: 'ChoicePicker',
        label: 'Pick',
        variant: 'multipleSelection',
        options: [],
      },
    ])
    expect(diagnostics.some((d) => d.code === 'select-single-only')).toBe(true)
  })
})

describe('catalog mapping — custom-catalog BYOC (§A3)', () => {
  it('maps DataTable/Metric/charts/StatusBadge/InfoRow to host widgets', () => {
    const { graph } = build([
      {
        id: 'root',
        component: 'Column',
        children: ['dt', 'm', 'c', 'sb', 'ir'],
      },
      {
        id: 'dt',
        component: 'DataTable',
        columns: [{ key: 'a', label: 'A' }],
        rows: [{ a: 1 }],
      },
      {
        id: 'm',
        component: 'Metric',
        label: 'Revenue',
        value: '$1,200',
        trend: '+5%',
      },
      {
        id: 'c',
        component: 'BarChart',
        title: 'By month',
        data: [
          { label: 'Jan', value: 10 },
          { label: 'Feb', value: 20 },
        ],
      },
      { id: 'sb', component: 'StatusBadge', text: 'Active' },
      { id: 'ir', component: 'InfoRow', label: 'Owner', value: 'Ada' },
    ])
    expect(find(graph!.root, 'dt')!.type).toBe('Table')
    const metric = find(graph!.root, 'm')!
    expect(metric.type).toBe('Metric')
    expect(metric.props!.delta).toBe('+5%') // trend -> delta
    const chartNode = find(graph!.root, 'c')!
    expect(chartNode.type).toBe('Chart')
    expect(chartNode.props!.kind).toBe('bar')
    expect(chartNode.props!.data).toEqual([
      { label: 'Jan', value: 10 },
      { label: 'Feb', value: 20 },
    ])
    expect(find(graph!.root, 'sb')!.props!.content).toBe('Active')
    expect(find(graph!.root, 'ir')!.props!.content).toBe('Owner: Ada')
  })
})

describe('catalog mapping — host override hook', () => {
  it('a registered mapping wins over the basic profile', () => {
    const gauge: MappingFn = (ctx) => ({
      id: ctx.id,
      type: 'Metric',
      props: { label: 'gauge', value: ctx.props.reading ?? 0 },
    })
    const { graph } = build([{ id: 'g', component: 'Gauge', reading: 42 }], {
      mappings: { Gauge: gauge },
    })
    expect(graph!.root.type).toBe('Metric')
    expect(graph!.root.props!.value).toBe(42)
  })

  it('an unlisted catalogId is reported, never silently accepted', () => {
    const store = new A2uiSurfaceStore({ knownCatalogIds: ['approved'] })
    const diags = store.applyContainer([
      {
        version: 'v0.9',
        createSurface: { surfaceId: 's', catalogId: 'mystery' },
      },
    ])
    expect(diags.some((d) => d.code === 'catalog-unknown')).toBe(true)
  })
})
