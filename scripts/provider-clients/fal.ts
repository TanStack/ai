import { durationOf } from './video-durations.ts'
import type { Duration } from './video-durations.ts'

/**
 * The fal image-conditioning field overrides, from the modelschemas fal
 * activity documents.
 *
 * fal endpoints name their image inputs differently (`image_url`,
 * `image_urls`, `first_frame_url`, `mask_image_url`, ...). The runtime
 * mapper in `packages/ai-fal/src/image/image-inputs.ts` uses a default field
 * per input role. This records, per endpoint and role, the field the
 * endpoint takes when it is not the default. Endpoints that match every
 * default are left out.
 */

type RoleKey =
  | 'single'
  | 'multi'
  | 'mask'
  | 'control'
  | 'reference'
  | 'start'
  | 'end'

const ROLE_ORDER: Array<RoleKey> = [
  'single',
  'multi',
  'mask',
  'control',
  'reference',
  'start',
  'end',
]

/** Must match `DEFAULT_FIELDS` in image-inputs.ts. */
const DEFAULTS: Record<RoleKey, string> = {
  single: 'image_url',
  multi: 'image_urls',
  mask: 'mask_url',
  control: 'control_image_url',
  reference: 'reference_image_urls',
  start: 'start_image_url',
  end: 'end_image_url',
}

/**
 * Candidate fields per role, first match wins. `start` and `end` are only
 * used for endpoints that output video, where the source image is the start
 * frame, so `image_url` is a `start` candidate.
 */
const CANDIDATES: Record<RoleKey, Array<string>> = {
  single: [
    'image_url',
    'input_image_url',
    'image_data_url',
    'image_urls',
    'input_image_urls',
  ],
  multi: [
    'image_urls',
    'input_image_urls',
    'ref_image_urls',
    'reference_image_urls',
  ],
  mask: ['mask_url', 'mask_image_url'],
  control: ['control_image_url'],
  reference: [
    'reference_image_urls',
    'ref_image_urls',
    'reference_image_url',
    'image_urls',
    'input_image_urls',
  ],
  start: ['start_image_url', 'first_frame_url', 'first_image_url', 'image_url'],
  end: ['end_image_url', 'last_frame_url', 'last_image_url', 'tail_image_url'],
}

const VIDEO_ONLY_ROLES = new Set<RoleKey>(['start', 'end'])

/** Must match `LIST_FIELDS` in image-inputs.ts. */
const LIST_FIELDS = new Set([
  'image_urls',
  'input_image_urls',
  'ref_image_urls',
  'reference_image_urls',
])

export type Schema = Record<string, unknown> & {
  $ref?: string
  type?: unknown
  anyOf?: Array<Schema>
  oneOf?: Array<Schema>
  properties?: Record<string, Schema>
}

export interface ActivityDoc {
  components?: { schemas?: Record<string, Schema> }
  paths?: Record<string, Record<string, Operation>>
}

interface Operation {
  requestBody?: { content?: Record<string, { schema?: Schema }> }
}

