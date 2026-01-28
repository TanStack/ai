#!/usr/bin/env tsx
/**
 * Generate category-specific EndpointTypeMap files from heyapi-generated types
 *
 * This script:
 * 1. Scans each category directory for types.gen.ts
 * 2. Extracts endpoint information from Post*Data and Get*Responses types
 * 3. For each category, generates {category}/endpoint-map.ts with:
 *    - TypeScript type imports from types.gen.ts
 *    - Zod schema imports from zod.gen.ts
 *    - CategoryEndpointMap type
 *    - CategorySchemaMap constant (Zod schemas)
 *    - CategoryModel utility type
 *    - CategoryInput<T> utility type
 *    - CategoryOutput<T> utility type
 * 4. Generates unified index.ts that re-exports all categories
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface EndpointInfo {
  endpointId: string
  inputType: string
  outputType: string
}

/**
 * Extract endpoints from types.gen.ts file
 */
function extractEndpointsFromTypes(categoryPath: string): Array<EndpointInfo> {
  const typesPath = join(categoryPath, 'types.gen.ts')
  if (!existsSync(typesPath)) {
    return []
  }

  const content = readFileSync(typesPath, 'utf-8')
  const endpoints: Array<EndpointInfo> = []

  // Match: export type Post*Data = {
  //   body: SchemaXxxInput
  //   ...
  //   url: '/endpoint-path'
  // }
  const postTypeRegex =
    /export type (Post\w+)Data = \{[\s\S]*?body: (\w+)[\s\S]*?url: '([^']+)'/g

  let match
  while ((match = postTypeRegex.exec(content)) !== null) {
    const postTypeName = match[1]!
    const inputType = match[2]!
    const urlPath = match[3]!

    // Remove leading slash from URL to get endpoint ID
    const endpointId = urlPath.replace(/^\//, '')

    // Extract prefix from PostXxxData -> Xxx
    const prefix = postTypeName.replace(/^Post/, '').replace(/Data$/, '')

    // Generate corresponding GET type name
    const getTypeName = `Get${prefix}RequestsByRequestIdResponses`

    // Find the GET type and extract output type from '200' field
    const getTypeRegex = new RegExp(
      `export type ${getTypeName} = \\{[\\s\\S]*?200: (\\w+)`,
    )
    const getMatch = content.match(getTypeRegex)

    if (!getMatch) {
      console.warn(
        `  Warning: Could not find GET response type ${getTypeName} for ${endpointId}`,
      )
      continue
    }

    const outputType = getMatch[1]!

    endpoints.push({
      endpointId,
      inputType,
      outputType,
    })
  }

  return endpoints
}

/**
 * Get Zod schema name from TypeScript type name
 * SchemaWanEffectsInput -> zSchemaWanEffectsInput
 */
function getZodSchemaName(typeName: string): string {
  return 'z' + typeName
}

/**
 * Convert category name to PascalCase
 * Prefix with "Gen" if starts with a digit
 */
