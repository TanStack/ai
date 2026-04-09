# TanStack AI E2E Tests

End-to-end tests for TanStack AI using Playwright and [aimock](https://github.com/CopilotKit/aimock) for deterministic LLM mocking.

**Architecture:** Playwright drives a TanStack Start app (`testing/e2e/`) which routes requests through provider adapters pointing at aimock. Fixtures define mock responses. No real API keys needed. All scenarios (including tool execution flows) use aimock fixtures.

**Providers tested:** openai, anthropic, gemini, ollama, groq, grok, openrouter

## What's tested

### Provider-coverage tests (via aimock)

Each test iterates over supported providers using `providersFor('feature')`:

| Feature               | Providers | Spec file                             |
| --------------------- | --------- | ------------------------------------- |
| chat                  | 7         | `tests/chat.spec.ts`                  |
| one-shot-text         | 7         | `tests/one-shot-text.spec.ts`         |
| multi-turn            | 7         | `tests/multi-turn.spec.ts`            |
| structured-output     | 7         | `tests/structured-output.spec.ts`     |
| tool-calling          | 6         | `tests/tool-calling.spec.ts`          |
| parallel-tool-calls   | 5         | `tests/parallel-tool-calls.spec.ts`   |
| tool-approval         | 6         | `tests/tool-approval.spec.ts`         |
| agentic-structured    | 6         | `tests/agentic-structured.spec.ts`    |
| reasoning             | 3         | `tests/reasoning.spec.ts`             |
| multimodal-image      | 5         | `tests/multimodal-image.spec.ts`      |
| multimodal-structured | 5         | `tests/multimodal-structured.spec.ts` |
| summarize             | 6         | `tests/summarize.spec.ts`             |
| summarize-stream      | 6         | `tests/summarize-stream.spec.ts`      |
| image-gen             | 7         | `tests/image-gen.spec.ts`             |
| tts                   | 7         | `tests/tts.spec.ts`                   |
| transcription         | 7         | `tests/transcription.spec.ts`         |

### Tools-test page (via aimock)

14 deterministic scenarios covering tool execution flows:

| Spec file                                         | Tests | What it covers                                           |
| ------------------------------------------------- | ----- | -------------------------------------------------------- |
| `tests/tools-test/chat-flow.spec.ts`              | 5     | Text-only, server tool, client tool, tool call structure |
| `tests/tools-test/approval-flow.spec.ts`          | 6     | Approve, deny, sequential, parallel, mixed flows         |
| `tests/tools-test/client-tool.spec.ts`            | 5     | Single, sequential, parallel, triple, server+client      |
| `tests/tools-test/race-conditions.spec.ts`        | 8     | No blocking, no deadlocks, timing, mixed flows           |
| `tests/tools-test/server-client-sequence.spec.ts` | 5     | Server→client, parallel server, ordering                 |

### Advanced feature tests

| Spec file                      | What it covers                                            |
| ------------------------------ | --------------------------------------------------------- |
| `tests/abort.spec.ts`          | Stop button cancels in-flight generation                  |
| `tests/lazy-tools.spec.ts`     | `__lazy__tool__discovery__` discovers and uses lazy tools |
| `tests/custom-events.spec.ts`  | Server tool `emitCustomEvent` received by client          |
| `tests/middleware.spec.ts`     | `onChunk` transform, `onBeforeToolCall` skip              |
| `tests/error-handling.spec.ts` | Server RUN_ERROR, aimock error fixture                    |

## 1. Quick Start

```bash
# Install dependencies
pnpm install

# Run all E2E tests
pnpm --filter @tanstack/ai-e2e test:e2e

# Run with Playwright UI (useful for debugging)
pnpm --filter @tanstack/ai-e2e test:e2e:ui

# Run a specific spec
pnpm --filter @tanstack/ai-e2e test:e2e -- --grep "openai -- chat"

# Run only the tools-test specs
pnpm --filter @tanstack/ai-e2e test:e2e -- tests/tools-test/
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

# 4. Interact with the chat — type your message, wait for the response.
#    aimock proxies to the real API and saves the response as a fixture.

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

- **Simplify the `match` field** — use a short, unique `userMessage` with a `[feature]` prefix
- **Verify the `response`** — check that the content, toolCalls, or reasoning fields look correct
- **Remove provider-specific artifacts** — fixtures should be provider-agnostic

**Important:** aimock uses **substring matching** for `userMessage`. Always use a unique `[prefix]` to prevent collisions:

```json
{
  "fixtures": [
    {
      "match": { "userMessage": "[myfeature] describe the guitar" },
      "response": {
        "content": "The Fender Stratocaster is a versatile electric guitar..."
      }
    }
  ]
}
```

Existing prefixes: `[chat]`, `[oneshot]`, `[reasoning]`, `[multiturn-1]`, `[multiturn-2]`, `[toolcall]`, `[parallel]`, `[approval]`, `[structured]`, `[agentic]`, `[mmimage]`, `[mmstruct]`, `[summarize]`, `[imagegen]`, `[tts]`, `[transcription]`.

## 4. Writing the Test

Tests import from `./fixtures` (not `@playwright/test`) to get the aimock worker fixture:

```typescript
import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('my-feature')) {
  test.describe(`${provider} — my-feature`, () => {
    test('does the thing', async ({ page }) => {
      await page.goto(`/${provider}/my-feature`)

      await sendMessage(page, '[myfeature] describe the guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Stratocaster')
    })
  })
}
```

For tool-calling tests that use `sequenceIndex`, use `waitForAssistantText` instead of `waitForResponse` — the agentic loop produces multiple responses and `waitForResponse` returns after the first one:

```typescript
await sendMessage(page, '[toolcall] what guitars do you have in stock')
await waitForResponse(page)

