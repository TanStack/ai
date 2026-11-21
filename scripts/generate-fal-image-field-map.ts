/**
 * Generates the fal image-conditioning field-override map from the
 * `EndpointTypeMap` types shipped with `@fal-ai/client`.
 *
 * fal endpoints use inconsistent field names for image-conditioned
 * generation (`image_url` vs `image_urls` vs `first_frame_url` vs
 * `mask_image_url`, ...). The runtime mapper in
 * `packages/ai-fal/src/image/image-inputs.ts` applies a default
 * field per input role; this script walks every endpoint's input type with
 * the TypeScript checker and records, per role, the field the endpoint
 * actually accepts whenever it differs from that default. Endpoints that
 * match the defaults (the vast majority) are omitted, keeping the shipped
 * artifact small.
 *
 * The emitted file type-checks each recorded field name against
 * `EndpointTypeMap` via `satisfies` (a type-only import, erased at runtime),
 * so a fal SDK bump that renames a field fails `tsc` until this script is
 * re-run. A unit test compares the recorded endpoints.d.ts hash against the
 * installed SDK to catch staleness.
 *
 * The same run also writes the mesh input field map
 * (`packages/ai-fal/src/model3d/generated/mesh-field-overrides.ts`). It lists
 * every 3D endpoint that takes an existing mesh, and the field name for that
 * mesh (`model_url`, `mesh_url` or `input_file_url`).
 *
 * Usage:
 *   pnpm tsx scripts/generate-fal-image-field-map.ts          # regenerate
 *   pnpm tsx scripts/generate-fal-image-field-map.ts --check  # CI staleness check
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
// TypeScript 7 does not ship the JS Compiler API, so use the TS 6 shim.
import ts from '@typescript/typescript6'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const FAL_PKG = resolve(ROOT, 'packages/ai-fal')
const ENDPOINTS_DTS = resolve(
  FAL_PKG,
  'node_modules/@fal-ai/client/src/types/endpoints.d.ts',
)
const CLIENT_PKG_JSON = resolve(
  FAL_PKG,
  'node_modules/@fal-ai/client/package.json',
)
const OUT_FILE = resolve(
  FAL_PKG,
  'src/image/generated/image-field-overrides.ts',
)
const MESH_OUT_FILE = resolve(
  FAL_PKG,
  'src/model3d/generated/mesh-field-overrides.ts',
)

// ---------------------------------------------------------------------------
// Mesh input fields
// ---------------------------------------------------------------------------

/**
 * Field names that fal 3D endpoints use for an input mesh, in priority order.
 * When an endpoint has more than one, the first one wins.
 */
const MESH_FIELDS = ['model_url', 'mesh_url', 'input_file_url']

/**
 * Filter for mesh fields. A field name alone is not enough: `model_url` can
 * also mean other things (for example LoRA weights). So a field counts as a
 * mesh input only when its JSDoc in endpoints.d.ts talks about a 3D model, a
 * mesh, or a 3D file format.
 */
const MESH_DOC_PATTERN = /\b(3d|mesh|glb|gltf|obj|fbx|stl|ply)\b/i

// ---------------------------------------------------------------------------
// Role classification
// ---------------------------------------------------------------------------

/**
 * Routing roles used by the runtime mapper. `single` / `multi` cover unroled
 * source images; the rest correspond to `MediaInputRole` values.
 */
type RoleKey =
  | 'single'
  | 'multi'
  | 'mask'
  | 'control'
  | 'reference'
  | 'start'
  | 'end'

/**
 * Default field per role — must stay in sync with `DEFAULT_FIELDS` in
 * image-inputs.ts. An override is only emitted when the chosen candidate
 * differs from this default.
 */
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
 * Candidate fields per role, in priority order. The first candidate present
 * on the endpoint's input type wins. Names here are deliberately
 * conservative: only fields whose semantics unambiguously match the role.
 *
 * `start` / `end` are only consumed by the video mapper (the image mapper
 * treats those roles as plain sources), so they are only computed for
 * endpoints whose output contains video — that's also why `image_url` is a
 * valid `start` candidate: on image-to-video endpoints the source image IS
 * the start frame.
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

