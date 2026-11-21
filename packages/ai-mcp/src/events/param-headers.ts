/**
 * `x-mcp-header` scan and `Mcp-Param-*` values for `events/*` requests.
 *
 * The MCP SDK builds these headers for `tools/call` only. Events methods
 * are not in that path, so the HTTP fetch wrapper reads this lookup.
 */

const HEADER_KEY = 'x-mcp-header'
const TOKEN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/
const PRIMITIVE_TYPES = new Set(['string', 'integer', 'boolean'])
const SENTINEL_PREFIX = '=?base64?'
const SENTINEL_SUFFIX = '?='

const NON_REACHABLE = [
  'items',
  'prefixItems',
  'contains',
  'additionalProperties',
  'unevaluatedProperties',
  'unevaluatedItems',
  'propertyNames',
  'patternProperties',
  'dependentSchemas',
  'oneOf',
  'anyOf',
  'allOf',
  'not',
  'if',
  'then',
  'else',
  '$defs',
  'definitions',
] as const

const OBJECT_BRANCHES = new Set<string>([
  'patternProperties',
  'dependentSchemas',
  '$defs',
  'definitions',
])

export interface McpParamDeclaration {
  path: Array<string>
  headerName: string
}

function pathLabel(path: Array<string>): string {
  return path.length === 0 ? '<root>' : path.join('.')
}

function isSchema(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * `undefined` when the schema's annotations are valid (including none).
 * A string is the first constraint the schema breaks.
 */
export function eventHeaderFault(inputSchema: unknown): string | undefined {
  return scan(inputSchema).fault
}

function scan(inputSchema: unknown): {
  fault?: string
  declarations: Array<McpParamDeclaration>
} {
  const declarations: Array<McpParamDeclaration> = []
  const seen = new Map<string, string>()

  const visit = (
    node: unknown,
    path: Array<string>,
    reachable: boolean,
  ): string | undefined => {
    if (!isSchema(node)) return undefined
    if (HEADER_KEY in node) {
      if (!reachable || path.length === 0) {
        return `${pathLabel(path)}: x-mcp-header is only permitted on properties reached through properties keys`
      }
      const raw = node[HEADER_KEY]
      if (typeof raw !== 'string' || raw.length === 0) {
        return `${pathLabel(path)}: x-mcp-header must be a non-empty string`
      }
      if (!TOKEN.test(raw)) {
        return `${pathLabel(path)}: x-mcp-header '${raw}' is not an HTTP token`
      }
      const type = typeof node.type === 'string' ? node.type : undefined
      if (type === undefined || !PRIMITIVE_TYPES.has(type)) {
        return `${pathLabel(path)}: x-mcp-header is only permitted on string, integer, or boolean`
      }
      const lower = raw.toLowerCase()
      const prior = seen.get(lower)
      if (prior !== undefined) {
        return `x-mcp-header '${raw}' is not case-insensitively unique (also '${prior}')`
      }
      seen.set(lower, raw)
      declarations.push({ path, headerName: raw })
    }
    const properties = node.properties
    if (isSchema(properties)) {
      for (const [key, child] of Object.entries(properties)) {
        const fault = visit(child, [...path, key], reachable)
        if (fault !== undefined) return fault
      }
    }
    for (const keyword of NON_REACHABLE) {
      if (!(keyword in node)) continue
      const sub = node[keyword]
      const branches = Array.isArray(sub)
        ? sub
        : isSchema(sub) && OBJECT_BRANCHES.has(keyword)
          ? Object.values(sub)
          : [sub]
      for (const branch of branches) {
        const fault = visit(branch, [...path, `<${keyword}>`], false)
        if (fault !== undefined) return fault
      }
    }
    return undefined
  }

  const fault = visit(inputSchema, [], true)
  return fault === undefined ? { declarations } : { fault, declarations: [] }
}

function valueAt(root: unknown, path: Array<string>): unknown {
  let node = root
  for (const key of path) {
    if (!isSchema(node)) return undefined
    node = node[key]
  }
  return node
}

function primitiveToString(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined
    if (Number.isInteger(value) && !Number.isSafeInteger(value))
      return undefined
    return String(value)
  }
  return undefined
}

function needsBase64(value: string): boolean {
  if (value.length === 0) return true
  if (value.startsWith(SENTINEL_PREFIX) && value.endsWith(SENTINEL_SUFFIX)) {
    return true
  }
  if (value !== value.trim()) return true
  for (let i = 0; i < value.length; i++) {
    const code = value.codePointAt(i)
    if (code === 9 || (code !== undefined && code >= 32 && code <= 126)) {
      continue
    }
    return true
  }
  return false
}

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCodePoint(byte)
  return btoa(binary)
}

/** Plain ASCII stays as-is. Anything else uses the `=?base64?...?=` sentinel. */
export function encodeMcpHeaderValue(value: string): string {
  return needsBase64(value)
    ? `${SENTINEL_PREFIX}${utf8ToBase64(value)}${SENTINEL_SUFFIX}`
    : value
}

export function mcpParamHeaders(
  declarations: Array<McpParamDeclaration>,
  args: unknown,
): Record<string, string> {
  const headers: Record<string, string> = {}
  for (const decl of declarations) {
    const raw = valueAt(args, decl.path)
    if (raw === undefined || raw === null) continue
    const text = primitiveToString(raw)
    if (text === undefined) continue
    headers[`Mcp-Param-${decl.headerName}`] = encodeMcpHeaderValue(text)
  }
  return headers
}

export interface EventHeaderLookup {
  replace: (events: Array<{ name: string; inputSchema: unknown }>) => void
  headersFor: (name: string, args: unknown) => Record<string, string>
}

export function createEventHeaderLookup(): EventHeaderLookup {
  const byName = new Map<string, Array<McpParamDeclaration>>()
  return {
    replace(events) {
      byName.clear()
      for (const event of events) {
        const scanned = scan(event.inputSchema)
        if (scanned.fault !== undefined) continue
        byName.set(event.name, scanned.declarations)
      }
    },
    headersFor(name, args) {
      const declarations = byName.get(name)
      if (declarations === undefined || declarations.length === 0) return {}
      return mcpParamHeaders(declarations, args)
    },
  }
}
