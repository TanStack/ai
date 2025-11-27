# OpenAI Adapter Live Tests

This directory contains live integration tests for the OpenAI adapter using the Responses API.

## Setup

1. Create a `.env.local` file in this directory with your OpenAI API key:

```
OPENAI_API_KEY=sk-...
```

2. Install dependencies from the workspace root:

```bash
pnpm install
```

## Running Tests

Run individual tests:

```bash
pnpm test              # Test with required parameters
pnpm test:optional     # Test with optional parameters
```

Run all tests:

```bash
pnpm test:all
```

## Test Scripts

### `tool-test.ts`

Tests tool calling with all required parameters. Verifies that:

- Tool calls are properly detected in the stream
- Function names are correctly captured
- Arguments are passed as JSON strings
- Tools can be executed with the parsed arguments

### `tool-test-optional.ts`

Tests tool calling with optional parameters. Verifies that:

- Tools with optional parameters work correctly
- The strict mode is disabled when not all parameters are required
- Default values can be applied for missing optional parameters

## Key Findings

The OpenAI Responses API has different behavior compared to the Chat Completions API:

1. **Strict Mode**: When `strict: true`, ALL properties must be in the `required` array
2. **Tool Metadata**: Function names come from `response.output_item.added` events, not from `response.function_call_arguments.done`
3. **Finish Reason**: The Responses API doesn't have a `finish_reason` field; it must be inferred from the output content