const toolCalls = await getToolCalls(page)
expect(toolCalls[0].name).toBe('getGuitars')

// Wait for text response AFTER tool execution
await waitForAssistantText(page, 'Fender Stratocaster')
```

## 5. Adding a New Feature

1. **Add the feature to `src/lib/types.ts`** — add to the `Feature` union and `ALL_FEATURES` array
2. **Add the feature to `src/lib/features.ts`** — define tools, modelOptions
3. **Add the feature to `src/lib/feature-support.ts`** — mark which providers support it
4. **Add the feature to `tests/test-matrix.ts`** — mirror the support matrix
5. **Create a fixture directory** — `fixtures/my-new-feature/basic.json` with `[prefix]` userMessage
6. **Create a test spec** — `tests/my-new-feature.spec.ts` using `providersFor('my-new-feature')`

## 6. Adding a New Provider

1. **Add the adapter factory to `src/lib/providers.ts`** — use `createXxxChat(model, apiKey, { baseURL })` with `LLMOCK_OPENAI` or `LLMOCK_BASE` depending on SDK
2. **Add the provider to `src/lib/feature-support.ts`** — mark which features it supports
3. **Add the provider to `tests/test-matrix.ts`** — mirror the support matrix
4. **No fixture changes needed** — fixtures are provider-agnostic (aimock translates to correct wire format)
5. **Verify aimock supports the provider** — check [aimock docs](https://github.com/CopilotKit/aimock)

**SDK baseURL notes:**

- OpenAI, Grok: use `LLMOCK_OPENAI` (with `/v1`)
- Groq: use `LLMOCK_BASE` (SDK appends `/openai/v1/` internally)
- Anthropic, Ollama: use `LLMOCK_BASE`
- Gemini: use `httpOptions: { baseUrl: LLMOCK_BASE }`
- OpenRouter: use `serverURL: LLMOCK_OPENAI` (NOT `baseURL`)

## 7. Adding a Tool Test Scenario

For deterministic tool execution flows (client tools, approvals, race conditions):

1. **Add the scenario script to `src/lib/tools-test-scenarios.ts`** — define iterations with `content` and `toolCalls`
2. **Add tool definitions to `src/lib/tools-test-tools.ts`** if new tools are needed
3. **Update `getToolsForScenario` in `src/lib/tools-test-tools.ts`** — map scenario to tools
4. **Add to `SCENARIO_LIST`** — for the UI dropdown
5. **Create test in `tests/tools-test/`** — use helpers from `tests/tools-test/helpers.ts`

The tools-test page tracks events via `#test-metadata` data attributes and `#event-log-json` / `#tool-calls-json` script tags.

