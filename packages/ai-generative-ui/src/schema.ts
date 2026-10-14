/**
 * Open Generative UI Specification (Draft 0.1)
 * JSON Schema definitions for GraphDocument and catalog types.
 */

export const GRAPH_DOCUMENT_SCHEMA = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'GraphDocument',
  type: 'object',
  required: ['specVersion', 'graphId', 'revision', 'title', 'fallbackText', 'provenance', 'root'],
  properties: {
    specVersion: { type: 'string', enum: ['0.1'] },
    graphId: { type: 'string' },
    revision: { type: 'integer', minimum: 1 },
    title: { type: 'string' },
    fallbackText: { type: 'string', minLength: 1 },
    provenance: {
      type: 'object',
      required: ['driver'],
      properties: {
        driver: { type: 'string', enum: ['fixture', 'programmatic', 'live'] },
        agentId: { type: 'string' },
        runId: { type: 'string' },
        sourceId: { type: 'string' },
      },
    },
    root: { $ref: '#/definitions/UINode' },
  },
  definitions: {
    UINode: {
      type: 'object',
      required: ['id', 'type'],
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        props: { type: 'object' },
        children: {
          type: 'array',
          items: { $ref: '#/definitions/UINode' },
        },
        bind: {
          type: 'object',
          additionalProperties: { type: 'string' },
        },
        compute: {
          oneOf: [
            { type: 'string' },
            {
              type: 'object',
              required: ['name', 'inputs', 'output'],
              properties: {
                name: { type: 'string' },
                inputs: { type: 'object', additionalProperties: { type: 'string' } },
                output: { type: 'string' },
              },
            },
          ],
        },
        on: {
          type: 'object',
          additionalProperties: {
            oneOf: [
              { type: 'string' },
              {
                type: 'object',
                required: ['intent'],
                properties: {
                  intent: { type: 'string' },
                  payload: {},
                },
              },
            ],
          },
        },
      },
    },
  },
} as const

export const KNOWN_CATALOG_TYPES = new Set([
  // 6.1 Layout
  'Stack',
  'Columns',
  'Section',
  'Tabs',
  'Timeline',
  // 6.2 Content
  'Text',
  'Image',
  'Table',
  'List',
  'Metric',
  'Chart',
  'Map',
  'Diagram',
  'Callout',
  // 6.3 Input and Action
  'Form',
  'TextInput',
  'NumberInput',
  'Select',
  'Slider',
  'Stepper',
  'Toggle',
  'Checkbox',
  'Checklist',
  'Button',
  'Choice',
  // 6.4 Vector Scenes
  'Scene',
])

export const CONTAINER_TYPES = new Set([
  'Stack',
  'Columns',
  'Section',
  'Tabs',
  'Timeline',
  'Form',
])
