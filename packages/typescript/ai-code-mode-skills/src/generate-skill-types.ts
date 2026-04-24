import type { Skill } from './types'

/**
 * Convert a JSON Schema to a TypeScript type string
 */
function schemaToType(schema: Record<string, unknown>): string {
  if (typeof schema !== 'object') {
    return 'unknown'
  }

  const schemaType = schema.type

  // Handle basic types
  if (schemaType === 'string') return 'string'
  if (schemaType === 'number' || schemaType === 'integer') return 'number'
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
        if (t === 'number' || t === 'integer') return 'number'
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

/**
 * Capitalize the first letter of a string
 */
function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1)
}

/**
 * Convert snake_case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('_')
    .map((part) => capitalize(part))
    .join('')
}

/**
 * Generate TypeScript type stubs for skills.
 * These are included in the system prompt so the LLM knows
 * the exact type signatures of available skills.
 */
export function generateSkillTypes(skills: Array<Skill>): string {
  const declarations: Array<string> = []

  for (const skill of skills) {
    const baseName = toPascalCase(skill.name)
    const inputTypeName = `Skill${baseName}Input`
    const outputTypeName = `Skill${baseName}Output`

    // Generate input type
    const inputType = schemaToType(skill.inputSchema)
    if (
      skill.inputSchema.type === 'object' &&
      skill.inputSchema.properties &&
      Object.keys(skill.inputSchema.properties as object).length > 0
    ) {
      declarations.push(`interface ${inputTypeName} ${inputType}`)
    }

    // Generate output type
    const outputType = schemaToType(skill.outputSchema)
    if (
      skill.outputSchema.type === 'object' &&
      skill.outputSchema.properties &&
      Object.keys(skill.outputSchema.properties as object).length > 0
    ) {
      declarations.push(`interface ${outputTypeName} ${outputType}`)
    }

    // Determine type references
    const inputRef =
      skill.inputSchema.type === 'object' &&
      skill.inputSchema.properties &&
      Object.keys(skill.inputSchema.properties as object).length > 0
        ? inputTypeName
        : inputType

    const outputRef =
      skill.outputSchema.type === 'object' &&
      skill.outputSchema.properties &&
      Object.keys(skill.outputSchema.properties as object).length > 0
        ? outputTypeName
        : outputType

    // Generate function declaration with JSDoc
    const hintsDoc = skill.usageHints.map((h) => ` * @hint ${h}`).join('\n')

    declarations.push(
      `/**
 * ${skill.description}
${hintsDoc}
 */
declare function skill_${skill.name}(input: ${inputRef}): Promise<${outputRef}>;`,
    )
  }

  return declarations.join('\n\n')
}
