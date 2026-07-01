/**
 * Single words that on their own signal "this is a credential".
 * Matched after splitting a parameter name into camelCase/snake/kebab words.
 * So `accessToken` → `['access', 'token']` → matches `token`,
 * but `tokenizer` → `['tokenizer']` → does NOT match `token`.
 */
const DANGEROUS_WORDS = new Set<string>([
  'password',
  'passwd',
  'pwd',
  'passcode',
  'secret',
  'token',
  'credential',
  'credentials',
  'authorization',
  'jwt',
  'bearer',
])

/**
 * Compound patterns matched as substrings of the normalized (lowercased,
 * separator-stripped) parameter name. Catches forms like `openai_api_key`,
 * `x-api-key`, and `webhookSecret`.
 */
const COMPOUND_PATTERNS = [
  'apikey',
  'accesskey',
  'authkey',
  'privatekey',
  'clientsecret',
  'webhooksecret',
] as const

export interface SecretParameterInfo {
  toolName: string
  paramName: string
  paramPath: Array<string>
}

export type SecretParameterHandler =
  | 'warn'
  | 'throw'
  | 'ignore'
  | ((info: SecretParameterInfo) => void)

interface ToolLike {
  name: string
  inputSchema?: Record<string, unknown>
}

interface JsonSchemaLike {
  type?: string
  properties?: Record<string, JsonSchemaLike>
  items?: JsonSchemaLike | Array<JsonSchemaLike>
  anyOf?: Array<JsonSchemaLike>
  oneOf?: Array<JsonSchemaLike>
  allOf?: Array<JsonSchemaLike>
  additionalProperties?: boolean | JsonSchemaLike
  $ref?: string
  $defs?: Record<string, JsonSchemaLike>
  definitions?: Record<string, JsonSchemaLike>
}

function splitIntoWords(name: string): Array<string> {
  return name
    .replace(/[_\-\s]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
}

function looksLikeSecret(name: string): boolean {
  const words = splitIntoWords(name)
  if (words.some((w) => DANGEROUS_WORDS.has(w))) return true
  const normalized = name.replace(/[_\-\s]/g, '').toLowerCase()
  return COMPOUND_PATTERNS.some((p) => normalized.includes(p))
}

function resolveRef(
  ref: string,
  root: JsonSchemaLike,
): JsonSchemaLike | undefined {
  const match = ref.match(/^#\/(\$defs|definitions)\/(.+)$/)
  if (!match) return undefined
  const bucket = match[1] as '$defs' | 'definitions'
  return root[bucket]?.[match[2]!]
}

function findSecretParams(
  schema: JsonSchemaLike | undefined,
  root: JsonSchemaLike,
  seen: Set<object>,
  path: Array<string>,
  found: Array<{ path: Array<string>; name: string }>,
): void {
  if (!schema || typeof schema !== 'object' || seen.has(schema)) return
  seen.add(schema)

  if (schema.properties && typeof schema.properties === 'object') {
    for (const [paramName, sub] of Object.entries(schema.properties)) {
      if (looksLikeSecret(paramName)) {
        found.push({ path: [...path, paramName], name: paramName })
      }
      findSecretParams(sub, root, seen, [...path, paramName], found)
    }
  }

  if (Array.isArray(schema.items)) {
    schema.items.forEach((s, i) =>
      findSecretParams(s, root, seen, [...path, `[${i}]`], found),
    )
  } else if (schema.items && typeof schema.items === 'object') {
    findSecretParams(schema.items, root, seen, [...path, '[]'], found)
  }

  if (
    schema.additionalProperties &&
    typeof schema.additionalProperties === 'object'
  ) {
    findSecretParams(schema.additionalProperties, root, seen, path, found)
  }

  for (const key of ['anyOf', 'oneOf', 'allOf'] as const) {
    const arr = schema[key]
    if (Array.isArray(arr)) {
      arr.forEach((s) => findSecretParams(s, root, seen, path, found))
    }
  }

  if (typeof schema.$ref === 'string') {
    const target = resolveRef(schema.$ref, root)
    if (target) findSecretParams(target, root, seen, path, found)
  }
}

function buildMessage(toolName: string, paramPath: Array<string>): string {
  return (
    `[TanStack AI Code Mode] Tool "${toolName}" has parameter "${paramPath.join('.')}" ` +
    `that looks like a secret. Code Mode executes LLM-generated code — any ` +
    `value passed through this parameter is accessible to generated code and ` +
    `could be exfiltrated. Keep secrets in your server-side tool implementation ` +
    `instead of passing them as tool parameters.`
  )
}

/**
 * Scan tool input schemas for parameter names that look like secrets.
 * Emits a warning (or invokes the configured handler) for each match.
 *
 * Recurses into nested object properties, array items, union branches
 * (anyOf/oneOf/allOf), additionalProperties, and `$ref` targets that
 * resolve within the same schema's `$defs`/`definitions`.
 *
 * Best-effort heuristic, not a security boundary.
 */
export function warnIfBindingsExposeSecrets(
  tools: Array<ToolLike>,
  options: {
    handler?: SecretParameterHandler
    dedupCache?: Set<string>
  } = {},
): void {
  const { handler = 'warn', dedupCache } = options
  if (handler === 'ignore') return

  for (const tool of tools) {
    const schema = tool.inputSchema as JsonSchemaLike | undefined
    if (!schema) continue

    const found: Array<{ path: Array<string>; name: string }> = []
    findSecretParams(schema, schema, new Set(), [], found)

    for (const entry of found) {
      const dedupKey = `${tool.name}::${entry.path.join('.')}`
      if (dedupCache) {
        if (dedupCache.has(dedupKey)) continue
        dedupCache.add(dedupKey)
      }

      const info: SecretParameterInfo = {
        toolName: tool.name,
        paramName: entry.name,
        paramPath: entry.path,
      }

      if (typeof handler === 'function') {
        handler(info)
      } else if (handler === 'throw') {
        throw new Error(buildMessage(tool.name, entry.path))
      } else {
        console.warn(buildMessage(tool.name, entry.path))
      }
    }
  }
}
