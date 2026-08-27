import { generateSnippetTypes } from './generate-snippet-types'
import type { Snippet } from './types'

interface CreateSnippetsSystemPromptOptions {
  selectedSnippets: Array<Snippet>

  totalSnippetCount: number

  snippetsAsTools?: boolean
}

function generateExampleFromSchema(schema: Record<string, unknown>): string {
  if (schema.type === 'object' && schema.properties) {
    const props = schema.properties as Record<string, { type: string }>
    const example: Record<string, unknown> = {}

    const propertyEntries = Object.entries(props)
    for (const [key, value] of propertyEntries) {
      if (value.type === 'string') example[key] = `'example_${key}'`
      else if (value.type === 'number') example[key] = 0
      else if (value.type === 'boolean') example[key] = true
      else if (value.type === 'array') example[key] = []
      else example[key] = null
    }

    return JSON.stringify(example).replace(/"/g, '')
  }
  return '{}'
}

export function createSnippetsSystemPrompt({
  selectedSnippets,
  totalSnippetCount,
  snippetsAsTools = true,
}: CreateSnippetsSystemPromptOptions): string {
  // No snippets in library
  if (totalSnippetCount === 0) {
    return `## Snippet Library

You have access to a snippet library for storing reusable code. The library is currently empty.

### Snippet Management Tools

- \`search_snippets(query, limit?)\` - Search for snippets (currently empty)
- \`get_snippet(name)\` - Get full snippet details including code
- \`register_snippet(...)\` - Save working code as a reusable snippet

When you write useful, reusable code, consider registering it as a snippet for future use.

**Important**: Newly registered snippets become available as tools on the **next message**, not immediately in the current conversation turn.
`
  }

  // No snippets selected for this conversation
  if (selectedSnippets.length === 0) {
    return `## Snippet Library

You have access to a persistent snippet library with ${totalSnippetCount} snippet${totalSnippetCount === 1 ? '' : 's'}. No snippets were pre-loaded for this conversation based on context.

### Snippet Management Tools

- \`search_snippets(query, limit?)\` - Search for relevant snippets
- \`get_snippet(name)\` - Get full snippet details including code
- \`register_snippet(...)\` - Save working code as a reusable snippet

When you write useful, reusable code, consider registering it as a snippet for future use.

**Important**: Newly registered snippets become available as tools on the **next message**, not immediately in the current conversation turn.
`
  }

  if (snippetsAsTools) {
    // Snippets are available as direct tools
    const snippetToolDocs = selectedSnippets
      .map((snippet) => {
        const inputExample = generateExampleFromSchema(snippet.inputSchema)
        const trustBadge =
          snippet.trustLevel === 'trusted'
            ? '✓ trusted'
            : snippet.trustLevel === 'provisional'
              ? '◐ provisional'
              : '○ untrusted'

        return `
### ${snippet.name} [${trustBadge}]

${snippet.description}

${snippet.usageHints.map((h) => `- ${h}`).join('\n')}

**Input Schema:**
\`\`\`json
${JSON.stringify(snippet.inputSchema, null, 2)}
\`\`\`

**Output Schema:**
\`\`\`json
${JSON.stringify(snippet.outputSchema, null, 2)}
\`\`\`

**Example:**
Call the \`${snippet.name}\` tool with: ${inputExample}
`
      })
      .join('\n---\n')

    return `## Snippet Library

${selectedSnippets.length} snippet${selectedSnippets.length === 1 ? '' : 's'} pre-loaded for this conversation (${totalSnippetCount} total in library).

### Available Snippet Tools

These snippets are available as **direct tools** you can call (marked with [SNIPPET] in description):

${snippetToolDocs}

### Snippet Management Tools

- \`search_snippets(query, limit?)\` - Find additional snippets not pre-loaded
- \`get_snippet(name)\` - Get full details of any snippet
- \`register_snippet(...)\` - Save working code as a new snippet

### Using Snippets

Snippets are **regular tools** - call them directly like any other tool. No need to use \`execute_typescript\`.

### Creating New Snippets

When you write useful, reusable code with \`execute_typescript\`, register it:

\`\`\`typescript
// After verifying code works, call the register_snippet tool
register_snippet({
  name: 'compare_npm_packages',
  description: 'Compare download counts for multiple NPM packages',
  code: \`
    const { packages } = input;
    const results = await Promise.all(
      packages.map(pkg => external_getNpmDownloads({ package: pkg }))
    );
    return packages.map((pkg, i) => ({ package: pkg, downloads: results[i].downloads }))
      .sort((a, b) => b.downloads - a.downloads);
  \`,
  inputSchema: { 
    type: 'object', 
    properties: { packages: { type: 'array', items: { type: 'string' } } },
    required: ['packages']
  },
  outputSchema: {
    type: 'array',
    items: { type: 'object', properties: { package: { type: 'string' }, downloads: { type: 'number' } } }
  },
  usageHints: ['Use when comparing popularity of NPM packages'],
  dependsOn: [],
});
\`\`\`

**Important**: Newly registered snippets become available as tools on the **next message**, not immediately in the current conversation turn.
`
  }

  // Snippets as sandbox bindings (legacy mode)
  const snippetDocs = selectedSnippets
    .map((snippet) => {
      const inputExample = generateExampleFromSchema(snippet.inputSchema)
      const trustBadge =
        snippet.trustLevel === 'trusted'
          ? '✓ trusted'
          : snippet.trustLevel === 'provisional'
            ? '◐ provisional'
            : '○ untrusted'

      return `
### snippet_${snippet.name} [${trustBadge}]

${snippet.description}

${snippet.usageHints.map((h) => `- ${h}`).join('\n')}

**Input Schema:**
\`\`\`json
${JSON.stringify(snippet.inputSchema, null, 2)}
\`\`\`

**Output Schema:**
\`\`\`json
${JSON.stringify(snippet.outputSchema, null, 2)}
\`\`\`

**Example:**
\`\`\`typescript
const result = await snippet_${snippet.name}(${inputExample});
\`\`\`
`
    })
    .join('\n---\n')

  // Generate type stubs for selected snippets
  const typeStubs = generateSnippetTypes(selectedSnippets)

  return `## Snippet Library

${selectedSnippets.length} snippet${selectedSnippets.length === 1 ? '' : 's'} pre-loaded for this conversation (${totalSnippetCount} total in library).

### Pre-loaded Snippets

These are available as \`snippet_*\` functions in your TypeScript code:

${snippetDocs}

### Type Definitions

\`\`\`typescript
${typeStubs}
\`\`\`

### Snippet Management Tools

- \`search_snippets(query, limit?)\` - Find additional snippets not pre-loaded
- \`get_snippet(name)\` - Get full details of any snippet
- \`register_snippet(...)\` - Save working code as a new snippet

### Using Snippets

Snippets work just like \`external_*\` functions inside \`execute_typescript\`:

\`\`\`typescript
// Call a pre-loaded snippet
const stats = await snippet_fetch_github_stats({ owner: 'tanstack', repo: 'query' });

// Compose snippets with external tools
const repos = await external_searchRepositories({ query: 'react state' });
const detailed = await Promise.all(
  repos.items.slice(0, 5).map(r => 
    snippet_fetch_github_stats({ owner: r.owner.login, repo: r.name })
  )
);
\`\`\`

### Creating New Snippets

When you write useful, reusable code, register it:

\`\`\`typescript
// After verifying code works, call the register_snippet tool
register_snippet({
  name: 'compare_npm_packages',
  description: 'Compare download counts for multiple NPM packages',
  code: \`
    const { packages } = input;
    const results = await Promise.all(
      packages.map(pkg => external_getNpmDownloads({ package: pkg }))
    );
    return packages.map((pkg, i) => ({ package: pkg, downloads: results[i].downloads }))
      .sort((a, b) => b.downloads - a.downloads);
  \`,
  inputSchema: { 
    type: 'object', 
    properties: { packages: { type: 'array', items: { type: 'string' } } },
    required: ['packages']
  },
  outputSchema: {
    type: 'array',
    items: { type: 'object', properties: { package: { type: 'string' }, downloads: { type: 'number' } } }
  },
  usageHints: ['Use when comparing popularity of NPM packages'],
  dependsOn: [],
});
\`\`\`

**Important**: Newly registered snippets become available as tools on the **next message**, not immediately in the current conversation turn.
`
}
