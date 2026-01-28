// This file is manually maintained (not auto-generated)
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Registry of known missing schemas that fal.ai references but doesn't define.
 *
 * fal.ai's OpenAPI specs sometimes contain $ref pointers to schemas that don't exist
 * in the components.schemas section. This is a data quality issue from their API.
 *
 * We resolve these missing $refs by injecting proper schema definitions BEFORE
 * @hey-api/openapi-ts sees the specs (since the parser fails on missing $refs).
 *
 * When console warnings show unknown placeholders, research the schema structure
 * and add proper definitions here to get correct TypeScript types.
 */
const KNOWN_MISSING_SCHEMAS: Record<string, any> = {
  TrackPoint: {
    type: 'object',
    description: 'A coordinate point with x and y values for motion tracking',
    properties: {
      x: { type: 'number', description: 'X coordinate' },
      y: { type: 'number', description: 'Y coordinate' },
    },
    required: ['x', 'y'],
  },
  // Add more known missing schemas here as they're discovered
}

/**
 * Recursively find all $ref pointers in an OpenAPI spec object.
 * Extracts schema names from references like "#/components/schemas/SchemaName".
 */
function findAllRefs(obj: any, refs: Set<string> = new Set()): Set<string> {
  if (!obj || typeof obj !== 'object') return refs

  if (Array.isArray(obj)) {
    obj.forEach((item) => findAllRefs(item, refs))
  } else {
    for (const [key, value] of Object.entries(obj)) {
      if (key === '$ref' && typeof value === 'string') {
        // Extract schema name from "#/components/schemas/SchemaName"
        const match = value.match(/#\/components\/schemas\/(.+)/)
        if (match?.[1]) refs.add(match[1])
      }
      if (typeof value === 'object') {
        findAllRefs(value, refs)
      }
    }
  }

  return refs
}

/**
 * Resolve missing $refs by injecting schema definitions.
 *
 * For known missing schemas (in KNOWN_MISSING_SCHEMAS), uses proper definitions.
 * For unknown missing schemas, creates generic placeholders to prevent parser failures.
 *
 * This runs during config evaluation, before @hey-api/openapi-ts parses the specs.
 */
function resolveMissingRefs(spec: any): {
  fixed: number
  unknown: Array<string>
} {
  if (!spec.components?.schemas) return { fixed: 0, unknown: [] }

  const allRefs = findAllRefs(spec)
  const existingSchemas = new Set(Object.keys(spec.components.schemas))
  const missingRefs = [...allRefs].filter((ref) => !existingSchemas.has(ref))

  let fixed = 0
  const unknown: Array<string> = []

  for (const missingRef of missingRefs) {
    if (!spec.components.schemas) spec.components.schemas = {}

    if (KNOWN_MISSING_SCHEMAS[missingRef]) {
      // Use known schema definition for proper TypeScript types
      spec.components.schemas[missingRef] = KNOWN_MISSING_SCHEMAS[missingRef]
      fixed++
    } else {
      // Create generic placeholder to prevent parser failure
      // This will generate { [key: string]: unknown } TypeScript types
      spec.components.schemas[missingRef] = {
        type: 'object',
        description: `Schema referenced but not defined by fal.ai (missing from source OpenAPI spec)`,
        additionalProperties: true,
      }
      unknown.push(missingRef)
    }
  }

  return { fixed, unknown }
}

function getFalCategoryFiles(): Array<string> {
  const categoryDir = join(__dirname, 'json')
  const files = readdirSync(categoryDir)
    .filter((file) => file.endsWith('.json'))
    .sort()
  return files
}

function getFalModelOpenApiObjects(filename: string): Array<object> {
  const fileContents = readFileSync(join(__dirname, 'json', filename), 'utf8')
  const json = JSON.parse(fileContents)

  let totalFixed = 0
  const allUnknown = new Set<string>()

  const specs = json.models.map((model: any) => {
    const spec = model.openapi
    const { fixed, unknown } = resolveMissingRefs(spec)

    totalFixed += fixed
    unknown.forEach((u) => allUnknown.add(u))

    return spec
  })

  // Log summary if any refs were fixed
  if (totalFixed > 0 || allUnknown.size > 0) {
    console.log(`[${filename}] Resolved ${totalFixed} known missing refs`)
    if (allUnknown.size > 0) {
      console.warn(
        `[${filename}] Created placeholders for unknown refs: ${[...allUnknown].join(', ')}`,
      )
    }
  }

  return specs
}

export default [
  ...getFalCategoryFiles().map((file) => ({
    input: getFalModelOpenApiObjects(file),
    output: {
      path: `./src/generated/${file.replace(/fal\.models\.([^.]+)\.json/, '$1')}`,
      indexFile: false,
      postProcess: ['prettier'],
    },
    plugins: ['@hey-api/typescript', { name: 'zod', metadata: true }],
    parser: {
      filters: {
        schemas: {
          include: '/Input$|Output$|^Post.*Data$/',
        },
        operations: {
          include: ['/post .*/'],
          exclude: ['/get .*/'],
        },
        orphans: false,
      },
    },
  })),
]
