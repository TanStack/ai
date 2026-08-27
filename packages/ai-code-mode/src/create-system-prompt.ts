import { renderLazyCatalogEntry } from '@tanstack/ai'
import { toolsToBindings } from './bindings/tool-to-binding'
import { generateTypeStubs } from './type-generator/json-schema-to-ts'
import type { CodeModeToolConfig } from './types'

/**
 * Create a system prompt snippet that documents the execute_typescript tool
 * and all available external_* functions.
 *
 * Add this to your system prompts array when using createCodeModeTool.
 *
 * @example
 * ```typescript
 * import { createCodeMode } from '@tanstack/ai-code-mode'
 * import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'
 *
 * const { tool, systemPrompt } = createCodeMode({
 *   driver: createNodeIsolateDriver(),
 *   tools: [weatherTool, dbTool],
 * })
 *
 * chat({
 *   systemPrompts: ['You are a helpful assistant.', systemPrompt],
 *   tools: [tool, ...otherTools],
 * })
 * ```
 */
export function createCodeModeSystemPrompt(config: CodeModeToolConfig): string {
  const { tools } = config
  const include = config.lazyToolsConfig?.includeDescription ?? 'none'

  const eagerTools = tools.filter((t) => !t.lazy)
  const lazyTools = tools.filter((t) => t.lazy)

  // Only eager tools get full type stubs + doc lines.
  const bindings = toolsToBindings(eagerTools, 'external_')
  const typeStubs = generateTypeStubs(bindings)

  const functionDocs = Object.entries(bindings)
    .map(([name, binding]) => `- \`${name}(input)\`: ${binding.description}`)
    .join('\n')

  const discoverableSection =
    lazyTools.length > 0
      ? `

### Discoverable APIs

These additional functions are available but not yet documented. Before calling \`external_<name>\` for any of them inside \`execute_typescript\`, call the \`discover_tools\` tool with their names to get full TypeScript signatures:

${lazyTools
  .map(
    (t) =>
      `- ${renderLazyCatalogEntry(`external_${t.name}`, t.description, include)}`,
  )
  .join('\n')}`
      : ''

  return `## Code Execution Tool

You have access to \`execute_typescript\` which runs TypeScript code in a sandboxed environment.

### When to Use

Use \`execute_typescript\` when you need to:
- Process data with loops, conditionals, or complex logic
- Make multiple API calls in parallel (Promise.all)
- Transform, filter, or aggregate data
- Perform calculations or data analysis

For simple operations, prefer calling tools directly.

### Available External APIs

Inside your TypeScript code, you can call these async functions:

${functionDocs}

### Type Definitions

\`\`\`typescript
${typeStubs}
\`\`\`${discoverableSection}

### Example

\`\`\`typescript
// Fetch weather for multiple cities in parallel
const cities = ["Tokyo", "Paris", "NYC"];
const results = await Promise.all(
  cities.map(city => external_fetchWeather({ location: city }))
);

// Find the warmest city
const warmest = results.reduce((prev, curr) =>
  curr.temperature > prev.temperature ? curr : prev
);

return { warmestCity: warmest.location, temperature: warmest.temperature };
\`\`\`

### Important Notes

- All \`external_*\` calls are async - always use \`await\`
- Return a value to pass results back to you
- Use \`console.log()\` for debugging (logs are captured)
- The sandbox is isolated - no network access or file system
- Each execution is independent (no shared state between calls)
`
}
