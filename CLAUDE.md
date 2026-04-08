# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

TanStack AI is a type-safe, provider-agnostic AI SDK for building AI-powered applications. The repository is a **pnpm monorepo** managed with **Nx** that includes TypeScript, PHP, and Python packages, plus multiple framework examples.

## Package Manager & Tooling

- **Package Manager**: pnpm@10.17.0 (required)
- **Build System**: Nx for task orchestration and caching
- **TypeScript**: 5.9.3
- **Testing**: Vitest for unit tests
- **Linting**: ESLint with custom TanStack config
- **Formatting**: Prettier

## Common Commands

### Testing

```bash
# Run all tests (full CI suite)
pnpm test

# Run tests for affected packages only (for PRs)
pnpm test:pr

# Run specific test suites
pnpm test:lib              # Run unit tests for affected packages
pnpm test:lib:dev          # Watch mode for unit tests
pnpm test:eslint           # Lint affected packages
pnpm test:types            # Type check affected packages
pnpm test:build            # Verify build artifacts with publint
pnpm test:coverage         # Generate coverage reports
pnpm test:knip             # Check for unused dependencies
pnpm test:sherif           # Check pnpm workspace consistency
pnpm test:docs             # Verify documentation links

# E2E tests (required for all changes)
pnpm --filter @tanstack/ai-e2e test:e2e    # Run E2E tests
pnpm --filter @tanstack/ai-e2e test:e2e:ui # Run with Playwright UI
```

### Testing Individual Packages

```bash
# Navigate to package directory and run tests
cd packages/typescript/ai
pnpm test:lib              # Run tests for this package
pnpm test:lib:dev          # Watch mode
pnpm test:types            # Type check
pnpm test:eslint           # Lint
```

### Building

```bash
# Build affected packages
pnpm build

# Build all packages
pnpm build:all

# Watch mode (build + watch for changes)
pnpm watch
pnpm dev  # alias for watch
```

### Code Quality

```bash
pnpm format                # Format all files with Prettier
```

### Changesets (Release Management)

```bash
pnpm changeset             # Create a new changeset
pnpm changeset:version     # Bump versions based on changesets
pnpm changeset:publish     # Publish to npm
```

## Architecture

### Monorepo Structure

```
packages/
├── typescript/           # TypeScript packages (main implementation)
│   ├── ai/              # Core AI library (@tanstack/ai)
│   ├── ai-client/       # Framework-agnostic chat client
│   ├── ai-react/        # React hooks (useChat)
│   ├── ai-solid/        # Solid hooks
│   ├── ai-svelte/       # Svelte integration
│   ├── ai-vue/          # Vue integration
│   ├── ai-openai/       # OpenAI adapter
│   ├── ai-anthropic/    # Anthropic/Claude adapter
│   ├── ai-gemini/       # Google Gemini adapter
│   ├── ai-ollama/       # Ollama adapter
│   ├── ai-devtools/     # DevTools integration
│   ├── react-ai-devtools/ # React DevTools component
│   └── solid-ai-devtools/ # Solid DevTools component
├── php/                 # PHP packages (future)
└── python/              # Python packages (future)

testing/
├── e2e/                 # E2E tests (Playwright + aimock) — MANDATORY for all changes
└── panel/               # Vendor integration panel

examples/                # Example applications
├── ts-react-chat/       # React chat example
├── ts-solid-chat/       # Solid chat example
├── ts-vue-chat/         # Vue chat example
├── ts-svelte-chat/      # Svelte chat example
├── ts-group-chat/       # Multi-user group chat
├── vanilla-chat/        # Vanilla JS example
├── php-slim/            # PHP Slim framework example
└── python-fastapi/      # Python FastAPI example
```

### Core Architecture Concepts

#### 1. Adapter System (Tree-Shakeable)

The library uses a **tree-shakeable adapter architecture** where each provider (OpenAI, Anthropic, Gemini, Ollama) exports multiple specialized adapters:

- **Text adapters** (`openaiText`, `anthropicText`) - Chat/completion
- **Embedding adapters** (`openaiEmbed`) - Text embeddings
- **Summarize adapters** (`openaiSummarize`) - Summarization
- **Image adapters** (`openaiImage`) - Image generation

Each adapter is a separate import to minimize bundle size:

```typescript
import { openaiText } from '@tanstack/ai-openai/adapters'
import { ai } from '@tanstack/ai'

const textAdapter = openaiText()
const result = ai({ adapter: textAdapter, model: 'gpt-4o', messages: [...] })
```

#### 2. Core Functions

The `@tanstack/ai` package provides core functions:

- **`ai()`** / **`generate()`** - Unified generation function for any adapter type
- **`chat()`** - Chat completion with streaming, tools, and agent loops
- **`embedding()`** - Generate embeddings
- **`summarize()`** - Summarize text
- Legacy adapters (monolithic, deprecated) use `openai()`, `anthropic()`, etc.

#### 3. Isomorphic Tool System

Tools are defined once with `toolDefinition()` and can have `.server()` or `.client()` implementations:

```typescript
const tool = toolDefinition({
  name: 'getTodos',
  inputSchema: z.object({ userId: z.string() }),
  outputSchema: z.array(z.object({ id: z.string(), title: z.string() })),
})

// Server implementation (runs on server)
const serverTool = tool.server(async ({ userId }) => db.todos.find({ userId }))

// Client implementation (runs in browser)
const clientTool = tool.client(async ({ userId }) =>
  fetch(`/api/todos/${userId}`),
)
```

#### 4. Framework Integrations

- **`@tanstack/ai-client`** - Headless chat state management with connection adapters (SSE, HTTP stream, custom)
- **`@tanstack/ai-react`** - `useChat` hook for React
- **`@tanstack/ai-solid`** - `useChat` hook for Solid
- **`@tanstack/ai-vue`** - Vue integration
- **`@tanstack/ai-svelte`** - Svelte integration

