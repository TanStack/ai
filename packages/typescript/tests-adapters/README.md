# Adapter Tests

This package contains simple tests for the four AI adapter libraries:
- `@tanstack/ai-anthropic`
- `@tanstack/ai-openai`
- `@tanstack/ai-gemini`
- `@tanstack/ai-ollama`

## Tests

### Test 1: Capital of France
Sends "what is the capital of france" to the chat and verifies that the response contains "Paris".

### Test 2: Temperature Tool
Registers a simple tool that returns the current temperature (70 degrees), asks the AI what the temperature is, and verifies:
- Tool invocation is detected
- Tool result is received
- Response contains "70" or "seventy"

## Usage

1. Set up environment variables. You can either:
   - Create a `.env` or `.env.local` file (see `env.example`):
     ```bash
     ANTHROPIC_API_KEY=your_key
     OPENAI_API_KEY=your_key
     GEMINI_API_KEY=your_key
     OLLAMA_MODEL=smollm  # Optional, defaults to "smollm"
     ```
   - Or export them in your shell:
     ```bash
     export ANTHROPIC_API_KEY=your_key
     export OPENAI_API_KEY=your_key
     export GEMINI_API_KEY=your_key
     export OLLAMA_MODEL=smollm  # Optional, defaults to "smollm"
     ```

2. Run the tests:
   ```bash
   pnpm start
   ```

Note: `.env.local` takes precedence over `.env` if both exist.

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for Anthropic tests
- `OPENAI_API_KEY` - Required for OpenAI tests
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Required for Gemini tests
- `OLLAMA_MODEL` - Optional, defaults to "smollm" for Ollama tests

Tests will be skipped for adapters where the API key is not set.

## Debug Output

Each test run creates detailed debug files in the `output/` directory:
- `{adapter}-test1-capital-of-france.json` - Debug info for Test 1
- `{adapter}-test2-temperature-tool.json` - Debug info for Test 2

Each debug file contains:
- Input messages and configuration
- All stream chunks received
- Tool definitions (for Test 2)
- Full response text
- Tool calls and results (for Test 2)
- Test results and any errors

These files help diagnose issues with tool calls and adapter behavior.

