# Anthropic Live Tests

These tests verify that the Anthropic adapter correctly handles tool calling with various parameter configurations.

## Setup

1. Create a `.env.local` file in this directory with your Anthropic API key:

   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

## Tests

### `tool-test-empty-object.ts`

Tests tools with empty object schemas (`z.object({})`). Verifies that:

- Tool calls are made correctly
- Arguments are normalized to `{}` (not empty strings)
- Tools execute successfully

### `tool-test.ts`

Tests tools with required parameters. Verifies that:

- Tool calls include all required parameters
- Arguments are valid JSON (not empty strings)
- Tools execute with correct arguments

## Running Tests

```bash
# Run all tests
pnpm test:all

# Run individual tests
pnpm test          # tool-test.ts
pnpm test:empty    # tool-test-empty-object.ts
```

## Expected Behavior

- **Arguments should NEVER be empty strings** - they should be:
  - `"{}"` for empty object schemas
  - Valid JSON strings for tools with parameters (e.g., `"{\"id\":\"1\"}"`)