/** Roles only meaningful for endpoints that produce video. */
const VIDEO_ONLY_ROLES = new Set<RoleKey>(['start', 'end'])

/**
 * Fields that take an array of images. The runtime mapper wraps/refuses
 * values based on this same set (`LIST_FIELDS` in image-inputs.ts); the
 * generator asserts the actual types agree so the two never drift.
 */
const LIST_FIELDS = new Set([
  'image_urls',
  'input_image_urls',
  'ref_image_urls',
  'reference_image_urls',
])

// ---------------------------------------------------------------------------
// Type extraction
// ---------------------------------------------------------------------------

interface EndpointFields {
  /** All input field names for this endpoint */
  fields: Set<string>
  /** Field name -> whether the field accepts an array */
  isList: Map<string, boolean>
  /** Whether the endpoint's output contains video */
  producesVideo: boolean
  /** Mesh field name -> its JSDoc text (only for names in MESH_FIELDS) */
  meshFieldDocs: Map<string, string>
}

function extractEndpointInputs(): Map<string, EndpointFields> {
  const program = ts.createProgram([ENDPOINTS_DTS], {
    target: ts.ScriptTarget.ES2022,
    skipLibCheck: true,
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(ENDPOINTS_DTS)
  if (!source) throw new Error(`Could not load ${ENDPOINTS_DTS}`)

  let mapType: ts.Type | undefined
  source.forEachChild((node) => {
    if (
      ts.isTypeAliasDeclaration(node) &&
      node.name.text === 'EndpointTypeMap'
    ) {
      mapType = checker.getTypeAtLocation(node.name)
    }
  })
  if (!mapType) throw new Error('EndpointTypeMap not found in endpoints.d.ts')

  const endpoints = new Map<string, EndpointFields>()
  for (const endpoint of mapType.getProperties()) {
    const endpointType = checker.getTypeOfSymbol(endpoint)
    const inputSymbol = endpointType.getProperty('input')
    if (!inputSymbol) continue
    const inputType = checker.getTypeOfSymbol(inputSymbol)

    const fields = new Set<string>()
    const isList = new Map<string, boolean>()
    const meshFieldDocs = new Map<string, string>()
    for (const field of inputType.getProperties()) {
      const name = field.getName()
      fields.add(name)
      const fieldType = checker.getTypeOfSymbol(field)
      isList.set(name, typeAcceptsArray(checker, fieldType))
      if (MESH_FIELDS.includes(name)) {
        meshFieldDocs.set(
          name,
          ts.displayPartsToString(field.getDocumentationComment(checker)),
        )
      }
    }

    const outputSymbol = endpointType.getProperty('output')
    const producesVideo = outputSymbol
      ? checker
          .getTypeOfSymbol(outputSymbol)
          .getProperties()
          .some((p) => p.getName() === 'video' || p.getName() === 'videos')
      : false

    endpoints.set(endpoint.getName(), {
      fields,
      isList,
      producesVideo,
      meshFieldDocs,
    })
  }
  return endpoints
}

function typeAcceptsArray(checker: ts.TypeChecker, type: ts.Type): boolean {
  const parts = type.isUnion() ? type.types : [type]
  return parts.some((part) => checker.isArrayLikeType(part))
}

// ---------------------------------------------------------------------------
// Override computation
// ---------------------------------------------------------------------------

const ROLE_ORDER: Array<RoleKey> = [
  'single',
  'multi',
  'mask',
  'control',
  'reference',
  'start',
  'end',
]

function computeOverrides(
  endpoints: Map<string, EndpointFields>,
): Map<string, Partial<Record<RoleKey, string>>> {
  const overrides = new Map<string, Partial<Record<RoleKey, string>>>()

  for (const [endpointId, { fields, isList, producesVideo }] of endpoints) {
    const entry: Partial<Record<RoleKey, string>> = {}
    for (const role of ROLE_ORDER) {
      if (VIDEO_ONLY_ROLES.has(role) && !producesVideo) continue
      const chosen = CANDIDATES[role].find((candidate) => fields.has(candidate))
      if (!chosen) continue

      // Arity sanity check: the runtime mapper decides array-wrapping from
      // the static LIST_FIELDS set, so the actual type must agree. Run this
      // for default-selected fields too, otherwise a default field's type
      // could drift silently.
      const actualIsList = isList.get(chosen) ?? false
      const assumedIsList = LIST_FIELDS.has(chosen)
      if (actualIsList !== assumedIsList) {
        throw new Error(
          `Arity mismatch for ${endpointId}.${chosen}: type says ` +
            `${actualIsList ? 'array' : 'scalar'} but LIST_FIELDS assumes ` +
            `${assumedIsList ? 'array' : 'scalar'}. Update LIST_FIELDS here ` +
            `and LIST_FIELDS in image-inputs.ts.`,
        )
      }
      if (chosen === DEFAULTS[role]) continue
      entry[role] = chosen
    }
    if (Object.keys(entry).length > 0) overrides.set(endpointId, entry)
  }
  return overrides
}

/**
 * Picks, per endpoint, the field that takes an input mesh. Only fields that
 * pass the MESH_DOC_PATTERN filter count. Endpoints with no mesh field are
 * left out.
 */
function computeMeshFields(endpoints: Map<string, EndpointFields>) {
  const meshFields = new Map<string, string>()
  for (const [endpointId, { meshFieldDocs }] of endpoints) {
    const chosen = MESH_FIELDS.find((field) => {
      const doc = meshFieldDocs.get(field)
      return doc !== undefined && MESH_DOC_PATTERN.test(doc)
    })
    if (chosen) meshFields.set(endpointId, chosen)
  }
  return meshFields
}

// ---------------------------------------------------------------------------
// Emission
// ---------------------------------------------------------------------------

/** The SDK version and endpoints.d.ts hash that both generated files stamp. */
interface SdkStamp {
  clientVersion: string
  dtsHash: string
}

function readSdkStamp() {
  const clientVersion = (
    JSON.parse(readFileSync(CLIENT_PKG_JSON, 'utf8')) as { version: string }
  ).version
  const dtsHash = createHash('sha256')
    .update(readFileSync(ENDPOINTS_DTS))
    .digest('hex')
  return { clientVersion, dtsHash }
}

function render(
  overrides: Map<string, Partial<Record<RoleKey, string>>>,
  { clientVersion, dtsHash }: SdkStamp,
): string {
  const sortedIds = [...overrides.keys()].sort()
  const entries = sortedIds
    .map((id) => {
      const entry = overrides.get(id)!
      const pairs = ROLE_ORDER.filter((role) => entry[role]).map(
        (role) => `${role}: '${entry[role]}'`,
      )
      return `  '${id}': { ${pairs.join(', ')} },`
    })
    .join('\n')

  // Union of every field name the runtime mapper may emit: the per-role
  // defaults plus every field referenced by an override.
  const fieldNames = new Set<string>(Object.values(DEFAULTS))
  for (const entry of overrides.values()) {
    for (const field of Object.values(entry)) fieldNames.add(field)
  }
  const fieldNameUnion = [...fieldNames]
    .sort()
    .map((name) => `  | '${name}'`)
    .join('\n')

  return `/* eslint-disable */
// ---------------------------------------------------------------------------
// AUTO-GENERATED — do not edit by hand.
//
// Generated from @fal-ai/client@${clientVersion} EndpointTypeMap by
// scripts/generate-fal-image-field-map.ts. Regenerate after bumping
// @fal-ai/client:
//
//   pnpm tsx scripts/generate-fal-image-field-map.ts
//
// Maps fal endpoint ids to the image-conditioning input fields they accept
// whenever those differ from the defaults in image-inputs.ts. Endpoints
// matching the defaults are omitted. The \`satisfies\` clause below checks
// every field name against the SDK's endpoint input types at compile time
// (type-only import — nothing from endpoints.d.ts is shipped at runtime).
// ---------------------------------------------------------------------------
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'

/** sha256 of the endpoints.d.ts this file was generated from. */
export const FAL_ENDPOINTS_DTS_SHA256 =
  '${dtsHash}'

/** Every input field name the image-input mappers may emit. */
export type FalImageFieldName =
${fieldNameUnion}

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

function renderMesh(
  meshFields: Map<string, string>,
  { clientVersion, dtsHash }: SdkStamp,
) {
  const sortedIds = [...meshFields.keys()].sort()
  const entries = sortedIds
    .map((id) => `  '${id}': '${meshFields.get(id)}',`)
    .join('\n')
  const fieldNameUnion = MESH_FIELDS.map((name) => `'${name}'`).join(' | ')

  return `/* eslint-disable */
// ---------------------------------------------------------------------------
// AUTO-GENERATED. Do not edit by hand.
//
// Generated from @fal-ai/client@${clientVersion} EndpointTypeMap by
// scripts/generate-fal-image-field-map.ts. Regenerate after bumping
// @fal-ai/client:
//
//   pnpm tsx scripts/generate-fal-image-field-map.ts
//
// Maps every fal 3D endpoint that takes an existing mesh to the input field
// for that mesh. Endpoints with no mesh input are not listed. The
// \`satisfies\` clause below checks every field name against the SDK's
// endpoint input types at compile time (type-only import, so nothing from
// endpoints.d.ts ships at runtime).
// ---------------------------------------------------------------------------
import type { EndpointTypeMap } from '@fal-ai/client/endpoints'

/** sha256 of the endpoints.d.ts this file was generated from. */
export const FAL_MESH_ENDPOINTS_DTS_SHA256 =
  '${dtsHash}'

/** Every input field name that fal 3D endpoints use for an input mesh. */
export type FalMeshFieldName = ${fieldNameUnion}

/** fal endpoint id -> the input field that takes the mesh. */
export const FAL_MESH_FIELD_MAP = {
${entries}
} as const satisfies {
  [K in keyof EndpointTypeMap]?: Extract<
    keyof EndpointTypeMap[K]['input'],
    FalMeshFieldName
  >
}
`
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const endpoints = extractEndpointInputs()
const stamp = readSdkStamp()
const overrides = computeOverrides(endpoints)
const meshFields = computeMeshFields(endpoints)
const outputs = [
  { file: OUT_FILE, content: render(overrides, stamp) },
  { file: MESH_OUT_FILE, content: renderMesh(meshFields, stamp) },
]

if (process.argv.includes('--check')) {
  const staleFiles = outputs.filter(
    ({ file, content }) =>
      !existsSync(file) || readFileSync(file, 'utf8') !== content,
  )
  if (staleFiles.length > 0) {
    for (const { file } of staleFiles) {
      console.error(
        `${basename(file)} is stale. Run: pnpm tsx scripts/generate-fal-image-field-map.ts`,
      )
    }
    process.exit(1)
  }
  console.log(
    'image-field-overrides.ts and mesh-field-overrides.ts are up to date.',
  )
} else {
  for (const { file, content } of outputs) {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, content)
  }
  console.log(
    `Wrote ${overrides.size} endpoint overrides (of ${endpoints.size} endpoints) to ${OUT_FILE}`,
  )
  console.log(`Wrote ${meshFields.size} mesh endpoints to ${MESH_OUT_FILE}`)
}
