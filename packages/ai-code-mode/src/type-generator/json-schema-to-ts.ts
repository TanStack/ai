import type { ToolBinding } from '../types'

/**
 * Options for type stub generation
 */
export interface TypeGeneratorOptions {
  /**
   * Include JSDoc comments with descriptions
   * @default true
   */
  includeDescriptions?: boolean
}

/**
 * Generate TypeScript type stubs for all tool bindings
 *
 * These stubs are included in the LLM system prompt so it knows
 * the exact type signatures of available tools.
 *
 * Tool names match the actual function names injected into the sandbox.
 */
export function generateTypeStubs(
  bindings: Record<string, ToolBinding>,
  options: TypeGeneratorOptions = {},
): string {
  const { includeDescriptions = true } = options

  const declarations: Array<string> = []

  for (const [name, binding] of Object.entries(bindings)) {
    const inputTypeName = `${capitalize(name)}Input`
    const outputTypeName = `${capitalize(name)}Output`

    // Generate input type
    const inputType = jsonSchemaToTypeScript(
      binding.inputSchema,
      inputTypeName,
      includeDescriptions,
    )
    if (inputType.declaration) {
      declarations.push(inputType.declaration)
    }

    // Generate output type if present
    let outputTypeRef = 'unknown'
    if (binding.outputSchema) {
      const outputType = jsonSchemaToTypeScript(
        binding.outputSchema,
        outputTypeName,
        includeDescriptions,
      )
      if (outputType.declaration) {
        declarations.push(outputType.declaration)
      }
      outputTypeRef = outputType.name
    }

    // Generate function declaration matching the actual sandbox function name
    const description =
      includeDescriptions && binding.description
        ? `/** ${binding.description} */\n`
        : ''

    declarations.push(
      `${description}declare function ${name}(input: ${inputType.name}): Promise<${outputTypeRef}>;`,
    )
  }

  return declarations.join('\n\n')
}

interface TypeResult {
  name: string
  declaration: string
}

/**
 * Convert a JSON Schema to a TypeScript type
 *
 * Supports basic types: string, number, boolean, object, array
 */
export function jsonSchemaToTypeScript(
  schema: Record<string, unknown>,
  typeName: string,
  includeDescriptions = true,
): TypeResult {
  const type = schemaToType(schema, includeDescriptions)

  // For object schemas with properties, create a named interface. An enum or
  // const wins in schemaToType, so its literal type stays an inline alias
  if (
    schema.type === 'object' &&
    schema.properties &&
    Object.keys(schema.properties).length > 0 &&
    !Array.isArray(schema.enum) &&
    !('const' in schema)
  ) {
    return {
      name: typeName,
      declaration: `interface ${typeName} ${type}`,
    }
  }

  // For simple types or empty objects, create a type alias
  return {
    name: type,
    declaration: '',
  }
}

/**
 * Convert a JSON Schema to a TypeScript type string
 */
function schemaToType(
  schema: Record<string, unknown>,
  includeDescriptions: boolean,
): string {
  if (typeof schema !== 'object') {
    return 'unknown'
  }

  // Enums and consts narrow a typed schema (e.g. { type: 'string', enum: [...] }),
  // so they must win over the plain type below. const is the narrower of the two
  if ('const' in schema) {
    return JSON.stringify(schema.const)
  }
  if (Array.isArray(schema.enum)) {
    return schema.enum.map((v) => JSON.stringify(v)).join(' | ')
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
    const itemType = items
      ? schemaToType(items, includeDescriptions)
      : 'unknown'
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
        const propType = schemaToType(propSchema, includeDescriptions)
        // Handle property names that need quoting
        const safeName = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
          ? key
          : `"${key}"`
        const doc =
          includeDescriptions && typeof propSchema.description === 'string'
            ? `  /** ${propSchema.description.replace(/\*\//g, '*\\/')} */\n`
            : ''
        return `${doc}  ${safeName}${optional}: ${propType};`
      })
      .join('\n')

    return `{\n${props}\n}`
  }

  // Handle union types (anyOf, oneOf)
  if (schema.anyOf || schema.oneOf) {
    const variants = (schema.anyOf || schema.oneOf) as Array<
      Record<string, unknown>
    >
    return variants.map((v) => schemaToType(v, includeDescriptions)).join(' | ')
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
