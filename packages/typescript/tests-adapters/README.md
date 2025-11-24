# Adapter Tests

This package contains simple tests for the four AI adapter libraries:
- `@tanstack/ai-anthropic`
- `@tanstack/ai-openai`
- `@tanstack/ai-gemini`
- `@tanstack/ai-ollama`

## Tests

- Chat (stream): Asks for the capital of France and checks for "Paris".
- Tools: Uses the `get_temperature` tool and checks for "70"/"seventy" and tool wiring.
- Approval: Requires approval for `addToCart` and ensures the tool executes once.
- chatCompletion: Non-streaming answer for the capital of France.
- Summarize: Summarizes a short paragraph about Paris.
- Embed: Generates embeddings for two short sentences.

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

The run ends with a compact grid showing which tests passed per adapter.

Note: `.env.local` takes precedence over `.env` if both exist.

## Environment Variables

- `ANTHROPIC_API_KEY` - Required for Anthropic tests
- `OPENAI_API_KEY` - Required for OpenAI tests
- `GEMINI_API_KEY` or `GOOGLE_API_KEY` - Required for Gemini tests
- `OLLAMA_MODEL` - Optional, defaults to "smollm" for Ollama tests
- `OLLAMA_SUMMARY_MODEL` - Optional override for summarize tests (defaults to `OLLAMA_MODEL`)
- `OLLAMA_EMBED_MODEL` - Optional override for embed tests (defaults to `nomic-embed-text`)

Tests will be skipped for adapters where the API key is not set.

## Debug Output

Each test run creates detailed debug files in the `output/` directory:
- `{adapter}-test1-chat-stream.json` - Debug info for chat stream
- `{adapter}-test2-temperature-tool.json` - Debug info for tool call
- `{adapter}-test3-approval-tool-flow.json` - Debug info for approval flow
- `{adapter}-test4-chat-completion.json` - Debug info for chatCompletion
- `{adapter}-test5-summarize.json` - Debug info for summarize
- `{adapter}-test6-embed.json` - Debug info for embed

Each debug file contains:
- Input messages and configuration
- All stream chunks received
- Tool definitions (for Test 2)
- Full response text
- Tool calls and results (for Test 2)
- Test results and any errors

These files help diagnose issues with tool calls and adapter behavior.
