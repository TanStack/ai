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

  // Transform tools to bindings with external_ prefix to generate correct type stubs
  const bindings = toolsToBindings(tools, 'external_')

  // Generate TypeScript type stubs for the external functions
  const typeStubs = generateTypeStubs(bindings)

  // Build function documentation
  const functionDocs = Object.entries(bindings)
    .map(([name, binding]) => {
      const doc = `- \`${name}(input)\`: ${binding.description}`
      return doc
    })
    .join('\n')

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
\`\`\`

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
