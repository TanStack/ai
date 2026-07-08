import { z } from 'zod'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import {
  generateTypeStubs,
  type ToolBinding,
  type ToolExecutionContext,
} from '@tanstack/ai-code-mode'
import type { UIEvent, ComponentType, WatcherSubscription } from './types'
import {
  applyReportUIEvent,
  getSignalRegistry,
  addWatcher,
  removeWatcher,
  getAllWatchers,
} from './report-storage'
import { createHandlerBindings } from './create-handler-bindings'

// Common schemas for subscription support
const subscriptionsSchema = z
  .array(z.string())
  .optional()
  .describe(
    'Signal names this component subscribes to (e.g., ["balances", "transactions"])',
  )
const dataSourceSchema = z
  .string()
  .optional()
  .describe(
    'TypeScript code that fetches data and returns props to merge (e.g., "const b = await external_get_balances(); return { value: b.checking }")',
  )

/**
 * Helper to create a ToolBinding that emits a report:ui event
 */
function createReportBinding<T extends z.ZodType>(
  name: string,
  description: string,
  inputSchema: T,
  createEvent: (input: z.infer<T>) => UIEvent,
): ToolBinding {
  return {
    name,
    description,
    inputSchema: convertSchemaToJsonSchema(inputSchema) || {
      type: 'object',
      properties: {},
    },
    outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
    execute: async (args: unknown, context?: ToolExecutionContext) => {
      const parsed = inputSchema.parse(args)
      const event = createEvent(parsed)
      const emitCustomEvent = context?.emitCustomEvent || (() => {})

      // Extract reportId from the parsed input
      const reportId = (parsed as { reportId: string }).reportId

      emitCustomEvent('report:ui', {
        reportId,
        event,
      })

      applyReportUIEvent(reportId, event)

      return { success: true }
    },
  }
}

/**
 * Generate a random ID for components that don't have one specified
 */
