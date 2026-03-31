# @tanstack/ai-code-mode-skills

Persistent skill library for TanStack AI Code Mode - LLM-created reusable code snippets.

## Overview

The Skills System extends Code Mode with persistent, LLM-creatable reusable code snippets. Skills are TypeScript functions that the LLM can create, catalog, and invoke across sessions—enabling compounding capability over time.

## Installation

```bash
pnpm add @tanstack/ai-code-mode-skills
```

## Usage

```typescript
import {
  codeModeWithSkills,
  createFileSkillStorage,
  createAlwaysTrustedStrategy,
} from '@tanstack/ai-code-mode-skills'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'

// Create skill storage
const skillStorage = createFileSkillStorage({
  directory: './.skills',
  trustStrategy: createAlwaysTrustedStrategy(),
})

// Create code mode config
const codeModeConfig = {
  driver: createNodeIsolateDriver(),
  tools: allTools, // Your external tools
  timeout: 60000,
  memoryLimit: 128,
}

// Build a dynamic registry and system prompt with skills
const { registry, systemPrompt, selectedSkills } = await codeModeWithSkills({
  config: codeModeConfig,
  adapter: anthropic('claude-3-haiku'), // Cheap model for skill selection
  skills: {
    storage: skillStorage,
    maxSkillsInContext: 5,
  },
  messages,
})

// Use in chat
const stream = chat({
  adapter: anthropic('claude-sonnet-4-20250514'), // Main model
  toolRegistry: registry,
  messages,
  systemPrompts: [basePrompt, systemPrompt],
})
```

## Testing

This package includes a CLI for testing the skills system. The tests verify the complete skills lifecycle:

1. **First run (Skill Creation)**: LLM uses `execute_typescript` to solve a problem and registers a reusable skill
2. **Second run (Skill Reuse)**: LLM calls the saved skill directly without needing `execute_typescript`

### Running the Simulated Test

The simulated test uses a mock adapter with predetermined responses for fully deterministic testing. No API key required.

```bash
# From the package directory
cd packages/typescript/ai-code-mode-skills

# Run the simulated test
pnpm test:cli:simulated
```

### Running the Live Test

The live test uses a real LLM (OpenAI or Anthropic) to verify the skills flow with actual LLM responses.

#### Setup

1. Copy the environment example file:

   ```bash
   cp test-cli/env.example test-cli/.env.local
   ```

2. Edit `test-cli/.env.local` and add your API key:
   ```
   OPENAI_API_KEY=sk-...
   # or
   ANTHROPIC_API_KEY=sk-ant-...
   ```

#### Run the test

```bash
# Run with OpenAI (default)
pnpm test:cli:live

# Run with Anthropic
pnpm test:cli:live --provider anthropic

# Run with a specific model
pnpm test:cli:live --model gpt-4o-mini

# Run with verbose output
pnpm test:cli:live -v
```

### CLI Commands

```bash
# Show help
pnpm test:cli --help

# Run simulated test (deterministic, no API key)
pnpm test:cli simulated

# Run live test (requires API key)
pnpm test:cli live [options]

Options:
  --provider <provider>  LLM provider: openai or anthropic (default: openai)
  --model <model>        Model to use (default depends on provider)
  -v, --verbose          Enable verbose output
```

## API Reference

### `codeModeWithSkills(options)`

Creates Code Mode tools and system prompt with skills integration.

**Options:**

- `config` - Code Mode tool configuration (driver, tools, timeout, memoryLimit)
- `adapter` - Text adapter for skill selection (should be a cheap/fast model)
- `skills.storage` - Skill storage implementation
- `skills.maxSkillsInContext` - Maximum skills to load into context (default: 5)
- `messages` - Current conversation messages
- `skillsAsTools` - Whether to include skills as direct tools (default: true)

**Returns:**

- `registry` - Mutable `ToolRegistry` containing `execute_typescript`, skill management tools, and selected skill tools
- `systemPrompt` - System prompt documenting available skills and external functions
- `selectedSkills` - Skills that were selected for this request

### Storage

Storage is available from both the root export and the explicit storage subpath:

```typescript
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills'
// or
import { createFileSkillStorage } from '@tanstack/ai-code-mode-skills/storage'
```

#### `createFileSkillStorage(options)`

Git-friendly file-based storage:

```
.skills/
├── compare_react_state_libraries/
│   ├── meta.json      # Metadata, schemas, stats
│   └── code.ts        # TypeScript implementation
└── fetch_github_stats/
    ├── meta.json
    └── code.ts
```

#### `createMemorySkillStorage(options)`

In-memory storage for testing.

### Trust Strategies

Skills track execution success and promote trust levels over time:

| Trust Level   | Description                       |
| ------------- | --------------------------------- |
| `untrusted`   | Newly created, not yet proven     |
| `provisional` | 10+ executions with ≥90% success  |
| `trusted`     | 100+ executions with ≥95% success |

Available strategies:

- `createDefaultTrustStrategy()` - Earn trust through successful executions
- `createAlwaysTrustedStrategy()` - Trust immediately (dev/testing)
- `createRelaxedTrustStrategy()` - Faster promotion
- `createCustomTrustStrategy(options)` - Custom thresholds

## License

MIT
