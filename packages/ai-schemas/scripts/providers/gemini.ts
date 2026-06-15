/**
 * Gemini provider — pulls Google's Generative Language API Discovery doc,
 * converts it to OpenAPI 3.0, and feeds the result through the standard
 * pipeline. Public, no auth required for the spec.
 *
 * The Discovery → OpenAPI converter is intentionally minimal and lives in
 * this file: it covers the subset of Discovery features Google's gen-AI API
 * actually uses (REST methods, request/response refs, primitive schemas,
 * enums, parameter shapes). It is not a general-purpose converter.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  applyTransforms,
  mergeOpenAPISpecs,
  toActivitySpecs,
  type MergedSpec,
} from '../merge-openapi-specs.js'
import type {
  Activity,
  FetchOptions,
  ProviderCategorySpec,
  ProviderConfig,
} from '../providers.js'

const GEMINI_DISCOVERY_URL =
  'https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta'

interface DiscoveryDoc {
  rootUrl?: string
  servicePath?: string
  baseUrl?: string
  schemas?: Record<string, DiscoverySchema>
  resources?: Record<string, DiscoveryResource>
  parameters?: Record<string, DiscoveryParameter>
  title?: string
  version?: string
}

interface DiscoverySchema {
  id?: string
  type?: string
  format?: string
  description?: string
  properties?: Record<string, DiscoverySchema>
  items?: DiscoverySchema
  $ref?: string
  enum?: Array<string>
  enumDescriptions?: Array<string>
  required?: Array<string>
  additionalProperties?: DiscoverySchema | boolean
}

interface DiscoveryParameter {
  type?: string
  description?: string
  location?: 'query' | 'path' | 'header'
  required?: boolean
  enum?: Array<string>
}

interface DiscoveryMethod {
  id: string
  path?: string
  flatPath?: string
  httpMethod?: string
  description?: string
  parameters?: Record<string, DiscoveryParameter>
  request?: { $ref?: string }
  response?: { $ref?: string }
  scopes?: Array<string>
}

interface DiscoveryResource {
  methods?: Record<string, DiscoveryMethod>
  resources?: Record<string, DiscoveryResource>
}

interface OpenApiSchema {
  type?: string
  format?: string
  description?: string
  properties?: Record<string, OpenApiSchema>
  items?: OpenApiSchema
  $ref?: string
  enum?: Array<string>
  required?: Array<string>
  additionalProperties?: OpenApiSchema | boolean
}

interface OpenApiParameter {
  name: string
  in: 'query' | 'path' | 'header'
  required?: boolean
  schema: OpenApiSchema
  description?: string
}

interface OpenApiOperation {
  operationId: string
  description?: string
  parameters?: Array<OpenApiParameter>
  requestBody?: {
    required?: boolean
    content: Record<string, { schema: OpenApiSchema }>
  }
  responses: Record<
    string,
    {
      description: string
      content?: Record<string, { schema: OpenApiSchema }>
    }
  >
}

interface OpenApiSpec {
  openapi: string
  info: { title: string; version: string }
  servers: Array<{ url: string }>
  paths: Record<string, Record<string, OpenApiOperation>>
  components: { schemas: Record<string, OpenApiSchema> }
}

function convertSchema(schema: DiscoverySchema): OpenApiSchema {
  if (schema.$ref) {
    return { $ref: `#/components/schemas/${schema.$ref}` }
  }
  const out: OpenApiSchema = {}
  if (schema.type) out.type = schema.type
  if (schema.format) out.format = schema.format
  if (schema.description) out.description = schema.description
  if (schema.enum) out.enum = schema.enum
  if (schema.required) out.required = schema.required
  if (schema.items) out.items = convertSchema(schema.items)
  if (schema.properties) {
    out.properties = Object.fromEntries(
      Object.entries(schema.properties).map(([name, value]) => [
        name,
        convertSchema(value),
      ]),
    )
  }
  if (schema.additionalProperties !== undefined) {
    out.additionalProperties =
      typeof schema.additionalProperties === 'boolean'
        ? schema.additionalProperties
        : convertSchema(schema.additionalProperties)
  }
  return out
}

function convertParameter(
  name: string,
  param: DiscoveryParameter,
): OpenApiParameter {
  const location = param.location ?? 'query'
  return {
    name,
    in: location,
    required: param.required ?? location === 'path',
    schema: {
      type: param.type,
      enum: param.enum,
    },
    description: param.description,
  }
}

function collectMethods(
  resources: Record<string, DiscoveryResource> | undefined,
  acc: Array<DiscoveryMethod>,
): void {
  if (!resources) return
  for (const resource of Object.values(resources)) {
    if (resource.methods) {
      for (const method of Object.values(resource.methods)) {
        acc.push(method)
      }
    }
    collectMethods(resource.resources, acc)
  }
}

function discoveryToOpenAPI(doc: DiscoveryDoc): OpenApiSpec {
  const components = {
    schemas: Object.fromEntries(
      Object.entries(doc.schemas ?? {}).map(([name, schema]) => [
        name,
        convertSchema(schema),
      ]),
    ),
  }

  const paths: OpenApiSpec['paths'] = {}
  const methods: Array<DiscoveryMethod> = []
  collectMethods(doc.resources, methods)

  for (const method of methods) {
    const path = `/${(method.flatPath ?? method.path ?? '').replace(/^\/+/, '')}`
    const httpMethod = (method.httpMethod ?? 'GET').toLowerCase()
    if (!paths[path]) paths[path] = {}

    const operation: OpenApiOperation = {
      operationId: method.id,
      description: method.description,
      parameters: Object.entries(method.parameters ?? {}).map(([n, p]) =>
        convertParameter(n, p),
      ),
      responses: {
        '200': {
          description: 'Success',
          content: method.response?.$ref
            ? {
                'application/json': {
                  schema: {
                    $ref: `#/components/schemas/${method.response.$ref}`,
                  },
                },
              }
            : undefined,
        },
      },
    }
    if (method.request?.$ref) {
      operation.requestBody = {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${method.request.$ref}` },
          },
        },
      }
    }

    paths[path][httpMethod] = operation
  }

  const serverUrl =
    doc.baseUrl ??
    (doc.rootUrl && doc.servicePath
      ? `${doc.rootUrl.replace(/\/$/, '')}/${doc.servicePath.replace(/^\//, '')}`
      : 'https://generativelanguage.googleapis.com/')

  return {
    openapi: '3.0.4',
    info: {
      title: doc.title ?? 'Google Generative Language API',
      version: doc.version ?? 'v1beta',
    },
    servers: [{ url: serverUrl.replace(/\/$/, '') }],
    paths,
    components,
  }
}

async function fetchGemini({ outDir }: FetchOptions): Promise<void> {
  mkdirSync(outDir, { recursive: true })

  console.log(`Fetching Gemini Discovery doc from ${GEMINI_DISCOVERY_URL}...`)
  const response = await fetch(GEMINI_DISCOVERY_URL)
  if (!response.ok) {
    throw new Error(
      `Gemini fetch failed: ${response.status} ${response.statusText}`,
    )
  }
  const discovery = (await response.json()) as DiscoveryDoc
  writeFileSync(
    join(outDir, 'gemini.discovery.json'),
    JSON.stringify(discovery, null, 2),
  )
  const openapi = discoveryToOpenAPI(discovery)
  writeFileSync(
    join(outDir, 'gemini.openapi.json'),
    JSON.stringify(openapi, null, 2),
  )
  console.log('  Wrote gemini.discovery.json and gemini.openapi.json')
}

/**
 * Gemini paths encode the operation as a `:method` suffix
 * (`v1beta/models/{modelsId}:generateContent`), so classify by that verb.
 * Imagen runs through `:predict`, Veo through `:predictLongRunning`. Tuned
 * models keep their generation verbs (same constraint surface as base
 * models); tuning management, cached contents, corpora, files, and
 * file-search stores are platform endpoints. Async/batch job submission
 * (`:batchGenerateContent`, `:asyncBatchEmbedContent`) is also dropped —
 * job management, not a generation constraint surface — while the
 * synchronous multi-input embed verbs are kept.
 */
