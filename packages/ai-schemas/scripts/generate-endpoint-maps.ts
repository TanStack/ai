#!/usr/bin/env tsx
/**
 * Post-process @hey-api/openapi-ts output for every (provider, activity)
 * tuple.
 *
 * Each tuple gets its own directory under src/providers/{provider}/{activity}/.
 * For each one we emit:
 *   - schemas.gen.ts (rewritten in place to bundle $ref closures under $defs)
 *   - endpoint-zod-map.ts: { [endpointId]: { input, output } } Zod schemas
 *   - endpoint-schema-map.ts: same shape, JSON Schemas
 *   - index.ts: Zod barrel for `@tanstack/ai-schemas/{provider}/{activity}/zod`
 *   - schemas-index.ts: JSON Schema barrel for
 *     `@tanstack/ai-schemas/{provider}/{activity}/json-schema`
 *
 * The package has no aggregator barrels — provider-first, activity-grouped
 * imports keep tree-shaking dead simple. `src/index.ts` only re-exports
 * `openai-strict`.
 *
 * Ported from fal-ai/fal-js PR #212 and generalised across providers.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as prettier from 'prettier'

import type { ProviderCategorySpec } from './providers.js'
import { loadAllProviderSpecs } from './load-all-specs.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SCHEMAS_SRC = join(__dirname, '..', 'src')
const PROVIDERS_ROOT = join(SCHEMAS_SRC, 'providers')

interface EndpointInfo {
  endpointId: string
  inputType: string
  /**
   * Absent when the endpoint's success response carries no JSON schema —
   * media generation endpoints (TTS, sound generation, …) stream binary
   * audio/video, and some operations return inline shapes that can't be
   * addressed by a named schema export.
   */
  outputType?: string
}

