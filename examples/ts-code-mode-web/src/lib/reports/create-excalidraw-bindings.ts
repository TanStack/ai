import { z } from 'zod'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import type { ToolBinding, ToolExecutionContext } from '@tanstack/ai-code-mode'
import type { BindingSignalMetadata } from './types'

/**
 * Signal metadata for Excalidraw bindings
 */
export const EXCALIDRAW_SIGNAL_METADATA: Record<string, BindingSignalMetadata> =
  {
    external_excalidraw_get_elements: {
      signal: 'diagram',
    },
    external_excalidraw_add_element: {
      invalidates: ['diagram'],
    },
    external_excalidraw_update_element: {
      invalidates: ['diagram'],
    },
    external_excalidraw_remove_element: {
      invalidates: ['diagram'],
    },
    external_excalidraw_connect: {
      invalidates: ['diagram'],
    },
    external_excalidraw_clear: {
      invalidates: ['diagram'],
    },
    external_excalidraw_add_template: {
      invalidates: ['diagram'],
    },
  }

/**
 * Get the signals that an excalidraw binding invalidates when called.
 */
export function getExcalidrawInvalidatedSignals(bindingName: string): string[] {
  return EXCALIDRAW_SIGNAL_METADATA[bindingName]?.invalidates || []
}

// Generate a random ID for elements
function generateElementId(): string {
  return `elem-${Math.random().toString(36).slice(2, 10)}`
}

// Generate a random seed for Excalidraw elements
function generateSeed(): number {
  return Math.floor(Math.random() * 2147483647)
}

// Estimate text width based on character count and font size
// This is an approximation - monospace would be ~0.6, but we use a variable font
function estimateTextWidth(text: string, fontSize: number): number {
  const avgCharWidth = fontSize * 0.6
  return Math.max(text.length * avgCharWidth, 40)
}

// Calculate edge connection point between two elements
// Returns the point on the edge of the "from" element closest to the "to" element
function calculateEdgePoint(
  fromElement: { x: number; y: number; width?: number; height?: number },
  toElement: { x: number; y: number; width?: number; height?: number },
): { x: number; y: number } {
  const fromCenterX = fromElement.x + (fromElement.width || 0) / 2
  const fromCenterY = fromElement.y + (fromElement.height || 0) / 2
  const toCenterX = toElement.x + (toElement.width || 0) / 2
  const toCenterY = toElement.y + (toElement.height || 0) / 2

  const dx = toCenterX - fromCenterX
  const dy = toCenterY - fromCenterY

  // Determine which edge to connect from based on direction
  if (Math.abs(dx) > Math.abs(dy)) {
    // Horizontal connection
    if (dx > 0) {
      // Target is to the right, connect from right edge
      return { x: fromElement.x + (fromElement.width || 0), y: fromCenterY }
    } else {
      // Target is to the left, connect from left edge
      return { x: fromElement.x, y: fromCenterY }
    }
  } else {
    // Vertical connection
    if (dy > 0) {
      // Target is below, connect from bottom edge
      return { x: fromCenterX, y: fromElement.y + (fromElement.height || 0) }
    } else {
      // Target is above, connect from top edge
      return { x: fromCenterX, y: fromElement.y }
    }
  }
}

// Base element properties that all elements share
function createBaseElement(params: {
  id?: string
  type: string
  x: number
  y: number
  width?: number
  height?: number
  strokeColor?: string
  backgroundColor?: string
}) {
  return {
    id: params.id || generateElementId(),
    type: params.type,
    x: params.x,
    y: params.y,
    width: params.width || 150,
    height: params.height || 80,
    angle: 0,
    strokeColor: params.strokeColor || '#1e1e1e',
    backgroundColor: params.backgroundColor || 'transparent',
    fillStyle: 'solid' as const,
    strokeWidth: 2,
    strokeStyle: 'solid' as const,
    roughness: 1,
    opacity: 100,
    seed: generateSeed(),
    version: 1,
    versionNonce: generateSeed(),
    isDeleted: false,
    boundElements: null,
    updated: Date.now(),
    link: null,
    locked: false,
    groupIds: [] as string[],
    frameId: null,
    index: null,
    roundness: { type: 3 },
  }
}

export interface ExcalidrawBindingOptions {
  getElements: () => unknown[]
  setElements: (elements: unknown[]) => void
  onBindingCall?: (name: string) => void
  reportId?: string
  canvasId?: string
}

