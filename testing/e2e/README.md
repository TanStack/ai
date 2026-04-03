# TanStack AI E2E Tests

End-to-end tests for TanStack AI using Playwright and [llmock](https://github.com/CopilotKit/llmock) for deterministic LLM mocking.

**Architecture:** Playwright drives a TanStack Start app (`testing/e2e/`) which routes requests through provider adapters pointing at llmock. Fixtures define the mock responses. No real API keys needed.

**Features tested:** chat, one-shot-text, reasoning, multi-turn, tool-calling, parallel-tool-calls, tool-approval, structured-output, agentic-structured, multimodal-image, multimodal-structured, summarize, summarize-stream, image-gen, tts, transcription

**Providers tested:** openai, anthropic, gemini, ollama, groq, grok, openrouter

## 1. Quick Start

```bash
# Install dependencies
pnpm install

# Run all E2E tests
pnpm --filter @tanstack/ai-e2e test:e2e

# Run with Playwright UI (useful for debugging)
pnpm --filter @tanstack/ai-e2e test:e2e:ui

# Run a single spec
pnpm --filter @tanstack/ai-e2e test:e2e -- --grep "openai -- chat"
```

## 2. Recording a New Fixture

```bash
# 1. Set your API keys
export OPENAI_API_KEY=sk-...
export ANTHROPIC_API_KEY=sk-ant-...
# (add whichever providers you need)

# 2. Start the app in record mode
pnpm --filter @tanstack/ai-e2e record

# 3. Open the browser and navigate to the feature you want to record
#    e.g. http://localhost:3010/openai/tool-calling

# 4. Interact with the chat - type your message, wait for the response.
#    llmock proxies to the real API and saves the response as a fixture.

# 5. Find your recorded fixture in testing/e2e/fixtures/recorded/
#    Files are named: {provider}-{timestamp}-{uuid}.json

# 6. Stop the dev server (Ctrl+C)
```

## 3. Organizing the Recorded Fixture

Move from `recorded/` to the appropriate feature directory:

```bash
mv fixtures/recorded/openai-2026-04-03T*.json fixtures/tool-calling/my-new-scenario.json
```

Then edit the fixture to clean it up:

- **Simplify the `match` field** - use a short, unique `userMessage` that your test will send
- **Verify the `response`** - check that the content, toolCalls, or reasoning fields look correct
- **Remove provider-specific artifacts** - fixtures should be provider-agnostic

Example - before cleanup:

```json
{
  "fixtures": [
    {
      "match": {
        "userMessage": "Hey, I'm looking for a guitar...",
        "model": "gpt-4o"
      },
      "response": {
        "content": "I'd recommend checking out the Fender Stratocaster..."
      }
    }
  ]
}
```

After cleanup:

```json
{
  "fixtures": [
    {
      "match": { "userMessage": "recommend a blues guitar" },
      "response": {
        "content": "I'd recommend checking out the Fender Stratocaster..."
      }
    }
  ]
}
```

## 4. Writing the Test

```typescript
// In tests/tool-calling.spec.ts (or whichever spec fits)

test('calls getGuitars with category filter', async ({ page }) => {
  await page.goto(`/${provider}/tool-calling`)
  if (await isNotSupported(page)) {
    test.skip()
    return
  }

  // Send the exact message that matches your fixture
  await sendMessage(page, 'show me acoustic guitars')
  await waitForResponse(page)

  // Assert on what should appear in the UI
  const toolCalls = await getToolCalls(page)
  expect(toolCalls).toHaveLength(1)
  expect(toolCalls[0].name).toBe('getGuitars')

  const response = await getLastAssistantMessage(page)
  expect(response).toContain('acoustic')
})
```

## 5. Adding a New Feature

1. **Add the feature to `src/lib/features.ts`** - define tools, modelOptions, outputSchema
2. **Add the feature to `src/lib/feature-support.ts`** - mark which providers support it
3. **Add the feature to `tests/test-matrix.ts`** - so tests iterate over it
4. **Create a fixture directory** - `fixtures/my-new-feature/basic.json`
5. **Create a test spec** - `tests/my-new-feature.spec.ts`
6. **Update the UI if needed** - if the feature needs new UI beyond ChatUI, add a component

## 6. Adding a New Provider

1. **Add the adapter factory to `src/lib/providers.ts`**
2. **Add the provider to `src/lib/feature-support.ts`**
3. **Add the provider to `tests/test-matrix.ts`**
4. **No fixture changes needed** - fixtures are provider-agnostic
5. **Verify llmock supports the provider**

## 7. Fixture Matching Tips

- **`userMessage`** is the primary match key - use short, unique strings
- **`sequenceIndex`** is essential for multi-turn and tool-call flows
- **`tool`** matches when the model calls a specific tool
- **`model`** matches a specific model name - avoid unless needed (breaks provider-agnosticism)
- **`predicate`** is a custom function for complex matching - last resort
- Fixtures are matched in order - first match wins

## 8. Troubleshooting

- **Test times out waiting for response**: Check that `userMessage` in the fixture exactly matches what `sendMessage()` sends
- **Wrong fixture matched**: Make `userMessage` strings more specific or use `sequenceIndex`
- **"Not supported" shows unexpectedly**: Check `src/lib/feature-support.ts`
- **Fixture works for OpenAI but not Anthropic**: Remove `model` from match field
- **Recording doesn't capture the response**: Verify API key env var is set
