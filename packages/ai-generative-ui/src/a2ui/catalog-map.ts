/**
 * Catalog mapping — A2UI basic-catalog profile -> OGUI catalog (§6).
 *
 * The mapping table from addendum §A3 as data. Hosts extend or override it
 * per catalogId (their A2UI BYOC components map through the same table);
 * unmapped components degrade in the translator per §9.3.
 *
 * Prop names target the host renderer's real contract, not the spec sketch:
 * Text carries `content`, Image `src`, List `items` (A2UI's child refs are
 * flattened to item strings), Tabs `tabs: [{ id, label }]` with each panel
 * child tagged `props.tabId`, Chart flat `data: [{ label, value }]`.
 */

import type { UINode } from '../types'

export interface MappingContext {
  /** OGUI node id (the A2UI component id, preserved). */
  id: string
  /** Props with { path } bindings already resolved against the data model. */
  props: Record<string, unknown>
  /** Already-translated child nodes, in reference order. */
  children: Array<UINode>
  /** Panel labels for Tabs (from tabItems[].title). */
  labels?: Array<string>
  /** The Button's label, recovered from its child Text node. */
  childText?: string
  addDiagnostic: (code: string, message: string) => void
}

export type MappingFn = (ctx: MappingContext) => UINode | null

function node(
  ctx: MappingContext,
  type: string,
  props: Record<string, unknown>,
  extra?: Partial<UINode>,
): UINode {
  return { id: ctx.id, type, props, ...extra }
}

const str = (v: unknown): string =>
  typeof v === 'string' ? v : v == null ? '' : String(v)

/** The text a List item or fallback shows for a translated child node. */
function textOfNode(n: UINode): string | undefined {
  const p = n.props ?? {}
  if (typeof p.content === 'string') return p.content
  if (typeof p.text === 'string') return p.text
  if (typeof p.label === 'string') return p.label
  return undefined
}