function createBinding(
  name: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  outputSchema: z.ZodTypeAny,
  execute: (params: unknown, context?: ToolExecutionContext) => Promise<unknown>,
): ToolBinding {
  return {
    name,
    description,
    inputSchema:
      convertSchemaToJsonSchema(inputSchema) || {
        type: 'object',
        properties: {},
      },
    outputSchema: convertSchemaToJsonSchema(outputSchema),
    execute,
  }
}

export function createExcalidrawBindings(
  options: ExcalidrawBindingOptions,
): Record<string, ToolBinding> {
  const { getElements, setElements, onBindingCall, reportId, canvasId } = options

  const track = (name: string) => onBindingCall?.(name)
  
  // Helper to emit signal invalidation events
  const emitSignalInvalidation = (context?: ToolExecutionContext) => {
    if (context?.emitCustomEvent && reportId && canvasId) {
      context.emitCustomEvent('excalidraw:invalidated', {
        reportId,
        canvasId,
        signals: ['diagram'],
        elements: getElements(),
      })
    }
  }

  return {
    external_excalidraw_get_elements: createBinding(
      'external_excalidraw_get_elements',
      'Get the current Excalidraw diagram elements',
      z.object({}),
      z.array(z.unknown()),
      async () => {
        track('external_excalidraw_get_elements')
        return getElements()
      },
    ),

    external_excalidraw_add_element: createBinding(
      'external_excalidraw_add_element',
      'Add a shape element to the Excalidraw diagram',
      z.object({
        type: z
          .enum(['rectangle', 'ellipse', 'diamond', 'line', 'arrow', 'text'])
          .describe('Shape type'),
        x: z.number().describe('X position'),
        y: z.number().describe('Y position'),
        width: z.number().optional().describe('Width (default: 150)'),
        height: z.number().optional().describe('Height (default: 80)'),
        text: z.string().optional().describe('Text content (for text type)'),
        backgroundColor: z
          .string()
          .optional()
          .describe('Fill color (e.g., "#a5d8ff")'),
        strokeColor: z
          .string()
          .optional()
          .describe('Stroke color (e.g., "#1e1e1e")'),
        label: z
          .string()
          .optional()
          .describe('Label to add as text element nearby'),
      }),
      z.object({
        success: z.boolean(),
        elementId: z.string(),
      }),
      async (params, context) => {
        track('external_excalidraw_add_element')
        const parsed = z
          .object({
            type: z.enum([
              'rectangle',
              'ellipse',
              'diamond',
              'line',
              'arrow',
              'text',
            ]),
            x: z.number(),
            y: z.number(),
            width: z.number().optional(),
            height: z.number().optional(),
            text: z.string().optional(),
            backgroundColor: z.string().optional(),
            strokeColor: z.string().optional(),
            label: z.string().optional(),
          })
          .parse(params)

        const elements = getElements() as unknown[]
        const elementId = generateElementId()

        let newElement: unknown

        if (parsed.type === 'text') {
          const textContent = parsed.text || ''
          const textWidth = parsed.width || estimateTextWidth(textContent, 20)
          newElement = {
            ...createBaseElement({
              id: elementId,
              type: 'text',
              x: parsed.x,
              y: parsed.y,
              width: textWidth,
              height: parsed.height || 28,
              strokeColor: parsed.strokeColor,
              backgroundColor: parsed.backgroundColor,
            }),
            text: textContent,
            fontSize: 20,
            fontFamily: 1,
            textAlign: 'center' as const,
            verticalAlign: 'middle' as const,
            baseline: 18,
            containerId: null,
            originalText: textContent,
            autoResize: true,
            lineHeight: 1.25,
          }
        } else if (parsed.type === 'line' || parsed.type === 'arrow') {
          newElement = {
            ...createBaseElement({
              id: elementId,
              type: parsed.type,
              x: parsed.x,
              y: parsed.y,
              width: parsed.width || 100,
              height: parsed.height || 0,
              strokeColor: parsed.strokeColor,
              backgroundColor: parsed.backgroundColor,
            }),
            points: [
              [0, 0],
              [parsed.width || 100, parsed.height || 0],
            ],
            lastCommittedPoint: null,
            startBinding: null,
            endBinding: null,
            startArrowhead: null,
            endArrowhead: parsed.type === 'arrow' ? 'arrow' : null,
          }
        } else {
          newElement = createBaseElement({
            id: elementId,
            type: parsed.type,
            x: parsed.x,
            y: parsed.y,
            width: parsed.width,
            height: parsed.height,
            strokeColor: parsed.strokeColor,
            backgroundColor: parsed.backgroundColor,
          })
        }

        const newElements = [...elements, newElement]

        // If label provided and not a text element, add a text label
        if (parsed.label && parsed.type !== 'text') {
          const labelId = generateElementId()
          const labelWidth = estimateTextWidth(parsed.label, 16)
          const labelElement = {
            ...createBaseElement({
              id: labelId,
              type: 'text',
              x: parsed.x + (parsed.width || 150) / 2 - labelWidth / 2,
              y: parsed.y + (parsed.height || 80) / 2 - 10,
              width: labelWidth,
              height: 24,
              strokeColor: parsed.strokeColor || '#1e1e1e',
            }),
            text: parsed.label,
            fontSize: 16,
            fontFamily: 1,
            textAlign: 'center' as const,
            verticalAlign: 'middle' as const,
            baseline: 14,
            containerId: null,
            originalText: parsed.label,
            autoResize: true,
            lineHeight: 1.25,
          }
          newElements.push(labelElement)
        }

        setElements(newElements)
        emitSignalInvalidation(context)
        return { success: true, elementId }
      },
    ),

    external_excalidraw_connect: createBinding(
      'external_excalidraw_connect',
      'Connect two Excalidraw elements with an arrow or line',
      z.object({
        fromId: z.string().describe('ID of the source element'),
        toId: z.string().describe('ID of the target element'),
        type: z
          .enum(['arrow', 'line'])
          .optional()
          .default('arrow')
          .describe('Connection type'),
        label: z.string().optional().describe('Label for the connection'),
      }),
      z.object({
        success: z.boolean(),
        elementId: z.string(),
        error: z.string().optional(),
      }),
      async (params, context) => {
        track('external_excalidraw_connect')
        const parsed = z
          .object({
            fromId: z.string(),
            toId: z.string(),
            type: z.enum(['arrow', 'line']).optional().default('arrow'),
            label: z.string().optional(),
          })
          .parse(params)

        const elements = getElements() as Array<{
          id: string
          x: number
          y: number
          width?: number
          height?: number
        }>
        const fromElement = elements.find((e) => e.id === parsed.fromId)
        const toElement = elements.find((e) => e.id === parsed.toId)

        if (!fromElement || !toElement) {
          return {
            success: false,
            elementId: '',
            error: `Element not found: ${!fromElement ? parsed.fromId : parsed.toId}`,
          }
        }

        // Calculate edge-to-edge connection points
        const fromPoint = calculateEdgePoint(fromElement, toElement)
        const toPoint = calculateEdgePoint(toElement, fromElement)

        const elementId = generateElementId()
        const arrowElement = {
          ...createBaseElement({
            id: elementId,
            type: parsed.type === 'line' ? 'line' : 'arrow',
            x: fromPoint.x,
            y: fromPoint.y,
            width: toPoint.x - fromPoint.x,
            height: toPoint.y - fromPoint.y,
          }),
          points: [
            [0, 0],
            [toPoint.x - fromPoint.x, toPoint.y - fromPoint.y],
          ],
          lastCommittedPoint: null,
          startBinding: { elementId: parsed.fromId, focus: 0, gap: 8 },
          endBinding: { elementId: parsed.toId, focus: 0, gap: 8 },
          startArrowhead: null,
          endArrowhead: parsed.type === 'line' ? null : 'arrow',
        }

        const newElements = [...elements, arrowElement]

        // Add label at midpoint if provided
        if (parsed.label) {
          const midX = (fromPoint.x + toPoint.x) / 2
          const midY = (fromPoint.y + toPoint.y) / 2
          const labelWidth = estimateTextWidth(parsed.label, 12)
          const labelElement = {
            ...createBaseElement({
              id: generateElementId(),
              type: 'text',
              x: midX - labelWidth / 2,
              y: midY - 10,
              width: labelWidth,
              height: 20,
              strokeColor: '#666666',
            }),
            text: parsed.label,
            fontSize: 12,
            fontFamily: 1,
            textAlign: 'center' as const,
            verticalAlign: 'middle' as const,
            baseline: 10,
            containerId: null,
            originalText: parsed.label,
            autoResize: true,
            lineHeight: 1.25,
          }
          newElements.push(labelElement)
        }

        setElements(newElements)
        emitSignalInvalidation(context)
        return { success: true, elementId }
      },
    ),

    external_excalidraw_update_element: createBinding(
      'external_excalidraw_update_element',
      'Update properties of an existing Excalidraw element',
      z.object({
        elementId: z.string().describe('ID of the element to update'),
        updates: z
          .record(z.string(), z.unknown())
          .describe('Properties to update'),
      }),
      z.object({
        success: z.boolean(),
        error: z.string().optional(),
      }),
      async (params, context) => {
        track('external_excalidraw_update_element')
        const parsed = z
          .object({
            elementId: z.string(),
            updates: z.record(z.string(), z.unknown()),
          })
          .parse(params)

        const elements = getElements() as Array<Record<string, unknown>>
        const index = elements.findIndex((e) => e.id === parsed.elementId)

        if (index === -1) {
          return { success: false, error: `Element not found: ${parsed.elementId}` }
        }

        const updatedElements = [...elements]
        const currentElement = updatedElements[index]
        updatedElements[index] = {
          ...currentElement,
          ...parsed.updates,
          version: ((currentElement.version as number) || 0) + 1,
          updated: Date.now(),
        }

        setElements(updatedElements)
        emitSignalInvalidation(context)
        return { success: true }
      },
    ),

    external_excalidraw_remove_element: createBinding(
      'external_excalidraw_remove_element',
      'Remove an element from the Excalidraw diagram',
      z.object({
        elementId: z.string().describe('ID of the element to remove'),
      }),
      z.object({
        success: z.boolean(),
      }),
      async (params, context) => {
        track('external_excalidraw_remove_element')
        const parsed = z.object({ elementId: z.string() }).parse(params)

        const elements = getElements() as Array<{ id: string }>
        const filtered = elements.filter((e) => e.id !== parsed.elementId)
        setElements(filtered)
        emitSignalInvalidation(context)
        return { success: true }
      },
    ),

    external_excalidraw_clear: createBinding(
      'external_excalidraw_clear',
      'Clear all elements from the Excalidraw diagram',
      z.object({}),
      z.object({
        success: z.boolean(),
      }),
      async (_params, context) => {
        track('external_excalidraw_clear')
        setElements([])
        emitSignalInvalidation(context)
        return { success: true }
      },
    ),

    external_excalidraw_add_template: createBinding(
      'external_excalidraw_add_template',
      'Add a predefined shape template (service, database, user, cloud, queue) with appropriate styling',
      z.object({
        template: z
          .enum(['service', 'database', 'user', 'cloud', 'queue'])
          .describe('Template type'),
        x: z.number().describe('X position'),
        y: z.number().describe('Y position'),
        label: z.string().describe('Label for the shape'),
        color: z.string().optional().describe('Override background color'),
      }),
      z.object({
        success: z.boolean(),
        elementId: z.string(),
      }),
      async (params, context) => {
        track('external_excalidraw_add_template')
        const parsed = z
          .object({
            template: z.enum(['service', 'database', 'user', 'cloud', 'queue']),
            x: z.number(),
            y: z.number(),
            label: z.string(),
            color: z.string().optional(),
          })
          .parse(params)

        const templates: Record<
          string,
          { type: string; width: number; height: number; backgroundColor: string }
        > = {
          service: {
            type: 'rectangle',
            width: 180,
            height: 100,
            backgroundColor: '#a5d8ff',
          },
          database: {
            type: 'ellipse',
            width: 140,
            height: 90,
            backgroundColor: '#b2f2bb',
          },
          user: {
            type: 'ellipse',
            width: 100,
            height: 100,
            backgroundColor: '#ffc9c9',
          },
          cloud: {
            type: 'ellipse',
            width: 200,
            height: 120,
            backgroundColor: '#e5dbff',
          },
          queue: {
            type: 'rectangle',
            width: 150,
            height: 80,
            backgroundColor: '#ffec99',
          },
        }

        const template = templates[parsed.template] || templates.service
        const elements = getElements() as unknown[]
        const elementId = generateElementId()

        const newElement = createBaseElement({
          id: elementId,
          type: template.type,
          x: parsed.x,
          y: parsed.y,
          width: template.width,
          height: template.height,
          backgroundColor: parsed.color || template.backgroundColor,
        })

        // Add the label as a text element with auto-sized width
        const labelId = generateElementId()
        const labelWidth = estimateTextWidth(parsed.label, 14)
        const labelElement = {
          ...createBaseElement({
            id: labelId,
            type: 'text',
            x: parsed.x + template.width / 2 - labelWidth / 2,
            y: parsed.y + template.height / 2 - 10,
            width: labelWidth,
            height: 22,
            strokeColor: '#1e1e1e',
          }),
          text: parsed.label,
          fontSize: 14,
          fontFamily: 1,
          textAlign: 'center' as const,
          verticalAlign: 'middle' as const,
          baseline: 12,
          containerId: null,
          originalText: parsed.label,
          autoResize: true,
          lineHeight: 1.25,
        }

        setElements([...elements, newElement, labelElement])
        emitSignalInvalidation(context)
        return { success: true, elementId }
      },
    ),
  }
}
