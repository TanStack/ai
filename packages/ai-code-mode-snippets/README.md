# @tanstack/ai-code-mode-snippets

Persistent snippet library for TanStack AI Code Mode - LLM-created reusable code snippets.

## Overview

The Snippets System extends Code Mode with persistent, LLM-creatable reusable code snippets. Snippets are TypeScript functions that the LLM can create, catalog, and invoke across sessions—enabling compounding capability over time.

## Installation

```bash
pnpm add @tanstack/ai-code-mode-snippets
```

## Usage

```typescript
import {
  codeModeWithSnippets,
  createAlwaysTrustedStrategy,
} from '@tanstack/ai-code-mode-snippets'
// Node-only file storage lives behind the `/storage` subpath so the root
// export stays safe for Worker/browser bundlers.
import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
import { createNodeIsolateDriver } from '@tanstack/ai-isolate-node'

// Create snippet storage
const snippetStorage = createFileSnippetStorage({
  directory: './.snippets',
  trustStrategy: createAlwaysTrustedStrategy(),
})

// Create code mode config
const codeModeConfig = {
  driver: createNodeIsolateDriver(),
  tools: allTools, // Your external tools
  timeout: 60000,
  memoryLimit: 128,
}

// Build a dynamic registry and system prompt with snippets
const { toolsRegistry, systemPrompt, selectedSnippets } =
  await codeModeWithSnippets({
    config: codeModeConfig,
    adapter: anthropic('claude-haiku-4-5'), // Cheap model for snippet selection
    snippets: {
      storage: snippetStorage,
      maxSnippetsInContext: 5,
    },
    messages,
  })

// Use in chat
const stream = chat({
  adapter: anthropic('claude-sonnet-4-6'), // Main model
  toolRegistry: toolsRegistry,
  messages,
  systemPrompts: [basePrompt, systemPrompt],
})
```

## Testing

This package includes a CLI for testing the snippets system. The tests verify the complete snippets lifecycle:

1. **First run (Snippet Creation)**: LLM uses `execute_typescript` to solve a problem and registers a reusable snippet
2. **Second run (Snippet Reuse)**: LLM calls the saved snippet directly without needing `execute_typescript`

### Running the Simulated Test

The simulated test uses a mock adapter with predetermined responses for fully deterministic testing. No API key required.

```bash
# From the package directory
cd packages/ai-code-mode-snippets

# Run the simulated test
pnpm test:cli:simulated
```

### Running the Live Test

The live test uses a real LLM (OpenAI or Anthropic) to verify the snippets flow with actual LLM responses.

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

### `codeModeWithSnippets(options)`

Creates Code Mode tools and system prompt with snippets integration.

**Options:**

- `config` - Code Mode tool configuration (driver, tools, timeout, memoryLimit)
- `adapter` - Text adapter for snippet selection (should be a cheap/fast model)
- `snippets.storage` - Snippet storage implementation
- `snippets.maxSnippetsInContext` - Maximum snippets to load into context (default: 5)
- `messages` - Current conversation messages
- `snippetsAsTools` - Whether to include snippets as direct tools (default: true)

**Returns:**

- `toolsRegistry` - Mutable `ToolRegistry` containing `execute_typescript`, snippet management tools, and selected snippet tools
- `systemPrompt` - System prompt documenting available snippets and external functions
- `selectedSnippets` - Snippets that were selected for this request

### Storage

The worker/browser-safe in-memory storage (`createMemorySnippetStorage`) is
re-exported from the root entry. The Node-only file storage
(`createFileSnippetStorage`) imports `node:fs` / `node:path`, so it is only
available from the `/storage` subpath — keeping the root export safe to import
from Cloudflare Workers and browser bundlers:

```typescript
// Worker/browser-safe — root export
import { createMemorySnippetStorage } from '@tanstack/ai-code-mode-snippets'

// Node-only — `/storage` subpath
import { createFileSnippetStorage } from '@tanstack/ai-code-mode-snippets/storage'
```

#### `createFileSnippetStorage(options)`

Git-friendly file-based storage:

```text
.snippets/
├── compare_react_state_libraries/
│   ├── meta.json      # Metadata, schemas, stats
│   └── code.ts        # TypeScript implementation
└── fetch_github_stats/
    ├── meta.json
    └── code.ts
```

#### `createMemorySnippetStorage(options)`

In-memory storage for testing.

### Trust Strategies

Snippets track execution success and promote trust levels over time:

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
