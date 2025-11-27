# TanStack AI E2E Tests

End-to-end tests for TanStack AI chat functionality using Playwright.

## Setup

1. Install dependencies:

```bash
pnpm install
```

2. Install Playwright browsers (required for running tests):

```bash
pnpm exec playwright install --with-deps chromium
```

Note: This is also run automatically via the `postinstall` script, but you may need to run it manually if the browsers weren't installed correctly.

3. Copy `.env.example` to `.env` and add your OpenAI API key:

```bash
cp .env.example .env
```

4. Edit `.env` and add your `OPENAI_API_KEY`.

## Running Tests

Run the tests:

```bash
pnpm test:e2e
```

Run tests with UI:

```bash
pnpm test:e2e:ui
```

## Development

Start the dev server:

```bash
pnpm dev
```

The app will be available at `http://localhost:3100`.

## Test Structure

The tests use a simplified chat interface with:

- Input field
- Submit button
- JSON messages display

Tests verify that:

1. The LLM responds correctly to prompts
2. Conversation context is maintained across multiple messages
3. Messages are properly structured in the JSON format