Each framework integration uses the headless `ai-client` under the hood.

#### 5. Type Safety Features

- **Per-model type safety** - Provider options are typed based on selected model
- **Multimodal content** - Type-safe image, audio, video, document support based on model capabilities
- **Zod schema inference** - Tools use Zod for runtime validation and type inference
- **`InferChatMessages`** - Type inference for message types based on tools and configuration

### Key Files & Directories

#### Core Package (`packages/typescript/ai/src/`)

- **`index.ts`** - Main exports (chat, embedding, summarize, toolDefinition, etc.)
- **`types.ts`** - Core type definitions (ModelMessage, ContentPart, StreamChunk, etc.)
- **`core/`** - Core functions (chat.ts, generate.ts, embedding.ts, summarize.ts)
- **`adapters/`** - Base adapter classes and interfaces
- **`tools/`** - Tool definition system and Zod converter
- **`stream/`** - Stream processing (StreamProcessor, chunking strategies, partial JSON parsing)
- **`utilities/`** - Helpers (message converters, agent loop strategies, SSE utilities)

#### Provider Adapters (e.g., `packages/typescript/ai-openai/src/`)

- **`index.ts`** - Exports tree-shakeable adapters (openaiText, openaiEmbed, etc.)
- **`adapters/`** - Individual adapter implementations (text.ts, embed.ts, summarize.ts, image.ts)
- **`model-meta.ts`** - Model metadata for type safety (provider options per model)
- **`openai-adapter.ts`** - Legacy monolithic adapter (deprecated)

## Development Workflow

### Adding a New Feature

1. Create a changeset: `pnpm changeset`
2. Make changes in the appropriate package(s)
3. **Add or update E2E tests** (see E2E Testing below) — this is mandatory for any feature, bug fix, or behavior change
4. Run tests: `pnpm test:lib` (or package-specific tests)
5. Run E2E tests: `pnpm --filter @tanstack/ai-e2e test:e2e`
6. Run type checks: `pnpm test:types`
7. Run linter: `pnpm test:eslint`
8. Format code: `pnpm format`
9. Verify build: `pnpm test:build` or `pnpm build`

### Working with Examples

Examples are not built by Nx. To run an example:

```bash
cd examples/ts-react-chat
pnpm install  # if needed
pnpm dev      # start dev server
```

### Nx Workspace

- Uses Nx affected commands to only test/build changed packages
- Nx caching speeds up builds and tests
- `nx.json` configures Nx behavior
- Use `nx run-many` to run commands across multiple packages

## Important Conventions

### Workspace Dependencies

- Use `workspace:*` protocol for internal package dependencies in `package.json`
- Example: `"@tanstack/ai": "workspace:*"`

### Tree-Shakeable Exports

When adding new functionality to provider adapters, create separate adapters rather than adding to monolithic ones. Export from `/adapters` subpath.

### Exports Field

Each package uses `exports` field in package.json for subpath exports (e.g., `@tanstack/ai/adapters`, `@tanstack/ai/event-client`)

### Testing Strategy

- Unit tests in `*.test.ts` files alongside source
- Uses Vitest with happy-dom for DOM testing
- Test coverage via `pnpm test:coverage`
- **E2E tests are mandatory** — see E2E Testing section below

### E2E Testing (REQUIRED)

**Every feature, bug fix, or behavior change MUST include E2E test coverage.** The E2E suite lives at `testing/e2e/` and uses Playwright + [aimock](https://github.com/CopilotKit/aimock) for deterministic LLM mocking.

```bash
# Run all E2E tests
pnpm --filter @tanstack/ai-e2e test:e2e

# Run with Playwright UI (for debugging)
pnpm --filter @tanstack/ai-e2e test:e2e:ui

# Run a specific spec
pnpm --filter @tanstack/ai-e2e test:e2e -- --grep "openai -- chat"

# Record real LLM responses as fixtures
OPENAI_API_KEY=sk-... pnpm --filter @tanstack/ai-e2e record
```

**What to add for your change:**

| Change type                             | What E2E test to add                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------- |
| New provider adapter                    | Add provider to `feature-support.ts` + `test-matrix.ts`. Existing feature tests auto-run. |
| New feature (e.g., new generation type) | Add feature to types, feature config, support matrix. Create fixture + spec file.         |
| Bug fix in chat/streaming               | Add a test case to `chat.spec.ts` or `tools-test/` that reproduces the bug.               |
| Tool system change                      | Add scenario to `tools-test-scenarios.ts` + test in `tools-test/` specs.                  |
| Middleware change                       | Add test to `middleware.spec.ts` with appropriate scenario.                               |
| Client-side change (useChat, etc.)      | Add test covering the observable behavior change.                                         |

**Guide:** See `testing/e2e/README.md` for full instructions on adding tests, recording fixtures, and troubleshooting.

### Documentation

- Docs are in `docs/` directory (Markdown)
- Auto-generated docs via `pnpm generate-docs` (TypeDoc)
- Link verification via `pnpm test:docs`

## Key Dependencies

### Core Runtime Dependencies

- `zod` - Schema validation (peer dependency)
- `@alcyone-labs/zod-to-json-schema` - Convert Zod schemas to JSON Schema for LLM tools
- `partial-json` - Parse incomplete JSON from streaming responses

### Provider SDKs (in adapter packages)

- `openai` - OpenAI SDK
- `@anthropic-ai/sdk` - Anthropic SDK
- `@google/generative-ai` - Gemini SDK
- `ollama` - Ollama SDK

### DevTools

- `@tanstack/devtools-event-client` - TanStack DevTools integration