const GEMINI_VERB_ACTIVITIES: Record<string, Activity> = {
  generateContent: 'chat',
  streamGenerateContent: 'chat',
  generateAnswer: 'chat',
  generateMessage: 'chat',
  generateText: 'chat',
  countTokens: 'chat',
  countMessageTokens: 'chat',
  countTextTokens: 'chat',
  embedContent: 'embeddings',
  batchEmbedContents: 'embeddings',
  embedText: 'embeddings',
  batchEmbedText: 'embeddings',
  predict: 'image',
  predictLongRunning: 'video',
}

function classifyGemini(path: string): Activity | null {
  const verb = path.match(/:([A-Za-z]+)$/)?.[1]
  if (!verb) return null
  return GEMINI_VERB_ACTIVITIES[verb] ?? null
}

function loadGemini(): Array<ProviderCategorySpec> {
  const specDir = new URL('../specs/gemini/', import.meta.url).pathname
  let raw: string
  try {
    raw = readFileSync(join(specDir, 'gemini.openapi.json'), 'utf8')
  } catch {
    return []
  }
  const spec = JSON.parse(raw) as object
  applyTransforms(spec, { providerId: 'gemini' })
  const mergedSpec: MergedSpec = mergeOpenAPISpecs([spec], 'Google Gemini API')
  return toActivitySpecs('gemini', mergedSpec, classifyGemini)
}

export const geminiProvider: ProviderConfig = {
  id: 'gemini',
  namespace: 'Gemini',
  fetch: fetchGemini,
  load: loadGemini,
  requiresAuth: false,
}
