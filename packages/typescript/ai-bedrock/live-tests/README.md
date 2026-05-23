# Bedrock Live Tests

These tests verify that the Bedrock adapter correctly handles tool calling and multimodal inputs with various models (Nova, Claude).

## Setup

1. Create a `.env.local` file in this directory with your AWS credentials:

   ```
   AWS_ACCESS_KEY_ID=...
   AWS_SECRET_ACCESS_KEY=...
   AWS_REGION=us-east-1
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

## Tests

### `tool-test.ts`
Tests basic tool calling with Claude 3.5 Sonnet.

### `tool-test-nova.ts`
Tests Amazon Nova Pro with multimodal inputs (if applicable) and tool calling.

## Running Tests

```bash
# Run Claude tool test
pnpm test

# Run Nova tool test
pnpm test:nova
```
