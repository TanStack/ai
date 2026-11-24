import { z } from 'zod'
import {
  renderLazyCatalogEntry,
  searchLazyTools,
  toolDefinition,
} from '@tanstack/ai'
import { toolToBinding } from './bindings/tool-to-binding'
import { generateTypeStubs } from './type-generator/json-schema-to-ts'
import type { LazyToolsConfig, SchemaInput, ServerTool } from '@tanstack/ai'
import type { CodeModeTool } from './types'

const discoverInputSchema = z.object({
  toolNames: z
    .array(z.string())
    .describe(
      'Names of tools to discover, exactly as shown in the Discoverable APIs ' +
        'catalog. The external_ prefix is optional — both "external_fetchStocks" ' +
        'and "fetchStocks" resolve.',
    ),
})

/** Input for `catalog: 'search'`: a query, exact names, or both. */
const discoverSearchInputSchema = z.object({
  query: z
    .string()
    .optional()
    .describe(
      'What you need to do, in a few words. Returns the best matching functions.',
    ),
  toolNames: z
    .array(z.string())
    .optional()
    .describe(
      'Exact function names to discover. The external_ prefix is optional.',
    ),
})

const discoverOutputSchema = z.object({
  tools: z.array(
    z.object({
      name: z
        .string()
        .describe('The sandbox function name, e.g. external_fetchStocks'),
      description: z.string(),
      typeStub: z.string().describe('TypeScript declaration for the function'),
    }),
  ),
  errors: z.array(z.string()).optional(),
})

const EXTERNAL_PREFIX = 'external_'

/**
 * Strip a single leading `external_` prefix so the model can pass either the
 * catalog name (`external_fetchStocks`) or the bare name (`fetchStocks`).
 */
function stripExternalPrefix(name: string): string {
  return name.startsWith(EXTERNAL_PREFIX)
    ? name.slice(EXTERNAL_PREFIX.length)
    : name
}

/**
 * Build the `discover_tools` sibling tool for Code Mode lazy tools. The model
 * calls it with lazy tool names and receives each one's TypeScript type stub +
 * description, which it can then use to write correctly-typed `external_*`
 * calls inside `execute_typescript`. The bindings themselves are always present
 * in the sandbox — this only reveals documentation.
 *
 * Tools are catalogued in `external_<name>` form to match the "Discoverable
 * APIs" section of the Code Mode system prompt; lookups tolerate either form.
 * `lazyToolsConfig.includeDescription` controls how much of each tool's
 * description appears in this tool's own catalog (mirroring the system prompt).
 * With `lazyToolsConfig.catalog: 'search'` nothing is listed: the model passes
 * a `query` and gets the best matching functions.
 */
export function createDiscoveryTool(
  lazyTools: Array<CodeModeTool>,
  lazyToolsConfig?: LazyToolsConfig,
): ServerTool<SchemaInput, typeof discoverOutputSchema, 'discover_tools'> {
  const lazyMap = new Map(lazyTools.map((t) => [t.name, t]))
  const search = lazyToolsConfig?.catalog === 'search'
  const include = lazyToolsConfig?.includeDescription ?? 'none'
  const catalog = search
    ? ''
    : lazyTools
        .map((t) =>
          renderLazyCatalogEntry(
            `${EXTERNAL_PREFIX}${t.name}`,
            t.description,
            include,
          ),
        )
        .join(', ')

  const discover = async ({
    toolNames,
    query,
  }: {
    toolNames?: Array<string>
    query?: string
  }) => {
    const tools: Array<{
      name: string
      description: string
      typeStub: string
    }> = []
    const errors: Array<string> = []

    const names = new Set((toolNames ?? []).map(stripExternalPrefix))
    if (query) {
      const found = searchLazyTools(lazyTools, query)
      if (found.length === 0) {
        errors.push(`No functions match '${query}'. Try other words.`)
      }
      for (const tool of found) names.add(tool.name)
    }

    for (const name of names) {
      const tool = lazyMap.get(name)
      if (!tool) {
        errors.push(
          search
            ? `Unknown tool: '${name}'. Call discover_tools with a query to find functions.`
            : `Unknown tool: '${name}'. Discoverable tools: [${catalog}]`,
        )
        continue
      }
      const binding = toolToBinding(tool, EXTERNAL_PREFIX)
      const typeStub = generateTypeStubs({ [binding.name]: binding })
      tools.push({
        name: binding.name,
        description: tool.description,
        typeStub,
      })
    }

    return errors.length > 0 ? { tools, errors } : { tools }
  }

  if (search) {
    return toolDefinition({
      name: 'discover_tools' as const,
      description:
        `Find more sandbox APIs for execute_typescript. They are not listed: ` +
        `pass a query that says what you need to do, and get the best matching ` +
        `functions with their full TypeScript signatures. You can also pass ` +
        `exact names (the external_ prefix is optional).`,
      inputSchema: discoverSearchInputSchema,
      outputSchema: discoverOutputSchema,
    }).server(discover)
  }

  return toolDefinition({
    name: 'discover_tools' as const,
    description:
      `Discover full TypeScript signatures for additional sandbox APIs before ` +
      `using them inside execute_typescript. Discoverable tools: [${catalog}]. ` +
      `Pass the names exactly as shown (the external_ prefix is optional).`,
    inputSchema: discoverInputSchema,
    outputSchema: discoverOutputSchema,
  }).server(discover)
}