function isArraySchema(
  schema: Schema | undefined,
  schemas: Record<string, Schema>,
): boolean {
  if (!schema) return false
  if (schema.$ref) {
    return isArraySchema(schemas[schema.$ref.split('/').pop() ?? ''], schemas)
  }
  if (schema.type === 'array') return true
  if (Array.isArray(schema.type) && schema.type.includes('array')) return true
  return [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some((part) =>
    isArraySchema(part, schemas),
  )
}

/** Per endpoint id, the role fields that differ from the defaults. */
export function falImageFieldOverrides(docs: Array<ActivityDoc>) {
  const overrides = new Map<string, Partial<Record<RoleKey, string>>>()
  for (const doc of docs) {
    const schemas = doc.components?.schemas ?? {}
    const outputs = new Map<string, Schema>()
    for (const [key, schema] of Object.entries(schemas)) {
      const model = schema['x-modelschemas-model']
      if (key.startsWith('output_') && typeof model === 'string') {
        outputs.set(model, schema)
      }
    }
    for (const [key, schema] of Object.entries(schemas)) {
      const model = schema['x-modelschemas-model']
      if (!key.startsWith('input_') || typeof model !== 'string') continue
      const fields = schema.properties ?? {}
      const output = outputs.get(model)?.properties ?? {}
      const producesVideo = 'video' in output || 'videos' in output
      const entry: Partial<Record<RoleKey, string>> = {}
      for (const role of ROLE_ORDER) {
        if (VIDEO_ONLY_ROLES.has(role) && !producesVideo) continue
        const chosen = CANDIDATES[role].find((field) => field in fields)
        if (!chosen) continue
        // The runtime mapper wraps arrays from LIST_FIELDS, so the schema
        // must agree, for default fields too.
        if (
          isArraySchema(fields[chosen], schemas) !== LIST_FIELDS.has(chosen)
        ) {
          throw new Error(
            `Arity mismatch for ${model}.${chosen}: LIST_FIELDS here and in image-inputs.ts disagree with the schema.`,
          )
        }
        if (chosen !== DEFAULTS[role]) entry[role] = chosen
      }
      if (Object.keys(entry).length > 0) overrides.set(model, entry)
    }
  }
  return overrides
}

/** The `image-field-overrides.ts` module text. */
export function renderFalImageFieldOverrides(
  overrides: Map<string, Partial<Record<RoleKey, string>>>,
) {
  const entries = [...overrides.keys()]
    .sort()
    .map((id) => {
      const entry = overrides.get(id) ?? {}
      const pairs = ROLE_ORDER.filter((role) => entry[role]).map(
        (role) => `${role}: '${entry[role]}'`,
      )
      return `  '${id}': { ${pairs.join(', ')} },`
    })
    .join('\n')
  const names = new Set(Object.values(DEFAULTS))
  for (const entry of overrides.values()) {
    for (const field of Object.values(entry)) names.add(field)
  }
  const union = [...names]
    .sort()
    .map((name) => `  | '${name}'`)
    .join('\n')

  return `// Generated by scripts/provider-clients/generate.ts from the modelschemas
// fal activity documents. Do not edit. Run \`pnpm generate:provider-clients\`.
//
// The image-conditioning input field of each fal endpoint, per role, when it
// is not the default in image-inputs.ts. \`satisfies\` checks every field
// against the generated endpoint input types.
import type { EndpointTypeMap } from '../../model-meta'

/** Every input field name the image-input mappers may emit. */
export type FalImageFieldName =
${union}

/**
 * Per-role input-field overrides. Roles: \`single\` / \`multi\` route unroled
 * source images; the rest mirror \`MediaInputRole\` (\`start\` / \`end\` map the
 * \`start_frame\` / \`end_frame\` roles).
 */
export interface FalImageFieldOverride {
  single?: string
  multi?: string
  mask?: string
  control?: string
  reference?: string
  start?: string
  end?: string
}

type InputFieldOf<K extends keyof EndpointTypeMap> = Extract<
  keyof EndpointTypeMap[K]['input'],
  string
>

export const FAL_IMAGE_FIELD_OVERRIDES = {
${entries}
} as const satisfies {
  [K in keyof EndpointTypeMap]?: {
    [Role in keyof FalImageFieldOverride]?: InputFieldOf<K>
  }
}
`
}

/** Per video endpoint id, the duration options from its input schema. */
export function falVideoDurations(doc: ActivityDoc) {
  const schemas = doc.components?.schemas ?? {}
  const durations = new Map<string, Duration>()
  for (const [key, schema] of Object.entries(schemas)) {
    const model = schema['x-modelschemas-model']
    if (!key.startsWith('input_') || typeof model !== 'string') continue
    const duration = durationOf(schema.properties?.duration, schemas)
    if (duration) durations.set(model, duration)
  }
  return durations
}
