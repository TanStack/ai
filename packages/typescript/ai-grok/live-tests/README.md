# Grok Adapter Live Tests

Live integration tests for the Grok adapter against xAI's `/v1/responses` API.

## Setup

1. Create a `.env.local` file in this directory with your xAI API key:

```
XAI_API_KEY=xai-...
# Optional, only needed for file_search / collections_search live tests
XAI_VECTOR_STORE_ID=vs_...
```

2. Install dependencies from the workspace root:

```bash
pnpm install
```

## Running Tests

Run individual tests:

```bash
pnpm test              # Basic streaming chat
pnpm test:tools        # Tool calling with required parameters
pnpm test:tools-optional  # Tool calling with optional parameters
pnpm test:tools-empty  # Tool calling with empty object schema
pnpm test:structured   # Structured output (JSON Schema)
pnpm test:reasoning    # Reasoning events + encrypted content
pnpm test:multi-turn   # Multi-turn conversation
pnpm test:builtin-tools # Built-in web_search + x_search
pnpm test:server-tools  # code_execution, code_interpreter, file_search, collections_search
```

Run all tests:

```bash
pnpm test:all
```

## What's Tested

| Script | What it verifies |
| --- | --- |
| `streaming.ts` | AG-UI event lifecycle (RUN_STARTED, TEXT_MESSAGE_*, RUN_FINISHED) |
| `tool-test.ts` | Tool calls detected, function name captured, arguments parsed |
| `tool-test-optional.ts` | Optional tool parameters handled correctly |
| `tool-test-empty-object.ts` | Empty-schema tools work (e.g. "list all items") |
| `structured-output.ts` | `text.format` JSON Schema produces valid typed output |
| `reasoning.ts` | REASONING_* AG-UI events emitted, encrypted_content returned |
| `multi-turn.ts` | Assistant messages converted to Responses-API input correctly |
| `builtin-tools.ts` | Built-in server-side tool wiring for `web_search` and `x_search` |
| `server-tools.ts` | Additional server-side tools: `code_execution`, `code_interpreter`, `file_search`, `collections_search` |