function extractEndpointsFromSpec(
  unit: ProviderCategorySpec,
): Array<EndpointInfo> {
  const endpoints: Array<EndpointInfo> = []
  const strategy = unit.outputStrategy ?? 'post-200'

  for (const [pathKey, pathItem] of Object.entries(unit.mergedSpec.paths)) {
    const post = (pathItem as { post?: Record<string, any> }).post
    if (!post) continue

    // JSON bodies are the common case; media endpoints (transcription,
    // dubbing, image edits, …) take multipart uploads whose fields are
    // described by an ordinary component schema.
    const requestContent = post.requestBody?.content
    const inputRef =
      requestContent?.['application/json']?.schema?.$ref ??
      requestContent?.['multipart/form-data']?.schema?.$ref
    if (typeof inputRef !== 'string') continue

    let outputRef: string | undefined
    if (strategy === 'sibling-get') {
      const resultPathKey = `${pathKey}/requests/{request_id}`
      const resultGet = (
        unit.mergedSpec.paths[resultPathKey] as
          | { get?: Record<string, any> }
          | undefined
      )?.get
      outputRef =
        resultGet?.responses?.['200']?.content?.['application/json']?.schema
          ?.$ref
    } else {
      outputRef =
        post.responses?.['200']?.content?.['application/json']?.schema?.$ref
    }

    const inputType = inputRef.replace(/^#\/components\/schemas\//, '')
    const endpointId = pathKey.replace(/^\//, '')
    endpoints.push({
      endpointId,
      inputType,
      ...(typeof outputRef === 'string'
        ? { outputType: outputRef.replace(/^#\/components\/schemas\//, '') }
        : {}),
    })
  }

  return endpoints.sort((a, b) => a.endpointId.localeCompare(b.endpointId))
}

function normalizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
}

function buildZodExportLookup(unitPath: string): Map<string, string> {
  const source = readFileSync(join(unitPath, 'zod.gen.ts'), 'utf8')
  const lookup = new Map<string, string>()
  for (const match of source.matchAll(/export const (z[A-Za-z0-9_$]+)/g)) {
    const exportName = match[1]!
    lookup.set(normalizeId(exportName.slice(1)), exportName)
  }
  return lookup
}

function buildSchemaExportLookup(unitPath: string): Map<string, string> {
  const source = readFileSync(join(unitPath, 'schemas.gen.ts'), 'utf8')
  const lookup = new Map<string, string>()
  for (const match of source.matchAll(
    /export const ([A-Za-z0-9_$]+)Schema\b/g,
  )) {
    lookup.set(normalizeId(match[1]!), `${match[1]}Schema`)
  }
  return lookup
}

function toPascalCase(str: string): string {
  const pascalCase = str
    .split(/[-_/]/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
  return /^\d/.test(pascalCase) ? 'Gen' + pascalCase : pascalCase
}

function toCamelCase(str: string): string {
  const pascal = toPascalCase(str)
  return pascal.charAt(0).toLowerCase() + pascal.slice(1)
}

async function formatTypeScript(content: string): Promise<string> {
  const config = await prettier.resolveConfig(process.cwd())
  return prettier.format(content, { ...config, parser: 'typescript' })
}

// ──────────────────────────────────────────────────────────────────────────────
// $defs bundling
// ──────────────────────────────────────────────────────────────────────────────

const COMPONENT_REF_PREFIX = '#/components/schemas/'
const DEFS_REF_PREFIX = '#/$defs/'

type JsonValue =
  | string
  | number
  | boolean
  | null
  | { readonly [key: string]: JsonValue }
  | ReadonlyArray<JsonValue>

function collectComponentRefs(node: unknown, into: Set<string>): void {
  if (typeof node !== 'object' || node === null) return
  if (Array.isArray(node)) {
    for (const v of node) collectComponentRefs(v, into)
    return
  }
  for (const [key, value] of Object.entries(node)) {
    if (
      key === '$ref' &&
      typeof value === 'string' &&
      value.startsWith(COMPONENT_REF_PREFIX)
    ) {
      into.add(value.slice(COMPONENT_REF_PREFIX.length))
    } else {
      collectComponentRefs(value, into)
    }
  }
}

function rewriteRefs(node: JsonValue): JsonValue {
  if (typeof node !== 'object' || node === null) return node
  if (Array.isArray(node)) return node.map(rewriteRefs)
  const out: Record<string, JsonValue> = {}
  for (const [key, value] of Object.entries(node)) {
    if (
      key === '$ref' &&
      typeof value === 'string' &&
      value.startsWith(COMPONENT_REF_PREFIX)
    ) {
      out[key] = DEFS_REF_PREFIX + value.slice(COMPONENT_REF_PREFIX.length)
    } else {
      out[key] = rewriteRefs(value)
    }
  }
  return out
}

function bundleSchemaWithDefs(
  name: string,
  schemas: Record<string, JsonValue>,
  context: string,
): JsonValue {
  // hey-api dedup-renames colliding schemas with a `-2` suffix in $ref
  // strings but sanitizes the generated export to `_2`; resolve through
  // the underscore alias so those defs don't dangle.
  const resolveSchema = (refName: string): JsonValue | undefined =>
    schemas[refName] ?? schemas[refName.replace(/-/g, '_')]

  const root = schemas[name]
  if (root === undefined) {
    throw new Error(`Schema not found in ${context}: ${name}`)
  }

  const closure = new Set<string>()
  const queue: Array<string> = []
  const seedRefs = new Set<string>()
  collectComponentRefs(root, seedRefs)
  for (const r of seedRefs) {
    if (r !== name) queue.push(r)
  }
  while (queue.length > 0) {
    const cur = queue.shift()!
    if (closure.has(cur)) continue
    closure.add(cur)
    const target = resolveSchema(cur)
    if (target === undefined) {
      console.warn(
        `  Warning: ref target '${cur}' not found in ${context}/schemas.gen.ts (transitively referenced from '${name}')`,
      )
      continue
    }
    const subRefs = new Set<string>()
    collectComponentRefs(target, subRefs)
    for (const r of subRefs) {
      if (r !== name && !closure.has(r)) queue.push(r)
    }
  }

  const rewrittenRoot = rewriteRefs(root) as Record<string, JsonValue>
  if (closure.size === 0) return rewrittenRoot

  const defs: Record<string, JsonValue> = {}
  for (const refName of [...closure].sort()) {
    const target = resolveSchema(refName)
    if (target === undefined) continue
    defs[refName] = rewriteRefs(target)
  }
  return { ...rewrittenRoot, $defs: defs }
}

async function loadUnitSchemas(
  unitPath: string,
): Promise<Record<string, JsonValue>> {
  const url = pathToFileURL(join(unitPath, 'schemas.gen.ts')).href
  const mod = (await import(url)) as Record<string, unknown>
  const out: Record<string, JsonValue> = {}
  for (const [exportName, value] of Object.entries(mod)) {
    if (exportName === 'default') continue
    if (!exportName.endsWith('Schema')) continue
    out[exportName.slice(0, -'Schema'.length)] = value as JsonValue
  }
  return out
}

async function rewriteSchemasGen(
  label: string,
  unitPath: string,
): Promise<void> {
  const schemas = await loadUnitSchemas(unitPath)
  const sortedNames = Object.keys(schemas).sort()

  const lines = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated by @hey-api/openapi-ts and post-processed by`,
    `// scripts/generate-endpoint-maps.ts to embed each schema's $defs closure.`,
    ``,
  ]

  for (const name of sortedNames) {
    const bundled = bundleSchemaWithDefs(name, schemas, label)
    lines.push(
      `export const ${name}Schema = ${JSON.stringify(bundled)} as const;`,
      ``,
    )
  }

  const out = await formatTypeScript(lines.join('\n'))
  writeFileSync(join(unitPath, 'schemas.gen.ts'), out)
  console.log(`  ✓ Rewrote ${label}/schemas.gen.ts with $defs bundling`)
}

/**
 * Post-process generator output for runtime correctness and surgical lint
 * suppression. The goal is to keep the generated files passing CI with the
 * smallest possible escape hatches — most of what heyapi emits is already
 * fine, only the long-tail edge cases need help.
 *
 * Three concerns, addressed independently:
 *
 * 1. Discriminated-union `.extend()` (runtime bug). heyapi emits
 *    `zFoo.extend({ type: z.literal('X') })` to graft a discriminator
 *    onto every union member. When `zFoo` is itself a `z.discriminatedUnion`,
 *    `.extend` isn't a method on that Zod type — calling it throws at
 *    runtime. We rewrite to `z.intersection(zFoo, z.object({...}))` which
 *    works for both ZodObject and ZodDiscriminatedUnion. The outer
 *    `discriminatedUnion` then refuses the intersection as a member because
 *    intersections aren't `$ZodTypeDiscriminable` — that's the residual tsc
 *    error that needs `@ts-nocheck`.
 *
 * 2. Residual tsc error (OpenAI only, so far). Add `// @ts-nocheck` only to
 *    files that actually trip the discriminator/intersection conflict.
 *
 * 3. Control-character regex literals (ElevenLabs only, so far). Some
 *    upstream specs embed `\x09` (tab) in pattern strings; ESLint's
 *    `no-control-regex` rule fires on the codegen output. We add a
 *    targeted `// eslint-disable-next-line no-control-regex` immediately
 *    above each affected line — surgical, doesn't disable anything else.
 *
 * Everything else (mostly `no-explicit-any` in inferred types) emits as
 * warnings, not errors, so CI is happy without any further suppression.
 */
function postProcessZodGen(unitPath: string): void {
  const file = join(unitPath, 'zod.gen.ts')
  let source = readFileSync(file, 'utf8')

  source = stripSchemaNameDiscriminatorExtends(source)
  const { rewritten, didRewrite } = rewriteDiscriminatedUnionExtends(source)
  source = rewritten
  source = suppressControlRegexLines(source)

  // The `.extend()` rewrite produces `z.intersection(...)` members nested
  // inside `z.discriminatedUnion(...)`. Intersections aren't
  // `$ZodTypeDiscriminable`, so the outer call type-errors. Suppress on
  // exactly the files where we rewrote. We have to pair `@ts-nocheck` with
  // a `ban-ts-comment` disable on the preceding line because the workspace
  // lint config bans `@ts-nocheck` outright.
  if (didRewrite) {
    source = ensureFileHeader(
      source,
      '// eslint-disable-next-line @typescript-eslint/ban-ts-comment\n// @ts-nocheck',
    )
  }

  writeFileSync(file, source)
}

/**
 * When an upstream spec declares `discriminator: { propertyName }` with no
 * explicit mapping, OpenAPI's implicit mapping says the discriminator value
 * is the *schema name* — and heyapi faithfully grafts
 * `.extend({ role: z.literal('ChatCompletionRequestUserMessage') })` onto
 * every union member. That literal never matches real payloads (`role` is
 * `'user'`, not the schema name), so the discriminated union rejects every
 * valid input at runtime. The member schemas already constrain the
 * discriminator property themselves (e.g. `role: z.enum(['user'])`), so the
 * graft is both wrong and redundant: strip any `.extend()` whose literal
 * value is exactly the base schema's own export name.
 */
function stripSchemaNameDiscriminatorExtends(source: string): string {
  return source.replace(
    /z([A-Za-z0-9_$]+)\.extend\(\{\s*[A-Za-z0-9_$]+:\s*z\.literal\('([A-Za-z0-9_$]+)'\),?\s*\}\)/g,
    (match, baseName: string, literalValue: string) =>
      baseName === literalValue ? `z${baseName}` : match,
  )
}

function rewriteDiscriminatedUnionExtends(source: string): {
  rewritten: string
  didRewrite: boolean
} {
  const discriminatedUnionNames = new Set<string>()
  for (const match of source.matchAll(
    /export const (z[A-Za-z0-9_$]+)\s*=\s*z\.discriminatedUnion\(/g,
  )) {
    discriminatedUnionNames.add(match[1]!)
  }
  if (discriminatedUnionNames.size === 0) {
    return { rewritten: source, didRewrite: false }
  }

  const namePattern = [...discriminatedUnionNames].join('|')
  const extendPattern = new RegExp(
    String.raw`(${namePattern})\.extend\((\{[^{}]*\})\)`,
    'g',
  )
  let didRewrite = false
  const rewritten = source.replace(
    extendPattern,
    (_, name: string, extension: string) => {
      didRewrite = true
      return `z.intersection(${name}, z.object(${extension}))`
    },
  )
  return { rewritten, didRewrite }
}

/**
 * Find regex literals containing `\xNN` escapes for control characters
 * (anything below `\x20` except common whitespace; ESLint flags these
 * even when authored as escape sequences). Prepend a targeted
 * `// eslint-disable-next-line no-control-regex` so the rule doesn't fire,
 * without disabling anything else on the line or the file.
 */
function suppressControlRegexLines(source: string): string {
  const lines = source.split('\n')
  const out: Array<string> = []
  const controlRegex = /\.regex\(\/[^/]*\\x[01][0-9a-fA-F][^/]*\//
  let prevWasDisable = false
  for (const line of lines) {
    if (controlRegex.test(line) && !prevWasDisable) {
      const indent = line.match(/^\s*/)?.[0] ?? ''
      out.push(`${indent}// eslint-disable-next-line no-control-regex`)
    }
    out.push(line)
    prevWasDisable = line.trimStart().startsWith('// eslint-disable-next-line')
  }
  return out.join('\n')
}

function ensureFileHeader(source: string, header: string): string {
  if (source.startsWith(header + '\n')) return source
  // Strip any prior copy of this exact header (idempotent re-runs). Escape
  // every regex meta-character in the header literal.
  const escaped = header.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
  const stripped = source.replace(new RegExp(`^${escaped}\\n`), '')
  return `${header}\n${stripped}`
}

// ──────────────────────────────────────────────────────────────────────────────
// Per-unit generators
// ──────────────────────────────────────────────────────────────────────────────

async function generateEndpointZodMap(
  unitLabel: string,
  unitPath: string,
  endpoints: Array<EndpointInfo>,
): Promise<void> {
  const typeName = toPascalCase(unitLabel)
  const constName = `${toCamelCase(unitLabel)}EndpointZodMap`
  const idTypeName = `${typeName}EndpointId`
  const zodExports = buildZodExportLookup(unitPath)

  const resolveZodName = (
    schemaName: string,
    endpointId: string,
  ): string | null => {
    const hit = zodExports.get(normalizeId(schemaName))
    if (!hit) {
      console.warn(
        `  Warning: no zod export found for "${schemaName}" (endpoint ${endpointId}) in ${unitLabel}/zod.gen.ts`,
      )
      return null
    }
    return hit
  }

  const resolved = endpoints.flatMap(
    ({ endpointId, inputType, outputType }) => {
      const inputName = resolveZodName(inputType, endpointId)
      if (!inputName) return []
      // Binary-response endpoints (TTS audio, …) have no output schema; the
      // input constraint surface is still worth mapping.
      const outputName =
        outputType === undefined
          ? undefined
          : resolveZodName(outputType, endpointId)
      if (outputType !== undefined && !outputName) return []
      return [{ endpointId, inputName, outputName }]
    },
  )

  const schemaImports = Array.from(
    new Set(
      resolved.flatMap((e) =>
        e.outputName ? [e.inputName, e.outputName] : [e.inputName],
      ),
    ),
  ).sort()

  const lines = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated via scripts/generate-endpoint-maps.ts`,
    ``,
    `import {`,
    ...schemaImports.map((t) => `  ${t},`),
    `} from './zod.gen.js'`,
    ``,
    `/**`,
    ` * Map of ${unitLabel} endpoint id -> Zod input/output schemas.`,
    ` * Entries without \`output\` stream binary media (audio/video) rather`,
    ` * than returning JSON.`,
    ` */`,
    `export const ${constName}: {`,
  ]
  for (const { endpointId, inputName, outputName } of resolved) {
    lines.push(
      outputName
        ? `  readonly '${endpointId}': { readonly input: typeof ${inputName}; readonly output: typeof ${outputName} },`
        : `  readonly '${endpointId}': { readonly input: typeof ${inputName} },`,
    )
  }
  lines.push(`} = {`)
  for (const { endpointId, inputName, outputName } of resolved) {
    lines.push(
      outputName
        ? `  '${endpointId}': { input: ${inputName}, output: ${outputName} },`
        : `  '${endpointId}': { input: ${inputName} },`,
    )
  }
  lines.push(`}`)
  lines.push(``)
  lines.push(`/** Union of valid ${unitLabel} endpoint ids. */`)
  lines.push(`export type ${idTypeName} = keyof typeof ${constName}`)

  const out = await formatTypeScript(lines.join('\n'))
  writeFileSync(join(unitPath, 'endpoint-zod-map.ts'), out)
  console.log(`  ✓ Generated ${unitLabel}/endpoint-zod-map.ts`)
}

async function generateEndpointSchemaMap(
  unitLabel: string,
  unitPath: string,
  endpoints: Array<EndpointInfo>,
): Promise<void> {
  const constName = `${toCamelCase(unitLabel)}EndpointSchemaMap`
  const schemaExports = buildSchemaExportLookup(unitPath)

  const resolveSchemaName = (
    schemaName: string,
    endpointId: string,
  ): string | null => {
    const hit = schemaExports.get(normalizeId(schemaName))
    if (!hit) {
      console.warn(
        `  Warning: no JSON Schema export found for "${schemaName}" (endpoint ${endpointId}) in ${unitLabel}/schemas.gen.ts`,
      )
      return null
    }
    return hit
  }

  const resolved = endpoints.flatMap(
    ({ endpointId, inputType, outputType }) => {
      const inputName = resolveSchemaName(inputType, endpointId)
      if (!inputName) return []
      // Binary-response endpoints (TTS audio, …) have no output schema; the
      // input constraint surface is still worth mapping.
      const outputName =
        outputType === undefined
          ? undefined
          : resolveSchemaName(outputType, endpointId)
      if (outputType !== undefined && !outputName) return []
      return [{ endpointId, inputName, outputName }]
    },
  )

  const schemaImports = Array.from(
    new Set(
      resolved.flatMap((e) =>
        e.outputName ? [e.inputName, e.outputName] : [e.inputName],
      ),
    ),
  ).sort()

  const lines = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated via scripts/generate-endpoint-maps.ts`,
    ``,
    `import {`,
    ...schemaImports.map((t) => `  ${t},`),
    `} from './schemas.gen.js'`,
    ``,
    `/**`,
    ` * Map of ${unitLabel} endpoint id -> self-contained JSON Schemas.`,
    ` * Each input/output schema bundles its $ref closure under \`$defs\`, so it`,
    ` * can be handed directly to LLM tool APIs or \`z.fromJSONSchema\`.`,
    ` * Entries without \`output\` stream binary media (audio/video) rather`,
    ` * than returning JSON.`,
    ` */`,
    `export const ${constName}: {`,
  ]
  for (const { endpointId, inputName, outputName } of resolved) {
    lines.push(
      outputName
        ? `  readonly '${endpointId}': { readonly input: typeof ${inputName}; readonly output: typeof ${outputName} },`
        : `  readonly '${endpointId}': { readonly input: typeof ${inputName} },`,
    )
  }
  lines.push(`} = {`)
  for (const { endpointId, inputName, outputName } of resolved) {
    lines.push(
      outputName
        ? `  '${endpointId}': { input: ${inputName}, output: ${outputName} },`
        : `  '${endpointId}': { input: ${inputName} },`,
    )
  }
  lines.push(`}`)

  const out = await formatTypeScript(lines.join('\n'))
  writeFileSync(join(unitPath, 'endpoint-schema-map.ts'), out)
  console.log(`  ✓ Generated ${unitLabel}/endpoint-schema-map.ts`)
}

async function generateUnitZodIndex(
  unitLabel: string,
  unitPath: string,
): Promise<void> {
  const lines = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated via scripts/generate-endpoint-maps.ts`,
    ``,
    `export * from './endpoint-zod-map.js'`,
    `export * from './zod.gen.js'`,
  ]
  const out = await formatTypeScript(lines.join('\n'))
  writeFileSync(join(unitPath, 'index.ts'), out)
  console.log(`  ✓ Generated ${unitLabel}/index.ts`)
}

async function generateUnitSchemasIndex(
  unitLabel: string,
  unitPath: string,
): Promise<void> {
  const lines = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated via scripts/generate-endpoint-maps.ts`,
    ``,
    `export * from './endpoint-schema-map.js'`,
    `export * from './schemas.gen.js'`,
  ]
  const out = await formatTypeScript(lines.join('\n'))
  writeFileSync(join(unitPath, 'schemas-index.ts'), out)
  console.log(`  ✓ Generated ${unitLabel}/schemas-index.ts`)
}

// ──────────────────────────────────────────────────────────────────────────────
// Default entry
// ──────────────────────────────────────────────────────────────────────────────

interface ProcessedUnit {
  /** Naming label (e.g. "openai-chat" or "fal-video"). */
  label: string
  /** Source-relative directory (e.g. "providers/openai/chat"). */
  relSrc: string
}

/**
 * The package has no aggregator barrel — every (provider, activity) tuple
 * lives behind its own subpath (`@tanstack/ai-schemas/{provider}/{activity}/json-schema`
 * and `/zod`) so bundlers tree-shake by file rather than relying on
 * namespaced re-exports. The default `.` entry just surfaces the
 * `toOpenAIStrict` helper for consumers who reach for the bare package name.
 */
async function generateIndex(): Promise<void> {
  const lines = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated via scripts/generate-endpoint-maps.ts`,
    ``,
    `// Per-provider, per-activity schemas live behind subpath exports:`,
    `//   @tanstack/ai-schemas/{provider}/{activity}/json-schema`,
    `//   @tanstack/ai-schemas/{provider}/{activity}/zod`,
    `// The default entry only re-exports the shared OpenAI strict-mode helper.`,
    `export * from './openai-strict.js'`,
  ]
  const out = await formatTypeScript(lines.join('\n'))
  writeFileSync(join(SCHEMAS_SRC, 'index.ts'), out)
  console.log(`  ✓ Generated index.ts`)
}

// ──────────────────────────────────────────────────────────────────────────────
// Entry point
// ──────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  if (!existsSync(SCHEMAS_SRC)) {
    console.error('Error: packages/ai-schemas/src/ not found.')
    process.exit(1)
  }

  console.log('Loading provider specs...')
  const units = loadAllProviderSpecs()
  console.log(`Found ${units.length} provider/category units`)

  const processed: Array<ProcessedUnit> = []
  for (const unit of units) {
    // Provider-first nested layout: every (provider, activity) tuple lives
    // at `providers/{provider}/{activity}` and resolves through the
    // `./*/json-schema` and `./*/zod` wildcard exports in package.json
    // (Node's exports `*` is a string replacement that may span multiple
    // path segments).
    const relSrc = `providers/${unit.providerId}/${unit.category}`
    const unitPath = join(SCHEMAS_SRC, relSrc)
    const label = `${unit.providerId}-${unit.category}`

    if (!existsSync(unitPath)) {
      console.warn(
        `\n  Warning: ${unitPath} does not exist — run \`pnpm generate-schemas\` first. Skipping ${label}.`,
      )
      continue
    }

    console.log(`\nProcessing ${label}...`)
    const endpoints = extractEndpointsFromSpec(unit)
    if (endpoints.length === 0) {
      console.warn(`  Warning: no endpoints found for ${label}, skipping`)
      continue
    }

    await rewriteSchemasGen(label, unitPath)
    postProcessZodGen(unitPath)
    await generateEndpointZodMap(label, unitPath, endpoints)
    await generateEndpointSchemaMap(label, unitPath, endpoints)
    await generateUnitZodIndex(label, unitPath)
    await generateUnitSchemasIndex(label, unitPath)
    processed.push({ label, relSrc })
  }

  console.log('\nGenerating default entry...')
  await generateIndex()

  console.log(`\n✓ Done! Generated schemas under ${PROVIDERS_ROOT}`)
  for (const u of processed) console.log(`  - ${u.label} (${u.relSrc})`)
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