function toPascalCase(str: string): string {
  const pascalCase = str
    .split(/[-_]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')

  // TypeScript identifiers cannot start with a number
  // Prefix with "Gen" if it starts with a digit
  if (/^\d/.test(pascalCase)) {
    return 'Gen' + pascalCase
  }

  return pascalCase
}

/**
 * Generate endpoint-map.ts for a category
 */
function generateEndpointMap(
  category: string,
  categoryPath: string,
  endpoints: Array<EndpointInfo>,
): void {
  const typeName = toPascalCase(category)

  // Collect unique type and schema names
  const inputTypes = new Set<string>()
  const outputTypes = new Set<string>()
  const inputSchemas = new Set<string>()
  const outputSchemas = new Set<string>()

  for (const { inputType, outputType } of endpoints) {
    inputTypes.add(inputType)
    outputTypes.add(outputType)
    inputSchemas.add(getZodSchemaName(inputType))
    outputSchemas.add(getZodSchemaName(outputType))
  }

  // Generate imports
  const typeImports = Array.from(
    new Set([...inputTypes, ...outputTypes]),
  ).sort()
  const schemaImports = Array.from(
    new Set([...inputSchemas, ...outputSchemas]),
  ).sort()

  const imports = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts`,
    ``,
    `import {`,
    ...schemaImports.map((t) => `  ${t},`),
    `} from './zod.gen'`,
    ``,
    `import type {`,
    ...typeImports.map((t) => `  ${t},`),
    `} from './types.gen'`,
    ``,
  ]

  // Generate TypeScript EndpointMap type
  const typeMapLines = [`export type ${typeName}EndpointMap = {`]

  for (const { endpointId, inputType, outputType } of endpoints) {
    typeMapLines.push(`  '${endpointId}': {`)
    typeMapLines.push(`    input: ${inputType}`)
    typeMapLines.push(`    output: ${outputType}`)
    typeMapLines.push(`  }`)
  }

  typeMapLines.push(`}`)

  // Generate Zod SchemaMap constant
  const schemaMapLines = [``, `export const ${typeName}SchemaMap = {`]

  for (const { endpointId, inputType, outputType } of endpoints) {
    const inputSchema = getZodSchemaName(inputType)
    const outputSchema = getZodSchemaName(outputType)
    schemaMapLines.push(`  ['${endpointId}']: {`)
    schemaMapLines.push(`    input: ${inputSchema},`)
    schemaMapLines.push(`    output: ${outputSchema},`)
    schemaMapLines.push(`  },`)
  }

  schemaMapLines.push(`} as const`)

  // Generate utility types
  const utilityTypes = [
    ``,
    `/** Union type of all ${category} model endpoint IDs */`,
    `export type ${typeName}Model = keyof ${typeName}EndpointMap`,
    ``,
    `/** Get the input type for a specific ${category} model */`,
    `export type ${typeName}ModelInput<T extends ${typeName}Model> = ${typeName}EndpointMap[T]['input']`,
    ``,
    `/** Get the output type for a specific ${category} model */`,
    `export type ${typeName}ModelOutput<T extends ${typeName}Model> = ${typeName}EndpointMap[T]['output']`,
    ``,
  ]

  // Combine all parts
  const content = [
    ...imports,
    ...typeMapLines,
    ...schemaMapLines,
    ...utilityTypes,
  ].join('\n')

  // Write to file
  const outputPath = join(categoryPath, 'endpoint-map.ts')
  writeFileSync(outputPath, content)
  console.log(
    `  ✓ Generated ${category}/endpoint-map.ts (${endpoints.length} endpoints)`,
  )
}

function main() {
  const generatedDir = join(__dirname, '..', 'src', 'generated')

  if (!existsSync(generatedDir)) {
    console.error('Error: src/generated/ directory not found.')
    process.exit(1)
  }

  console.log('Scanning generated/ directory for categories...')

  // Get all category directories
  const categories = readdirSync(generatedDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .sort()

  console.log(`Found ${categories.length} categories:`)
  for (const category of categories) {
    console.log(`  - ${category}`)
  }

  console.log('\nGenerating endpoint maps...')

  const processedCategories: Array<string> = []

  for (const category of categories) {
    const categoryPath = join(generatedDir, category)

    // Extract endpoints from types.gen.ts
    const endpoints = extractEndpointsFromTypes(categoryPath)

    if (endpoints.length === 0) {
      console.warn(`  Warning: No endpoints found for ${category}, skipping`)
      continue
    }

    // Generate endpoint-map.ts
    generateEndpointMap(category, categoryPath, endpoints)
    processedCategories.push(category)
  }

  // Generate unified index.ts
  console.log('\nGenerating unified index.ts...')
  const indexLines = [
    `// AUTO-GENERATED - Do not edit manually`,
    `// Generated from types.gen.ts via scripts/generate-fal-endpoint-maps.ts`,
    ``,
    `// Re-export all category endpoint maps`,
  ]

  for (const category of processedCategories) {
    indexLines.push(`export * from './${category}/endpoint-map'`)
  }

  indexLines.push(``)
  indexLines.push(`// Create a union type of all models across categories`)
  indexLines.push(`import type {`)
  for (const category of processedCategories) {
    indexLines.push(`  ${toPascalCase(category)}Model,`)
  }
  indexLines.push(`} from './index'`)
  indexLines.push(``)
  indexLines.push(`/**`)
  indexLines.push(
    ` * Union type of all Fal.ai model endpoint IDs across all categories.`,
  )
  indexLines.push(` * `)
  indexLines.push(
    ` * Note: Using this union type loses some type precision. For better type safety,`,
  )
  indexLines.push(
    ` * import category-specific types like ImageToImageModel, TextToImageModel, etc.`,
  )
  indexLines.push(` */`)
  indexLines.push(`export type FalModel =`)
  for (let i = 0; i < processedCategories.length; i++) {
    const category = processedCategories[i]
    const isLast = i === processedCategories.length - 1
    indexLines.push(`  | ${toPascalCase(category!)}Model${isLast ? '' : ''}`)
  }
  indexLines.push(``)

  const indexPath = join(generatedDir, 'index.ts')
  writeFileSync(indexPath, indexLines.join('\n'))
  console.log(`  ✓ Generated index.ts`)

  console.log(`\n✓ Done! Generated endpoint maps in src/generated/`)
  console.log(`\nCategories generated:`)
  for (const category of processedCategories) {
    console.log(`  - ${category} (${toPascalCase(category)}Model)`)
  }
}

main()