export const BASIC_CATALOG_PROFILE: Record<string, MappingFn> = {
  Column: (ctx) => node(ctx, 'Stack', {}, { children: ctx.children }),

  Row: (ctx) => {
    if (ctx.children.length <= 4) {
      return node(
        ctx,
        'Columns',
        { count: Math.min(Math.max(ctx.children.length, 2), 4) },
        { children: ctx.children },
      )
    }
    // §6 Columns is 2-4 wide; wider Rows chunk into a Stack of Columns.
    const chunks: Array<UINode> = []
    for (let i = 0; i < ctx.children.length; i += 4) {
      chunks.push({
        id: `${ctx.id}__cols${i / 4}`,
        type: 'Columns',
        props: { count: 4 },
        children: ctx.children.slice(i, i + 4),
      })
    }
    ctx.addDiagnostic(
      'row-chunked',
      `Row "${ctx.id}" has ${ctx.children.length} children (>4); chunked into multiple Columns.`,
    )
    return node(ctx, 'Stack', {}, { children: chunks })
  },

  Card: (ctx) => node(ctx, 'Section', {}, { children: ctx.children }),

  List: (ctx) => {
    // The host List is a leaf keyed on `items`, not a container of nodes.
    // Flatten child Text refs to item strings; if a child is richer than
    // text, keep structure by degrading the whole List to a Stack.
    const items = ctx.children.map(textOfNode)
    if (items.every((t) => typeof t === 'string')) {
      return node(ctx, 'List', { items })
    }
    ctx.addDiagnostic(
      'list-degraded-to-stack',
      `List "${ctx.id}" has non-text children; rendered as a Stack to preserve them.`,
    )
    return node(ctx, 'Stack', {}, { children: ctx.children })
  },

  Tabs: (ctx) => {
    // Pair each panel child with its label and tag it so the host Tabs
    // renderer (which filters children by props.tabId) shows one at a time.
    const labels = ctx.labels ?? []
    const tabs = ctx.children.map((child, i) => ({
      id: child.id,
      label: labels[i] ?? child.id,
    }))
    const children = ctx.children.map((child) => ({
      ...child,
      props: { ...(child.props ?? {}), tabId: child.id },
    }))
    return node(ctx, 'Tabs', { tabs }, { children })
  },

  Text: (ctx) => {
    const hint = str(ctx.props.usageHint)
    const variant = /^h[1-5]$/.test(hint)
      ? 'heading'
      : hint === 'caption'
        ? 'caption'
        : 'body'
    return node(ctx, 'Text', { content: str(ctx.props.text), variant })
  },

  Image: (ctx) => {
    const alt = ctx.props.alt
    if (typeof alt !== 'string' || alt === '') {
      ctx.addDiagnostic(
        'image-alt-synthesised',
        `Image "${ctx.id}" has no alt text in A2UI; synthesised empty alt. Host must close this for §9.4 conformance.`,
      )
    }
    return node(ctx, 'Image', {
      src: str(ctx.props.url ?? ctx.props.source),
      alt: typeof alt === 'string' ? alt : '',
    })
  },

  Button: (ctx) =>
    // Label comes from the child Text node (consumed, not kept as a child).
    node(ctx, 'Button', {
      label: ctx.childText ?? '',
      tone: buttonTone(str(ctx.props.variant)),
    }),

  TextField: (ctx) => {
    const kind = str(ctx.props.textFieldType)
    const props: Record<string, unknown> = { label: str(ctx.props.label) }
    if (typeof ctx.props.validationRegexp === 'string') {
      props.validation = { pattern: ctx.props.validationRegexp }
    }
    return node(ctx, kind === 'number' ? 'NumberInput' : 'TextInput', props)
  },

  CheckBox: (ctx) => node(ctx, 'Checkbox', { label: str(ctx.props.label) }),

  ChoicePicker: (ctx) => {
    if (ctx.props.variant === 'multipleSelection') {
      ctx.addDiagnostic(
        'select-single-only',
        `ChoicePicker "${ctx.id}" requests multiple selection; the host Select is single-select, so only one value is kept.`,
      )
    }
    return node(ctx, 'Select', {
      label: str(ctx.props.label),
      options: Array.isArray(ctx.props.options) ? ctx.props.options : [],
    })
  },

  Slider: (ctx) =>
    node(ctx, 'Slider', {
      label: str(ctx.props.label),
      min: typeof ctx.props.minValue === 'number' ? ctx.props.minValue : 0,
      max: typeof ctx.props.maxValue === 'number' ? ctx.props.maxValue : 100,
    }),

  DateTimeInput: (ctx) => {
    ctx.addDiagnostic(
      'datetime-degraded',
      `DateTimeInput "${ctx.id}" degraded to TextInput with a format hint (§6 defers date/time pickers in v0).`,
    )
    return node(ctx, 'TextInput', {
      label: str(ctx.props.label),
      placeholder: 'YYYY-MM-DD HH:mm',
    })
  },

  Divider: (ctx) => {
    ctx.addDiagnostic(
      'divider-dropped',
      `Divider "${ctx.id}" has no OGUI catalog equivalent; dropped.`,
    )
    return null
  },

  Icon: (ctx) => {
    ctx.addDiagnostic(
      'icon-dropped',
      `Icon "${ctx.id}" has no OGUI catalog equivalent; dropped.`,
    )
    return null
  },

  Modal: (ctx) => {
    ctx.addDiagnostic(
      'modal-flattened',
      `Modal "${ctx.id}" flattened to a Section; a real modal presentation is a host decision, not a translation.`,
    )
    return node(ctx, 'Section', {}, { children: ctx.children })
  },

  // ---- Custom-catalog components seen in CopilotKit BYOC examples --------
  // A host registers its own A2UI catalog components through the same
  // override hook (`TranslatorOptions.mappings`); these are included to
  // demonstrate the extension point and to cover the common data widgets.
  // Prop names target the host renderer: Chart reads flat `data`, Metric
  // reads `delta`/`tone`, Table reads `columns`/`rows`.

  DataTable: (ctx) =>
    node(ctx, 'Table', {
      columns: Array.isArray(ctx.props.columns) ? ctx.props.columns : [],
      rows: Array.isArray(ctx.props.rows) ? ctx.props.rows : [],
    }),

  Metric: (ctx) => {
    const props: Record<string, unknown> = {
      label: str(ctx.props.label),
      value: ctx.props.value ?? '',
    }
    // A2UI's `trend` maps to the host's signed `delta`.
    const delta = ctx.props.delta ?? ctx.props.trend
    if (delta != null) props.delta = delta
    if (typeof ctx.props.unit === 'string') props.unit = ctx.props.unit
    if (
      ctx.props.tone === 'positive' ||
      ctx.props.tone === 'negative' ||
      ctx.props.tone === 'neutral'
    ) {
      props.tone = ctx.props.tone
    }
    return node(ctx, 'Metric', props)
  },

  PieChart: (ctx) => chart(ctx, 'pie'),
  BarChart: (ctx) => chart(ctx, 'bar'),

  StatusBadge: (ctx) =>
    node(ctx, 'Text', {
      content: str(ctx.props.text ?? ctx.props.label),
      variant: 'caption',
    }),

  InfoRow: (ctx) =>
    node(ctx, 'Text', {
      content: `${str(ctx.props.label)}: ${str(ctx.props.value)}`,
      variant: 'body',
    }),
}

/**
 * A2UI chart data is `[{ label, value }]`, which is exactly the host Chart's
 * flat `data` shape — no series transform needed.
 */
function chart(ctx: MappingContext, kind: 'pie' | 'bar'): UINode {
  const raw = Array.isArray(ctx.props.data)
    ? (ctx.props.data as Array<{ label?: unknown; value?: unknown }>)
    : []
  return node(ctx, 'Chart', {
    kind,
    title: str(ctx.props.title),
    data: raw.map((d) => ({
      label: str(d.label),
      value: Number(d.value) || 0,
    })),
  })
}

/** A2UI Button variants -> host Button tone enum. */
function buttonTone(
  variant: string,
): 'primary' | 'secondary' | 'danger' | 'accent' {
  if (variant === 'secondary' || variant === 'danger' || variant === 'accent') {
    return variant
  }
  return 'primary'
}
