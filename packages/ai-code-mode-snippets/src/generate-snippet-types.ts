import type { Snippet } from './types'

function schemaToType(schema: Record<string, unknown>): string {
  if (typeof schema !== 'object') {
    return 'unknown'
  }

  const schemaType = schema.type

  // Handle basic types
  if (schemaType === 'string') return 'string'
  const isNumericSchemaType =
    schemaType === 'number' || schemaType === 'integer'
  if (isNumericSchemaType) return 'number'
  if (schemaType === 'boolean') return 'boolean'
  if (schemaType === 'null') return 'null'

  // Handle arrays
  if (schemaType === 'array') {
    const items = schema.items as Record<string, unknown> | undefined
    const itemType = items ? schemaToType(items) : 'unknown'
    return `Array<${itemType}>`
  }

  // Handle objects with properties
  if (schemaType === 'object' && schema.properties) {
    const properties = schema.properties as Record<
      string,
      Record<string, unknown>
    >
    const required = new Set(
      (schema.required as Array<string> | undefined) ?? [],
    )

    const props = Object.entries(properties)
      .map(([key, propSchema]) => {
        const optional = required.has(key) ? '' : '?'
        const propType = schemaToType(propSchema)
        // Handle property names that need quoting
        const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
          ? key
          : `"${key}"`
        return `  ${safeName}${optional}: ${propType};`
      })
      .join('\n')

    return `{\n${props}\n}`
  }

  // Handle enums
  if (schema.enum) {
    const enumValues = schema.enum as Array<unknown>
    return enumValues.map((v) => JSON.stringify(v)).join(' | ')
  }

  // Handle union types (anyOf, oneOf)
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf || schema.oneOf) as Array<
      Record<string, unknown>
    >
    return variants.map((v) => schemaToType(v)).join(' | ')
  }

  // Handle type arrays (e.g., ["string", "null"])
  if (Array.isArray(schemaType)) {
    return schemaType
      .map((t) => {
        if (t === 'string') return 'string'
        const isNumericUnionMember = t === 'number' || t === 'integer'
        if (isNumericUnionMember) return 'number'
        if (t === 'boolean') return 'boolean'
        if (t === 'null') return 'null'
        if (t === 'array') return 'Array<unknown>'
        if (t === 'object') return 'object'
        return 'unknown'
      })
      .join(' | ')
  }

  // Fallback for unknown schemas
  return 'unknown'
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((part) => capitalize(part))
    .join('')
}

export function generateSnippetTypes(snippets: Array<Snippet>): string {
  const declarations: Array<string> = []

  for (const snippet of snippets) {
    const baseName = toPascalCase(snippet.name)
    const inputTypeName = `Snippet${baseName}Input`
    const outputTypeName = `Snippet${baseName}Output`

    // Generate input type
    const inputType = schemaToType(snippet.inputSchema)
    const hasNamedInputObject =
      snippet.inputSchema.type === 'object' &&
      snippet.inputSchema.properties &&
      Object.keys(snippet.inputSchema.properties).length > 0
    if (hasNamedInputObject) {
      declarations.push(`interface ${inputTypeName} ${inputType}`)
    }

    // Generate output type
    const outputType = schemaToType(snippet.outputSchema)
    const hasNamedOutputObject =
      snippet.outputSchema.type === 'object' &&
      snippet.outputSchema.properties &&
      Object.keys(snippet.outputSchema.properties).length > 0
    if (hasNamedOutputObject) {
      declarations.push(`interface ${outputTypeName} ${outputType}`)
    }

    // Determine type references
    const inputRef =
      snippet.inputSchema.type === 'object' &&
      snippet.inputSchema.properties &&
      Object.keys(snippet.inputSchema.properties).length > 0
        ? inputTypeName
        : inputType

    const outputRef =
      snippet.outputSchema.type === 'object' &&
      snippet.outputSchema.properties &&
      Object.keys(snippet.outputSchema.properties).length > 0
        ? outputTypeName
        : outputType

    // Generate function declaration with JSDoc
    const hintsDoc = snippet.usageHints.map((h) => ` * @hint ${h}`).join('\n')

    declarations.push(
      `/**
 * ${snippet.description}
${hintsDoc}
 */
declare function snippet_${snippet.name}(input: ${inputRef}): Promise<${outputRef}>;`,
    )
  }

  return declarations.join('\n\n')
}
