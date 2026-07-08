import { generateSkillTypes } from './generate-skill-types'
import type { Skill } from './types'

interface CreateSkillsSystemPromptOptions {
  /**
   * Skills that were selected for this request
   */
  selectedSkills: Array<Skill>

  /**
   * Total number of skills in the library
   */
  totalSkillCount: number

  /**
   * Whether skills are exposed as direct tools (not just sandbox bindings)
   * @default true
   */
  skillsAsTools?: boolean
}

/**
 * Generate example input from a JSON Schema
 */
function generateExampleFromSchema(schema: Record<string, unknown>): string {
  if (schema.type === 'object' && schema.properties) {
    const props = schema.properties as Record<string, { type: string }>
    const example: Record<string, unknown> = {}

    for (const [key, value] of Object.entries(props)) {
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

/**
 * Create system prompt documentation for the skill library.
 * This is appended to the Code Mode system prompt.
 */
export function createSkillsSystemPrompt({
  selectedSkills,
  totalSkillCount,
  skillsAsTools = true,
}: CreateSkillsSystemPromptOptions): string {
  // No skills in library
  if (totalSkillCount === 0) {
    return `## Skill Library

You have access to a skill library for storing reusable code. The library is currently empty.

### Skill Management Tools

- \`search_skills(query, limit?)\` - Search for skills (currently empty)
- \`get_skill(name)\` - Get full skill details including code
- \`register_skill(...)\` - Save working code as a reusable skill

When you write useful, reusable code, consider registering it as a skill for future use.

**Important**: Newly registered skills become available as tools on the **next message**, not immediately in the current conversation turn.
`
  }

  // No skills selected for this conversation
  if (selectedSkills.length === 0) {
    return `## Skill Library

You have access to a persistent skill library with ${totalSkillCount} skill${totalSkillCount === 1 ? '' : 's'}. No skills were pre-loaded for this conversation based on context.

### Skill Management Tools

- \`search_skills(query, limit?)\` - Search for relevant skills
- \`get_skill(name)\` - Get full skill details including code
- \`register_skill(...)\` - Save working code as a reusable skill

When you write useful, reusable code, consider registering it as a skill for future use.

**Important**: Newly registered skills become available as tools on the **next message**, not immediately in the current conversation turn.
`
  }

  if (skillsAsTools) {
    // Skills are available as direct tools
    const skillToolDocs = selectedSkills
      .map((skill) => {
        const inputExample = generateExampleFromSchema(skill.inputSchema)
        const trustBadge =
          skill.trustLevel === 'trusted'
            ? '✓ trusted'
            : skill.trustLevel === 'provisional'
              ? '◐ provisional'
              : '○ untrusted'

        return `
### ${skill.name} [${trustBadge}]

${skill.description}

${skill.usageHints.map((h) => `- ${h}`).join('\n')}

**Input Schema:**
\`\`\`json
${JSON.stringify(skill.inputSchema, null, 2)}
\`\`\`

**Output Schema:**
\`\`\`json
${JSON.stringify(skill.outputSchema, null, 2)}
\`\`\`

**Example:**
Call the \`${skill.name}\` tool with: ${inputExample}
`
      })
      .join('\n---\n')

    return `## Skill Library

${selectedSkills.length} skill${selectedSkills.length === 1 ? '' : 's'} pre-loaded for this conversation (${totalSkillCount} total in library).

### Available Skill Tools

These skills are available as **direct tools** you can call (marked with [SKILL] in description):

${skillToolDocs}

### Skill Management Tools

- \`search_skills(query, limit?)\` - Find additional skills not pre-loaded
- \`get_skill(name)\` - Get full details of any skill
- \`register_skill(...)\` - Save working code as a new skill

### Using Skills

Skills are **regular tools** - call them directly like any other tool. No need to use \`execute_typescript\`.

### Creating New Skills

When you write useful, reusable code with \`execute_typescript\`, register it:

\`\`\`typescript
// After verifying code works, call the register_skill tool
register_skill({
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

**Important**: Newly registered skills become available as tools on the **next message**, not immediately in the current conversation turn.
`
  }

  // Skills as sandbox bindings (legacy mode)
  const skillDocs = selectedSkills
    .map((skill) => {
      const inputExample = generateExampleFromSchema(skill.inputSchema)
      const trustBadge =
        skill.trustLevel === 'trusted'
          ? '✓ trusted'
          : skill.trustLevel === 'provisional'
            ? '◐ provisional'
            : '○ untrusted'

      return `
### skill_${skill.name} [${trustBadge}]

${skill.description}

${skill.usageHints.map((h) => `- ${h}`).join('\n')}

**Input Schema:**
\`\`\`json
${JSON.stringify(skill.inputSchema, null, 2)}
\`\`\`

**Output Schema:**
\`\`\`json
${JSON.stringify(skill.outputSchema, null, 2)}
\`\`\`

**Example:**
\`\`\`typescript
const result = await skill_${skill.name}(${inputExample});
\`\`\`
`
    })
    .join('\n---\n')

  // Generate type stubs for selected skills
  const typeStubs = generateSkillTypes(selectedSkills)

  return `## Skill Library

${selectedSkills.length} skill${selectedSkills.length === 1 ? '' : 's'} pre-loaded for this conversation (${totalSkillCount} total in library).

### Pre-loaded Skills

These are available as \`skill_*\` functions in your TypeScript code:

${skillDocs}

### Type Definitions

\`\`\`typescript
${typeStubs}
\`\`\`

### Skill Management Tools

- \`search_skills(query, limit?)\` - Find additional skills not pre-loaded
- \`get_skill(name)\` - Get full details of any skill
- \`register_skill(...)\` - Save working code as a new skill

### Using Skills

Skills work just like \`external_*\` functions inside \`execute_typescript\`:

\`\`\`typescript
// Call a pre-loaded skill
const stats = await skill_fetch_github_stats({ owner: 'tanstack', repo: 'query' });

// Compose skills with external tools
const repos = await external_searchRepositories({ query: 'react state' });
const detailed = await Promise.all(
  repos.items.slice(0, 5).map(r => 
    skill_fetch_github_stats({ owner: r.owner.login, repo: r.name })
  )
);
\`\`\`

### Creating New Skills

When you write useful, reusable code, register it:

\`\`\`typescript
// After verifying code works, call the register_skill tool
register_skill({
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

**Important**: Newly registered skills become available as tools on the **next message**, not immediately in the current conversation turn.
`
}
