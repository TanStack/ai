# TanStack AI E2E Tests

End-to-end tests for TanStack AI using Playwright and [aimock](https://github.com/CopilotKit/aimock) for deterministic LLM mocking.

**Architecture:** Playwright drives a TanStack Start app (`testing/e2e/`) which routes requests through provider adapters pointing at aimock. Fixtures define mock responses. No real API keys needed. All scenarios (including tool execution flows) use aimock fixtures. Tests run in parallel with per-test `X-Test-Id` isolation.

**Providers tested:** openai, anthropic, gemini, ollama, groq, grok, openrouter

## What's tested

### Provider-coverage tests

Each test iterates over supported providers using `providersFor('feature')`:

| Feature               | Providers | Spec file                             |
| --------------------- | --------- | ------------------------------------- |
| chat                  | 7         | `tests/chat.spec.ts`                  |
| one-shot-text         | 7         | `tests/one-shot-text.spec.ts`         |
| multi-turn            | 7         | `tests/multi-turn.spec.ts`            |
| structured-output     | 7         | `tests/structured-output.spec.ts`     |
| tool-calling          | 7         | `tests/tool-calling.spec.ts`          |
| parallel-tool-calls   | 6         | `tests/parallel-tool-calls.spec.ts`   |
| tool-approval         | 6         | `tests/tool-approval.spec.ts`         |
| text-tool-text        | 6         | `tests/text-tool-text.spec.ts`        |
| agentic-structured    | 7         | `tests/agentic-structured.spec.ts`    |
| reasoning             | 3         | `tests/reasoning.spec.ts`             |
| multimodal-image      | 5         | `tests/multimodal-image.spec.ts`      |
| multimodal-structured | 5         | `tests/multimodal-structured.spec.ts` |
| summarize             | 6         | `tests/summarize.spec.ts`             |
| summarize-stream      | 6         | `tests/summarize-stream.spec.ts`      |
| image-gen             | 7         | `tests/image-gen.spec.ts`             |
| tts                   | 7         | `tests/tts.spec.ts`                   |
| transcription         | 7         | `tests/transcription.spec.ts`         |

### Tools-test page

Deterministic scenarios covering tool execution flows:

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
| `tests/tool-error.spec.ts`     | Tool throws error, agentic loop continues                 |

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

# 2. Start the app in record mode
pnpm --filter @tanstack/ai-e2e record

# 3. Navigate to the feature: http://localhost:3010/openai/tool-calling

# 4. Chat — aimock proxies to the real API and saves the fixture

# 5. Find it in testing/e2e/fixtures/recorded/

# 6. Stop the dev server (Ctrl+C)
```

## 3. Organizing the Recorded Fixture

Move from `recorded/` to the appropriate feature directory:

```bash
mv fixtures/recorded/openai-*.json fixtures/tool-calling/my-new-scenario.json
```

Clean up the fixture:

- **Simplify the `match` field** — use a unique `[prefix]` userMessage
- **Verify the `response`** — check content, toolCalls, or reasoning fields
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

Existing prefixes: `[chat]`, `[oneshot]`, `[reasoning]`, `[multiturn-1]`, `[multiturn-2]`, `[toolcall]`, `[parallel]`, `[approval]`, `[approval-deny]`, `[text-tool-text]`, `[structured]`, `[agentic]`, `[mmimage]`, `[mmstruct]`, `[summarize]`, `[imagegen]`, `[tts]`, `[transcription]`, `[abort-test]`, `[error-test]`.

## 4. Writing a Test

Tests import from `./fixtures` to get the `testId` and `aimockPort` for parallel isolation:

```typescript
import { test, expect } from './fixtures'
import {
  sendMessage,
  waitForResponse,
  getLastAssistantMessage,
  featureUrl,
} from './helpers'
import { providersFor } from './test-matrix'

for (const provider of providersFor('my-feature')) {
  test.describe(`${provider} — my-feature`, () => {
    test('does the thing', async ({ page, testId, aimockPort }) => {
      await page.goto(featureUrl(provider, 'my-feature', testId, aimockPort))

      await sendMessage(page, '[myfeature] describe the guitar')
      await waitForResponse(page)

      const response = await getLastAssistantMessage(page)
      expect(response).toContain('Stratocaster')
    })
  })
}
```

For tool tests that use `sequenceIndex`, use `waitForAssistantText` — the agentic loop produces multiple responses:

```typescript
await sendMessage(page, '[toolcall] what guitars do you have in stock')
await waitForResponse(page)

const toolCalls = await getToolCalls(page)
expect(toolCalls[0].name).toBe('getGuitars')

// Wait for text response AFTER tool execution
await waitForAssistantText(page, 'Fender Stratocaster')
```

## 5. Adding a New Feature

1. **Add to `src/lib/types.ts`** — `Feature` union + `ALL_FEATURES` array
2. **Add to `src/lib/features.ts`** — define tools, modelOptions
3. **Add to `src/lib/feature-support.ts`** — mark which providers support it
4. **Add to `tests/test-matrix.ts`** — mirror the support matrix
5. **Create fixture** — `fixtures/my-new-feature/basic.json` with `[prefix]` userMessage
6. **Create test spec** — `tests/my-new-feature.spec.ts` using `providersFor()`

## 6. Adding a New Provider

1. **Add adapter factory to `src/lib/providers.ts`** — with `defaultHeaders` for `X-Test-Id`
2. **Add to `src/lib/feature-support.ts`** — mark which features it supports
3. **Add to `tests/test-matrix.ts`** — mirror the support matrix
4. **No fixture changes needed** — aimock translates to correct wire format

**SDK baseURL notes:**

- OpenAI, Grok: `LLMOCK_OPENAI` (with `/v1`) + `defaultHeaders`
- Groq: `LLMOCK_BASE` (SDK appends `/openai/v1/` internally) + `defaultHeaders`
- Anthropic: `LLMOCK_BASE` + `defaultHeaders`
- Gemini: `httpOptions: { baseUrl: LLMOCK_BASE, headers }`
- Ollama: `{ host: LLMOCK_BASE, headers }` (config object)
- OpenRouter: `serverURL` with `?testId=` query param (SDK doesn't support headers)

## 7. Adding a Tool Test Scenario

1. **Create fixture** — `fixtures/tools-test/my-scenario.json` with `[my-scenario] run test` userMessage
2. **Add tool definitions to `src/lib/tools-test-tools.ts`** if new tools needed
3. **Update `getToolsForScenario`** — map scenario to tools
4. **Add to `SCENARIO_LIST`** — for the UI dropdown
5. **Create test** in `tests/tools-test/` — use helpers from `tests/tools-test/helpers.ts`

## 8. Adding a Middleware Test

1. **Create fixture** — `fixtures/middleware-test/my-scenario.json`
2. **Add middleware to `src/routes/api.middleware-test.ts`** — new mode
3. **Add test to `tests/middleware.spec.ts`**

## 9. Fixture Matching Tips

- **`userMessage`** — **substring matching**, always use unique `[prefix]` strings
- **`sequenceIndex`** — tracks request count per match pattern per `X-Test-Id`. Use for multi-step tool flows.
- **`tool`** — matches when the model calls a specific tool
- **`model`** — matches a specific model name (avoid — breaks provider-agnosticism)
- Fixtures are matched in order — first match wins

## 10. Troubleshooting

- **Test times out**: Check `userMessage` in fixture exactly matches `sendMessage()` (including `[prefix]`)
- **Wrong fixture matched**: Overlapping `userMessage` substrings. Make prefixes more specific.
- **Tool test wrong response**: `sequenceIndex` counter issue. Each test gets a unique `X-Test-Id` for isolation — make sure you import `test` from `./fixtures`, not `@playwright/test`
- **Fixture works for OpenAI but not Anthropic**: Remove `model` from match field
- **Port 4010 already in use**: Kill stale aimock process. aimock starts in `globalSetup` and lives for the entire test run.

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
│   │   ├── providers.ts              # Provider → adapter factory (X-Test-Id headers)
│   │   ├── features.ts               # Feature → config (tools, modelOptions)
│   │   ├── feature-support.ts        # Provider × feature support matrix
│   │   └── tools-test-tools.ts       # Server + client tool definitions
│   └── components/
│       └── ChatUI.tsx                # Chat interface with stop button + image rendering
├── fixtures/                         # aimock fixture JSON files (organized by feature)
├── test-assets/                      # Images for multimodal tests
├── global-setup.ts                   # Starts aimock on port 4010
├── global-teardown.ts                # Stops aimock
├── tests/
│   ├── fixtures.ts                   # Playwright fixture (testId + aimockPort)
│   ├── helpers.ts                    # sendMessage, waitForResponse, featureUrl, etc.
│   ├── test-matrix.ts                # providersFor() — which providers support which features
│   ├── *.spec.ts                     # Provider-coverage + advanced feature tests
│   └── tools-test/                   # Tool execution flow tests
│       ├── helpers.ts                # selectScenario, runTest, getMetadata, etc.
│       └── *.spec.ts                 # Tool scenario tests
└── playwright.config.ts              # fullyParallel: true, retries: 2, globalSetup/Teardown
```