function generateId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`
}

// Common schemas - using .catch() to gracefully handle invalid values from stored skills
const gapSchema = z.enum(['none', 'xs', 'sm', 'md', 'lg', 'xl']).catch('md')
const alignSchema = z
  .enum(['start', 'center', 'end', 'stretch'])
  .catch('stretch')
const paddingSchema = z.enum(['none', 'sm', 'md', 'lg']).catch('md')

const buttonVariantSchema = z
  .enum(['primary', 'secondary', 'danger', 'ghost'])
  .catch('primary')

const handlerBindingsForValidation = createHandlerBindings()
const handlerBindingTypes = generateTypeStubs(handlerBindingsForValidation)
const allowedHandlerBindings = new Set(
  Object.keys(handlerBindingsForValidation),
)

// ============================================================================
// Layout Bindings
// ============================================================================

const vboxBinding = createReportBinding(
  'external_report_vbox',
  'Create a vertical stack container for other components',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z.string().describe('Unique ID for this component'),
    parentId: z
      .string()
      .optional()
      .describe(
        'Parent component ID (optional, adds to root if not specified)',
      ),
    gap: gapSchema.describe('Gap between children'),
    align: alignSchema.describe('Cross-axis alignment'),
    padding: paddingSchema.describe('Internal padding'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id,
    type: 'vbox' as ComponentType,
    parentId: input.parentId,
    props: {
      gap: input.gap,
      align: input.align,
      padding: input.padding,
    },
  }),
)

const hboxBinding = createReportBinding(
  'external_report_hbox',
  'Create a horizontal stack container for other components',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z.string().describe('Unique ID for this component'),
    parentId: z.string().optional().describe('Parent component ID'),
    gap: gapSchema.describe('Gap between children'),
    align: alignSchema.describe('Cross-axis alignment'),
    justify: z
      .enum(['start', 'center', 'end', 'between', 'around'])
      .catch('start')
      .describe(
        'Main-axis alignment. Must be one of: start, center, end, between, around',
      ),
    wrap: z
      .boolean()
      .optional()
      .default(false)
      .describe('Whether to wrap children'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id,
    type: 'hbox' as ComponentType,
    parentId: input.parentId,
    props: {
      gap: input.gap,
      align: input.align,
      justify: input.justify,
      wrap: input.wrap,
    },
  }),
)

const gridBinding = createReportBinding(
  'external_report_grid',
  'Create a CSS grid container with responsive columns',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z.string().describe('Unique ID for this component'),
    parentId: z.string().optional().describe('Parent component ID'),
    cols: z
      .union([
        z.number(),
        z.object({
          sm: z.number().optional(),
          md: z.number().optional(),
          lg: z.number().optional(),
        }),
      ])
      .optional()
      .default(3)
      .describe('Number of columns or responsive breakpoints'),
    gap: gapSchema.describe('Gap between grid items'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id,
    type: 'grid' as ComponentType,
    parentId: input.parentId,
    props: {
      cols: input.cols,
      gap: input.gap,
    },
  }),
)

const cardBinding = createReportBinding(
  'external_report_card',
  'Create a card container with optional title and subtitle',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z.string().describe('Unique ID for this component'),
    parentId: z.string().optional().describe('Parent component ID'),
    title: z.string().optional().describe('Card title'),
    subtitle: z.string().optional().describe('Card subtitle'),
    variant: z
      .enum(['default', 'outlined', 'elevated'])
      .catch('default')
      .describe(
        'Card style variant. Must be one of: default, outlined, elevated',
      ),
    padding: paddingSchema.describe('Internal padding'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id,
    type: 'card' as ComponentType,
    parentId: input.parentId,
    props: {
      title: input.title,
      subtitle: input.subtitle,
      variant: input.variant,
      padding: input.padding,
    },
  }),
)

const sectionBinding = createReportBinding(
  'external_report_section',
  'Create a collapsible section with a title',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z.string().describe('Unique ID for this component'),
    parentId: z.string().optional().describe('Parent component ID'),
    title: z.string().describe('Section title'),
    defaultOpen: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether section is initially open'),
    collapsible: z
      .boolean()
      .optional()
      .default(true)
      .describe('Whether section can be collapsed'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id,
    type: 'section' as ComponentType,
    parentId: input.parentId,
    props: {
      title: input.title,
      defaultOpen: input.defaultOpen,
      collapsible: input.collapsible,
    },
  }),
)

// ============================================================================
// Content Bindings
// ============================================================================

const textBinding = createReportBinding(
  'external_report_text',
  'Add text content with typography variants',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    content: z.string().describe('Text content to display'),
    variant: z
      .enum(['h1', 'h2', 'h3', 'body', 'caption', 'code'])
      .catch('body')
      .describe(
        'Typography variant. Must be one of: h1, h2, h3, body, caption, code',
      ),
    color: z
      .enum(['default', 'muted', 'accent', 'success', 'warning', 'error'])
      .catch('default')
      .describe(
        'Text color. Must be one of: default, muted, accent, success, warning, error',
      ),
    align: z
      .enum(['left', 'center', 'right'])
      .catch('left')
      .describe('Text alignment. Must be one of: left, center, right'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('text'),
    type: 'text' as ComponentType,
    parentId: input.parentId,
    props: {
      content: input.content,
      variant: input.variant,
      color: input.color,
      align: input.align,
    },
  }),
)

const metricBindingSchema = z.object({
  reportId: z.string().describe('ID of the report to add to'),
  id: z
    .string()
    .optional()
    .describe('Component ID (auto-generated if not specified)'),
  parentId: z.string().optional().describe('Parent component ID'),
  value: z.union([z.number(), z.string()]).describe('The metric value'),
  label: z.string().describe('Label describing the metric'),
  trend: z.string().optional().describe('Trend indicator (e.g., "+8%")'),
  trendDirection: z
    .enum(['up', 'down', 'neutral'])
    .optional()
    .describe('Direction of trend'),
  format: z
    .enum(['number', 'currency', 'percent', 'compact'])
    .catch('number')
    .describe(
      'Number format. Must be one of: number, currency, percent, compact',
    ),
  prefix: z.string().optional().describe('Prefix (e.g., "$")'),
  suffix: z.string().optional().describe('Suffix (e.g., "/week")'),
  variant: z
    .enum(['default', 'success', 'warning', 'error'])
    .catch('default')
    .describe(
      'Color variant. Must be one of: default, success, warning, error',
    ),
  subscriptions: subscriptionsSchema,
  dataSource: dataSourceSchema,
})

const metricBinding: ToolBinding = {
  name: 'external_report_metric',
  description:
    'Display a big number with label and optional trend indicator. Supports subscriptions for reactive updates.',
  inputSchema: convertSchemaToJsonSchema(metricBindingSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args, context) => {
    const parsed = metricBindingSchema.parse(args)
    const { reportId, parentId, subscriptions, dataSource } = parsed
    const id = parsed.id || generateId('metric')
    const emitCustomEvent = context?.emitCustomEvent || (() => {})

    // Validate dataSource if provided
    let validatedDataSource: string | undefined
    if (dataSource) {
      const { validateHandler } = await import('./validate-handler')
      const validation = await validateHandler(
        dataSource,
        handlerBindingTypes,
        allowedHandlerBindings,
      )
      if (!validation.valid) {
        return {
          success: false,
          error: `dataSource validation failed: ${validation.error}`,
        }
      }
      validatedDataSource = validation.strippedCode || dataSource
    }

    // Register subscriptions with the signal registry
    if (subscriptions && subscriptions.length > 0) {
      const registry = getSignalRegistry(reportId)
      if (registry) {
        for (const signal of subscriptions) {
          registry.subscribe(id, signal)
        }
      }
    }

    const event: UIEvent = {
      op: 'add',
      id,
      type: 'metric',
      parentId,
      props: {
        value: parsed.value,
        label: parsed.label,
        trend: parsed.trend,
        trendDirection: parsed.trendDirection,
        format: parsed.format,
        prefix: parsed.prefix,
        suffix: parsed.suffix,
        variant: parsed.variant,
      },
      subscriptions,
      dataSource: validatedDataSource,
    }

    emitCustomEvent('report:ui', { reportId, event })
    applyReportUIEvent(reportId, event)

    return { success: true }
  },
}

const badgeBinding = createReportBinding(
  'external_report_badge',
  'Add a status pill/badge indicator',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    label: z.string().describe('Badge text'),
    variant: z
      .enum(['default', 'success', 'warning', 'error', 'info'])
      .catch('default')
      .describe(
        'Badge color variant. Must be one of: default, success, warning, error, info',
      ),
    size: z
      .enum(['sm', 'md'])
      .catch('md')
      .describe('Badge size. Must be one of: sm, md'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('badge'),
    type: 'badge' as ComponentType,
    parentId: input.parentId,
    props: {
      label: input.label,
      variant: input.variant,
      size: input.size,
    },
  }),
)

const markdownBinding = createReportBinding(
  'external_report_markdown',
  'Render markdown content with GFM support',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    content: z.string().describe('Markdown content'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('markdown'),
    type: 'markdown' as ComponentType,
    parentId: input.parentId,
    props: {
      content: input.content,
    },
  }),
)

const dividerBinding = createReportBinding(
  'external_report_divider',
  'Add a horizontal divider line',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    variant: z
      .enum(['solid', 'dashed'])
      .catch('solid')
      .describe('Line style. Must be one of: solid, dashed'),
    spacing: z
      .enum(['sm', 'md', 'lg'])
      .catch('md')
      .describe('Vertical spacing. Must be one of: sm, md, lg'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('divider'),
    type: 'divider' as ComponentType,
    parentId: input.parentId,
    props: {
      variant: input.variant,
      spacing: input.spacing,
    },
  }),
)

const spacerBinding = createReportBinding(
  'external_report_spacer',
  'Add empty space between components',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    size: z
      .enum(['sm', 'md', 'lg', 'xl', 'flex'])
      .catch('md')
      .describe('Space size. Must be one of: sm, md, lg, xl, flex'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('spacer'),
    type: 'spacer' as ComponentType,
    parentId: input.parentId,
    props: {
      size: input.size,
    },
  }),
)

const buttonBinding: ToolBinding = {
  name: 'external_report_button',
  description: 'Add a button with optional event handlers and subscriptions',
  inputSchema: convertSchemaToJsonSchema(
    z.object({
      reportId: z.string().describe('ID of the report to add to'),
      id: z.string().describe('Unique ID for this component'),
      parentId: z
        .string()
        .optional()
        .describe('Parent component ID (optional)'),
      label: z.string().describe('Button label'),
      variant: buttonVariantSchema.describe(
        'Button style variant. Must be one of: primary, secondary, danger, ghost',
      ),
      disabled: z.boolean().optional().describe('Disable the button'),
      handlers: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Event handlers as TypeScript strings (e.g. { onPress: "..." })',
        ),
      subscriptions: subscriptionsSchema,
      dataSource: dataSourceSchema,
    }),
  ) || { type: 'object', properties: {} },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args, context) => {
    const parsed = z
      .object({
        reportId: z.string(),
        id: z.string(),
        parentId: z.string().optional(),
        label: z.string(),
        variant: buttonVariantSchema,
        disabled: z.boolean().optional(),
        handlers: z.record(z.string(), z.string()).optional(),
        subscriptions: subscriptionsSchema,
        dataSource: dataSourceSchema,
      })
      .parse(args)

    const {
      reportId,
      id,
      parentId,
      label,
      variant,
      disabled,
      handlers,
      subscriptions,
      dataSource,
    } = parsed
    const emitCustomEvent = context?.emitCustomEvent || (() => {})

    let validatedHandlers: Record<string, string> | undefined
    if (handlers) {
      // Dynamic import to avoid RSC module runner issues with esbuild
      const { validateHandler } = await import('./validate-handler')
      validatedHandlers = {}
      for (const [handlerName, handlerCode] of Object.entries(handlers)) {
        const validation = await validateHandler(
          handlerCode,
          handlerBindingTypes,
          allowedHandlerBindings,
        )
        if (!validation.valid) {
          return {
            success: false,
            error: `Handler '${handlerName}' validation failed: ${validation.error}`,
          }
        }
        validatedHandlers[handlerName] = validation.strippedCode || handlerCode
      }
    }

    // Validate dataSource if provided
    let validatedDataSource: string | undefined
    if (dataSource) {
      const { validateHandler } = await import('./validate-handler')
      const validation = await validateHandler(
        dataSource,
        handlerBindingTypes,
        allowedHandlerBindings,
      )
      if (!validation.valid) {
        return {
          success: false,
          error: `dataSource validation failed: ${validation.error}`,
        }
      }
      validatedDataSource = validation.strippedCode || dataSource
    }

    // Register subscriptions with the signal registry
    if (subscriptions && subscriptions.length > 0) {
      const registry = getSignalRegistry(reportId)
      if (registry) {
        for (const signal of subscriptions) {
          registry.subscribe(id, signal)
        }
      }
    }

    const event: UIEvent = {
      op: 'add',
      id,
      type: 'button',
      parentId,
      props: {
        label,
        variant,
        disabled,
      },
      handlers: validatedHandlers,
      subscriptions,
      dataSource: validatedDataSource,
    }

    emitCustomEvent('report:ui', {
      reportId,
      event,
    })

    applyReportUIEvent(reportId, event)

    return { success: true }
  },
}

// ============================================================================
// Data Bindings
// ============================================================================

const chartBindingSchema = z.object({
  reportId: z.string().describe('ID of the report to add to'),
  id: z.string().describe('Unique ID for this component'),
  parentId: z.string().optional().describe('Parent component ID'),
  type: z.enum(['line', 'bar', 'area', 'pie', 'donut']).describe('Chart type'),
  data: z.array(z.record(z.string(), z.unknown())).describe('Chart data array'),
  xKey: z.string().describe('Key for X axis values'),
  yKey: z
    .union([z.string(), z.array(z.string())])
    .describe('Key(s) for Y axis values'),
  height: z.number().optional().default(300).describe('Chart height in pixels'),
  showLegend: z.boolean().optional().default(true).describe('Show legend'),
  showGrid: z.boolean().optional().default(true).describe('Show grid lines'),
  showTooltip: z
    .boolean()
    .optional()
    .default(true)
    .describe('Show tooltips on hover'),
  colors: z.array(z.string()).optional().describe('Custom colors array'),
  animate: z.boolean().optional().default(true).describe('Enable animations'),
  subscriptions: subscriptionsSchema,
  dataSource: dataSourceSchema,
})

const chartBinding: ToolBinding = {
  name: 'external_report_chart',
  description:
    'Create an interactive chart (line, bar, area, pie, donut). Supports subscriptions for reactive updates.',
  inputSchema: convertSchemaToJsonSchema(chartBindingSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args, context) => {
    const parsed = chartBindingSchema.parse(args)
    const { reportId, id, parentId, subscriptions, dataSource } = parsed
    const emitCustomEvent = context?.emitCustomEvent || (() => {})

    // Validate dataSource if provided
    let validatedDataSource: string | undefined
    if (dataSource) {
      const { validateHandler } = await import('./validate-handler')
      const validation = await validateHandler(
        dataSource,
        handlerBindingTypes,
        allowedHandlerBindings,
      )
      if (!validation.valid) {
        return {
          success: false,
          error: `dataSource validation failed: ${validation.error}`,
        }
      }
      validatedDataSource = validation.strippedCode || dataSource
    }

    // Register subscriptions with the signal registry
    if (subscriptions && subscriptions.length > 0) {
      const registry = getSignalRegistry(reportId)
      if (registry) {
        for (const signal of subscriptions) {
          registry.subscribe(id, signal)
        }
      }
    }

    const event: UIEvent = {
      op: 'add',
      id,
      type: 'chart',
      parentId,
      props: {
        type: parsed.type,
        data: parsed.data,
        xKey: parsed.xKey,
        yKey: parsed.yKey,
        height: parsed.height,
        showLegend: parsed.showLegend,
        showGrid: parsed.showGrid,
        showTooltip: parsed.showTooltip,
        colors: parsed.colors,
        animate: parsed.animate,
      },
      dataSource: validatedDataSource,
    }

    emitCustomEvent('report:ui', {
      reportId,
      event,
    })

    applyReportUIEvent(reportId, event)

    return { success: true }
  },
}

const sparklineBinding = createReportBinding(
  'external_report_sparkline',
  'Add a mini inline chart',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    data: z.array(z.number()).describe('Array of numeric values'),
    type: z
      .enum(['line', 'bar', 'area'])
      .catch('line')
      .describe('Sparkline type. Must be one of: line, bar, area'),
    color: z.string().optional().describe('Line/bar color'),
    height: z.number().optional().default(32).describe('Height in pixels'),
    width: z.number().optional().default(100).describe('Width in pixels'),
    showEndValue: z
      .boolean()
      .optional()
      .default(false)
      .describe('Show the last value'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('sparkline'),
    type: 'sparkline' as ComponentType,
    parentId: input.parentId,
    props: {
      data: input.data,
      type: input.type,
      color: input.color,
      height: input.height,
      width: input.width,
      showEndValue: input.showEndValue,
    },
  }),
)

const dataTableBindingSchema = z.object({
  reportId: z.string().describe('ID of the report to add to'),
  id: z.string().describe('Unique ID for this component'),
  parentId: z.string().optional().describe('Parent component ID'),
  columns: z
    .array(
      z.object({
        key: z.string().describe('Data key for this column'),
        label: z.string().describe('Column header label'),
        align: z
          .enum(['left', 'center', 'right'])
          .catch('left')
          .describe('Column alignment. Must be one of: left, center, right'),
        format: z
          .enum(['text', 'number', 'currency', 'percent', 'date'])
          .catch('text')
          .describe(
            'Data format. Must be one of: text, number, currency, percent, date',
          ),
        sortable: z.boolean().optional().default(true),
        width: z.union([z.number(), z.string()]).optional(),
      }),
    )
    .describe('Column definitions'),
  rows: z.array(z.record(z.string(), z.unknown())).describe('Row data'),
  pageSize: z.number().optional().default(10).describe('Rows per page'),
  showPagination: z
    .boolean()
    .optional()
    .default(true)
    .describe('Show pagination controls'),
  striped: z
    .boolean()
    .optional()
    .default(true)
    .describe('Alternating row colors'),
  compact: z.boolean().optional().default(false).describe('Compact row height'),
  sortBy: z.string().optional().describe('Initial sort column'),
  sortDirection: z
    .enum(['asc', 'desc'])
    .catch('asc')
    .describe('Initial sort direction. Must be one of: asc, desc'),
  subscriptions: subscriptionsSchema,
  dataSource: dataSourceSchema,
})

const dataTableBinding: ToolBinding = {
  name: 'external_report_dataTable',
  description:
    'Create a sortable, paginated data table. Supports subscriptions for reactive updates.',
  inputSchema: convertSchemaToJsonSchema(dataTableBindingSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args, context) => {
    const parsed = dataTableBindingSchema.parse(args)
    const { reportId, parentId, subscriptions, dataSource } = parsed
    const id = parsed.id || generateId('dataTable')
    const emitCustomEvent = context?.emitCustomEvent || (() => {})

    // Validate dataSource if provided
    let validatedDataSource: string | undefined
    if (dataSource) {
      const { validateHandler } = await import('./validate-handler')
      const validation = await validateHandler(
        dataSource,
        handlerBindingTypes,
        allowedHandlerBindings,
      )
      if (!validation.valid) {
        return {
          success: false,
          error: `dataSource validation failed: ${validation.error}`,
        }
      }
      validatedDataSource = validation.strippedCode || dataSource
    }

    // Register subscriptions with the signal registry
    if (subscriptions && subscriptions.length > 0) {
      const registry = getSignalRegistry(reportId)
      if (registry) {
        for (const signal of subscriptions) {
          registry.subscribe(id, signal)
        }
      }
    }

    const event: UIEvent = {
      op: 'add',
      id,
      type: 'dataTable' as ComponentType,
      parentId,
      props: {
        columns: parsed.columns,
        rows: parsed.rows,
        pageSize: parsed.pageSize,
        showPagination: parsed.showPagination,
        striped: parsed.striped,
        compact: parsed.compact,
        sortBy: parsed.sortBy,
        sortDirection: parsed.sortDirection,
      },
      subscriptions,
      dataSource: validatedDataSource,
    }

    emitCustomEvent('report:ui', { reportId, event })
    applyReportUIEvent(reportId, event)

    return { success: true, id }
  },
}

const progressBinding = createReportBinding(
  'external_report_progress',
  'Add a progress bar',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    value: z.number().describe('Current progress value'),
    max: z.number().optional().default(100).describe('Maximum value'),
    label: z.string().optional().describe('Progress label'),
    showValue: z.boolean().optional().default(true).describe('Show percentage'),
    variant: z
      .enum(['default', 'success', 'warning', 'error'])
      .catch('default')
      .describe(
        'Color variant. Must be one of: default, success, warning, error',
      ),
    size: z
      .enum(['sm', 'md', 'lg'])
      .catch('md')
      .describe('Bar size. Must be one of: sm, md, lg'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('progress'),
    type: 'progress' as ComponentType,
    parentId: input.parentId,
    props: {
      value: input.value,
      max: input.max,
      label: input.label,
      showValue: input.showValue,
      variant: input.variant,
      size: input.size,
    },
  }),
)

// ============================================================================
// Special Bindings
// ============================================================================

const placeholderBinding = createReportBinding(
  'external_report_placeholder',
  'Add a loading placeholder with skeleton animation',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z.string().describe('Unique ID for this component'),
    parentId: z.string().optional().describe('Parent component ID'),
    height: z
      .union([z.number(), z.string()])
      .optional()
      .default(100)
      .describe('Placeholder height'),
    label: z.string().optional().describe('Loading label'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id,
    type: 'placeholder' as ComponentType,
    parentId: input.parentId,
    props: {
      height: input.height,
      label: input.label,
    },
  }),
)

const errorBinding = createReportBinding(
  'external_report_error',
  'Display an error message',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    message: z.string().describe('Error message'),
    details: z.string().optional().describe('Additional error details'),
    variant: z
      .enum(['inline', 'card'])
      .catch('inline')
      .describe('Display variant. Must be one of: inline, card'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('error'),
    type: 'error' as ComponentType,
    parentId: input.parentId,
    props: {
      message: input.message,
      details: input.details,
      variant: input.variant,
    },
  }),
)

const emptyBinding = createReportBinding(
  'external_report_empty',
  'Display an empty state message',
  z.object({
    reportId: z.string().describe('ID of the report to add to'),
    id: z
      .string()
      .optional()
      .describe('Component ID (auto-generated if not specified)'),
    parentId: z.string().optional().describe('Parent component ID'),
    title: z.string().optional().describe('Empty state title'),
    description: z.string().optional().describe('Empty state description'),
    icon: z.string().optional().describe('Icon name'),
  }),
  (input) => ({
    op: 'add' as const,
    id: input.id || generateId('empty'),
    type: 'empty' as ComponentType,
    parentId: input.parentId,
    props: {
      title: input.title,
      description: input.description,
      icon: input.icon,
    },
  }),
)

// ============================================================================
// Operation Bindings
// ============================================================================

const updateInputSchema = z.object({
  reportId: z.string().describe('ID of the report'),
  componentId: z.string().describe('ID of the component to update'),
  props: z
    .record(z.string(), z.unknown())
    .describe('Props to merge with existing'),
})

const updateBinding: ToolBinding = {
  name: 'external_report_update',
  description: 'Update the props of an existing component',
  inputSchema: convertSchemaToJsonSchema(updateInputSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args, context) => {
    const { reportId, componentId, props } = updateInputSchema.parse(args)

    const emitCustomEvent = context?.emitCustomEvent || (() => {})
    const event: UIEvent = {
      op: 'update',
      id: componentId,
      props,
    }
    emitCustomEvent('report:ui', { reportId, event })
    applyReportUIEvent(reportId, event)

    return { success: true }
  },
}

const removeInputSchema = z.object({
  reportId: z.string().describe('ID of the report'),
  componentId: z.string().describe('ID of the component to remove'),
})

const removeBinding: ToolBinding = {
  name: 'external_report_remove',
  description: 'Remove a component from the report',
  inputSchema: convertSchemaToJsonSchema(removeInputSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args, context) => {
    const { reportId, componentId } = removeInputSchema.parse(args)

    // Unsubscribe component from all signals before removal
    const registry = getSignalRegistry(reportId)
    if (registry) {
      registry.unsubscribeAll(componentId)
    }

    const emitCustomEvent = context?.emitCustomEvent || (() => {})
    const event: UIEvent = {
      op: 'remove',
      id: componentId,
    }
    emitCustomEvent('report:ui', { reportId, event })
    applyReportUIEvent(reportId, event)

    return { success: true }
  },
}

const reorderInputSchema = z.object({
  reportId: z.string().describe('ID of the report'),
  parentId: z
    .string()
    .optional()
    .describe('Parent container ID (root if not specified)'),
  childIds: z.array(z.string()).describe('Ordered array of child IDs'),
})

const reorderBinding: ToolBinding = {
  name: 'external_report_reorder',
  description: 'Reorder children of a container',
  inputSchema: convertSchemaToJsonSchema(reorderInputSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args, context) => {
    const { reportId, parentId, childIds } = reorderInputSchema.parse(args)

    const emitCustomEvent = context?.emitCustomEvent || (() => {})
    const event: UIEvent = {
      op: 'reorder',
      parentId,
      childIds,
    }
    emitCustomEvent('report:ui', { reportId, event })
    applyReportUIEvent(reportId, event)

    return { success: true }
  },
}

// ============================================================================
// Watcher Subscription Bindings
// ============================================================================

const subscribeWatcherSchema = z.object({
  reportId: z.string().describe('ID of the report'),
  id: z.string().describe('Unique ID for this watcher'),
  description: z
    .string()
    .describe(
      'Human-readable description (e.g., "Alert when savings below $50")',
    ),
  signals: z
    .array(z.string())
    .describe('Signal names to watch (e.g., ["balances"])'),
  condition: z
    .string()
    .describe(
      'TypeScript code that returns true/false (e.g., "const b = await external_get_balances(); return b.savings < 50")',
    ),
  action: z
    .string()
    .describe(
      "TypeScript code to run when condition is true (e.g., \"await external_ui_toast({ message: 'Low savings!', variant: 'error' })\")",
    ),
  once: z
    .boolean()
    .optional()
    .default(false)
    .describe('If true, watcher fires once then is removed'),
})

const subscribeWatcherBinding: ToolBinding = {
  name: 'external_subscribe_watcher',
  description:
    'Register a watcher that runs code when signals change and a condition is met. Use for alerts like "notify if savings falls below $50".',
  inputSchema: convertSchemaToJsonSchema(subscribeWatcherSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(
    z.object({ success: z.boolean(), watcherId: z.string().optional() }),
  ),
  execute: async (args, _context) => {
    const parsed = subscribeWatcherSchema.parse(args)
    const { reportId, id, description, signals, condition, action, once } =
      parsed

    // Validate condition code
    const { validateHandler } = await import('./validate-handler')
    const conditionValidation = await validateHandler(
      condition,
      handlerBindingTypes,
      allowedHandlerBindings,
    )
    if (!conditionValidation.valid) {
      return {
        success: false,
        error: `Condition validation failed: ${conditionValidation.error}`,
      }
    }

    // Validate action code
    const actionValidation = await validateHandler(
      action,
      handlerBindingTypes,
      allowedHandlerBindings,
    )
    if (!actionValidation.valid) {
      return {
        success: false,
        error: `Action validation failed: ${actionValidation.error}`,
      }
    }

    const watcher: WatcherSubscription = {
      id,
      description,
      signals,
      condition: conditionValidation.strippedCode || condition,
      action: actionValidation.strippedCode || action,
      once,
      fired: false,
    }

    const success = addWatcher(reportId, watcher)
    if (!success) {
      return { success: false, error: 'Report not found' }
    }

    return { success: true, watcherId: id }
  },
}

const unsubscribeWatcherSchema = z.object({
  reportId: z.string().describe('ID of the report'),
  watcherId: z.string().describe('ID of the watcher to remove'),
})

const unsubscribeWatcherBinding: ToolBinding = {
  name: 'external_unsubscribe_watcher',
  description: 'Remove a previously registered watcher',
  inputSchema: convertSchemaToJsonSchema(unsubscribeWatcherSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(z.object({ success: z.boolean() })),
  execute: async (args) => {
    const { reportId, watcherId } = unsubscribeWatcherSchema.parse(args)
    const success = removeWatcher(reportId, watcherId)
    return { success }
  },
}

const listWatchersSchema = z.object({
  reportId: z.string().describe('ID of the report'),
})

const listWatchersBinding: ToolBinding = {
  name: 'external_list_watchers',
  description: 'List all active watchers for a report',
  inputSchema: convertSchemaToJsonSchema(listWatchersSchema) || {
    type: 'object',
    properties: {},
  },
  outputSchema: convertSchemaToJsonSchema(
    z.object({
      watchers: z.array(
        z.object({
          id: z.string(),
          description: z.string(),
          signals: z.array(z.string()),
          fired: z.boolean().optional(),
        }),
      ),
    }),
  ),
  execute: async (args) => {
    const { reportId } = listWatchersSchema.parse(args)
    const watchers = getAllWatchers(reportId)
    return {
      watchers: watchers.map((w) => ({
        id: w.id,
        description: w.description,
        signals: w.signals,
        fired: w.fired,
      })),
    }
  },
}

// ============================================================================
// Export All Bindings
// ============================================================================

/**
 * All report bindings to be added to the sandbox.
 * These become available as external_report_* functions inside execute_typescript.
 */
export const reportBindings: Record<string, ToolBinding> = {
  // Layout
  external_report_vbox: vboxBinding,
  external_report_hbox: hboxBinding,
  external_report_grid: gridBinding,
  external_report_card: cardBinding,
  external_report_section: sectionBinding,
  // Content
  external_report_text: textBinding,
  external_report_metric: metricBinding,
  external_report_badge: badgeBinding,
  external_report_markdown: markdownBinding,
  external_report_divider: dividerBinding,
  external_report_spacer: spacerBinding,
  external_report_button: buttonBinding,
  // Data
  external_report_chart: chartBinding,
  external_report_sparkline: sparklineBinding,
  external_report_dataTable: dataTableBinding,
  external_report_progress: progressBinding,
  // Special
  external_report_placeholder: placeholderBinding,
  external_report_error: errorBinding,
  external_report_empty: emptyBinding,
  // Operations
  external_report_update: updateBinding,
  external_report_remove: removeBinding,
  external_report_reorder: reorderBinding,
  // Watchers
  external_subscribe_watcher: subscribeWatcherBinding,
  external_unsubscribe_watcher: unsubscribeWatcherBinding,
  external_list_watchers: listWatchersBinding,
}

// Banking bindings for demo - available during report building
const bankingBindings = createHandlerBindings()

/**
 * Create report bindings function for use with getSkillBindings
 * Returns a fresh copy of the bindings record
 */
export function createReportBindings(): Record<string, ToolBinding> {
  return {
    ...reportBindings,
    // Include banking bindings for demo
    external_get_balances: bankingBindings.external_get_balances,
    external_transfer: bankingBindings.external_transfer,
    external_get_transactions: bankingBindings.external_get_transactions,
  }
}