## 8. Adding a Middleware Test

1. **Add scenario fixture to `fixtures/middleware-test/`** — aimock fixture JSON
2. **Add middleware to `src/routes/api.middleware-test.ts`** — new middleware mode
3. **Add test to `tests/middleware.spec.ts`** — select scenario + mode, verify observable effect

## 9. Fixture Matching Tips

- **`userMessage`** is the primary match key — uses **substring matching**, so always use unique `[prefix]` strings
- **`sequenceIndex`** tracks request count per match pattern — use for multi-step tool call flows. Reset happens automatically via `resetMatchCounts()` in the Playwright fixture
- **`tool`** matches when the model calls a specific tool
- **`model`** matches a specific model name — avoid (breaks provider-agnosticism)
- **`predicate`** is a custom function for complex matching — last resort
- Fixtures are matched in order — first match wins

## 10. Troubleshooting

- **Test times out waiting for response**: Check that `userMessage` in the fixture exactly matches what `sendMessage()` sends (including the `[prefix]`)
- **Wrong fixture matched**: Two fixtures have overlapping `userMessage` substrings. Make prefixes more specific.
- **Tool test returns wrong response**: `sequenceIndex` counter may be stale. The Playwright fixture calls `resetMatchCounts()` before each test — make sure you import `test` from `./fixtures`, not `@playwright/test`
- **Fixture works for OpenAI but not Anthropic**: Fixtures are provider-agnostic. If matching on `model`, remove it.
- **Recording doesn't capture the response**: Verify API key env var is set for the provider you're testing
- **Port 4010 already in use**: Kill stale aimock process. Tests run sequentially (`workers: 1`) because aimock's `sequenceIndex` is a global counter.

## Architecture

```
testing/e2e/
├── src/
│   ├── routes/
│   │   ├── $provider/$feature.tsx    # Dynamic chat UI per provider+feature
│   │   ├── tools-test.tsx            # Tools test page with event tracking
│   │   ├── middleware-test.tsx        # Middleware test page
│   │   ├── api.chat.ts               # Chat endpoint → aimock
│   │   ├── api.tools-test.ts         # Tools endpoint → aimock
│   │   └── api.middleware-test.ts     # Middleware endpoint → aimock + middleware
│   ├── lib/
│   │   ├── providers.ts              # Provider → adapter factory (baseURL → aimock)
│   │   ├── features.ts               # Feature → config (tools, modelOptions)
│   │   ├── feature-support.ts        # Provider × feature support matrix
│   │   ├── (fixtures in fixtures/tools-test/)
│   │   └── tools-test-tools.ts       # Server + client tool definitions
│   └── components/
│       └── ChatUI.tsx                # Chat interface with stop button
├── fixtures/                         # aimock fixture JSON files
├── tests/
│   ├── fixtures.ts                   # Playwright worker fixture (aimock + resetMatchCounts)
│   ├── helpers.ts                    # sendMessage, waitForResponse, etc.
│   ├── test-matrix.ts                # providersFor() — which providers support which features
│   ├── *.spec.ts                     # Provider-coverage tests
│   └── tools-test/                   # Tool execution flow tests
│       ├── helpers.ts                # selectScenario, runTest, getMetadata, etc.
│       └── *.spec.ts                 # Tool scenario tests
└── playwright.config.ts              # workers: 1, retries: 1, video: on
```
