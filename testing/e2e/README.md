# TanStack AI E2E Tests

End-to-end tests for TanStack AI using Playwright and [aimock](https://github.com/CopilotKit/aimock) for deterministic LLM mocking.

**Architecture:** Playwright drives a TanStack Start app (`testing/e2e/`) which routes requests through provider adapters pointing at aimock. Fixtures define mock responses. No real API keys needed. All scenarios (including tool execution flows) use aimock fixtures. Tests run in parallel with per-test `X-Test-Id` isolation.

**Providers tested:** openai, anthropic, gemini, vertex, vertex-grok, vertex-mistral, ollama, groq, grok, openrouter, openrouter-responses, vercel-gateway, vercel-gateway-responses, lovable, lovable-responses, bedrock, bedrock-responses, openai-compatible, openai-compatible-legacy, mistral, byteplus, elevenlabs, llmgateway, cloudflare

> **Claude Code (`@tanstack/ai-claude-code`) is excluded from the standard matrix.** It's a harness adapter that spawns the Claude Code runtime as a subprocess, so aimock's per-test `X-Test-Id` header isolation can't be injected into its requests. It's covered by unit tests in the package plus a gated live smoke test in `tests/claude-code.spec.ts` — run it with `CLAUDE_CODE_E2E=1` and an `ANTHROPIC_API_KEY` (or a local `claude login`).

## What's tested

### Provider-coverage tests

Each test iterates over supported providers using `providersFor('feature')`:

| Feature                  | Providers | Spec file                                |
| ------------------------ | --------- | ---------------------------------------- |
| chat                     | 7         | `tests/chat.spec.ts`                     |
| one-shot-text            | 7         | `tests/one-shot-text.spec.ts`            |
| multi-turn               | 7         | `tests/multi-turn.spec.ts`               |
| structured-output        | 7         | `tests/structured-output.spec.ts`        |
| structured-output-stream | 4         | `tests/structured-output-stream.spec.ts` |
| tool-calling             | 7         | `tests/tool-calling.spec.ts`             |
| parallel-tool-calls      | 6         | `tests/parallel-tool-calls.spec.ts`      |
| tool-approval            | 6         | `tests/tool-approval.spec.ts`            |
| text-tool-text           | 6         | `tests/text-tool-text.spec.ts`           |
| agentic-structured       | 7         | `tests/agentic-structured.spec.ts`       |
| reasoning                | 8         | `tests/reasoning.spec.ts`                |
| multimodal-image         | 5         | `tests/multimodal-image.spec.ts`         |
| multimodal-document      | 1         | `tests/multimodal-document.spec.ts`      |
| multimodal-structured    | 5         | `tests/multimodal-structured.spec.ts`    |
| summarize                | 6         | `tests/summarize.spec.ts`                |
| summarize-stream         | 6         | `tests/summarize-stream.spec.ts`         |
| image-gen                | 7         | `tests/image-gen.spec.ts`                |
| image-to-image           | 1         | `tests/image-to-image.spec.ts`           |
| image-to-video           | 1         | `tests/image-to-video.spec.ts`           |
| tts                      | 3         | `tests/tts.spec.ts`                      |
| transcription            | 3         | `tests/transcription.spec.ts`            |
| audio-gen                | 1         | `tests/audio-gen.spec.ts`                |
| video-understanding      | 1         | `tests/video-understanding.spec.ts`      |

### Tools-test page

Deterministic scenarios covering tool execution flows:

| Spec file                                         | Tests | What it covers                                           |
| ------------------------------------------------- | ----- | -------------------------------------------------------- |
| `tests/tools-test/chat-flow.spec.ts`              | 5     | Text-only, server tool, client tool, tool call structure |
| `tests/tools-test/approval-flow.spec.ts`          | 6     | Approve, deny, sequential, parallel, mixed flows         |
| `tests/tools-test/client-tool.spec.ts`            | 5     | Single, sequential, parallel, triple, server+client      |
| `tests/tools-test/race-conditions.spec.ts`        | 8     | No blocking, no deadlocks, timing, mixed flows           |
| `tests/tools-test/server-client-sequence.spec.ts` | 5     | Server→client, parallel server, ordering                 |

### Interrupt playground

Deterministic coverage of every AG-UI interrupt shape, ported from the
`ts-react-chat` wildlife example (route `/interrupts-test`, scenarios in
`src/lib/interrupt-scenario-tools.ts`). Each scenario isolates one interrupt
behavior — server/client × boolean, shared payload, branch payload, edited
args, plus a generic (non-tool) interrupt and batch sets — and is exercised
across allow / deny / cancel via both per-item (`interrupt.resolveInterrupt` /
`interrupt.cancel`) and root batch (`resolveInterrupts` / `cancelInterrupts`)
resolution.

| Spec file                                | Tests | What it covers                                                         |
| ---------------------------------------- | ----- | ---------------------------------------------------------------------- |
| `tests/interrupts-test/per-item.spec.ts` | 24    | Approve / deny / cancel each single scenario via the bound interrupt   |
| `tests/interrupts-test/generic.spec.ts`  | 2     | Generic interrupt resolve-with-payload and cancel                      |
| `tests/interrupts-test/batch.spec.ts`    | 5     | Root approve-all / deny-all / cancel-all, per-item, and mixed resolver |

Notes:

- Server tool results are **not** surfaced to the client as message parts, so
  server execution is asserted via the `approval-responded` state; server
  edited-args are verified through a `emitCustomEvent` echo.
- A shared `approvalSchema` requires a payload on the **deny** decision too, so
  those scenarios carry a `denyPayload`.

### Advanced feature tests

| Spec file                      | What it covers                                            |
| ------------------------------ | --------------------------------------------------------- |
| `tests/abort.spec.ts`          | Stop button cancels in-flight generation                  |
| `tests/lazy-tools.spec.ts`     | `__lazy__tool__discovery__` discovers and uses lazy tools |
| `tests/custom-events.spec.ts`  | Server tool `emitCustomEvent` received by client          |
| `tests/middleware.spec.ts`     | `onChunk` transform, `onBeforeToolCall` skip              |
| `tests/error-handling.spec.ts` | Server RUN_ERROR, aimock error fixture                    |
| `tests/tool-error.spec.ts`     | Tool throws error, agentic loop continues                 |

### Durable / detachable run tests

| Spec file                              | What it covers                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/delivery-durability.spec.ts`    | Transport layer: offset-tagged log, `Last-Event-ID` reconnect, second-tab join, SSE + NDJSON                                                                |
| `tests/persistence-durability.spec.ts` | Client layer: a browser refresh restores the conversation and any pending interrupt                                                                         |
| `tests/join-run-client-tool.spec.ts`   | Mid-run reload: `joinRun` replay that ends on a client tool drains the continuation (issue #1058)                                                           |
| `tests/sandbox-durability.spec.ts`     | Sandbox instances: a second run resumes the persisted sandbox                                                                                               |
| `tests/durable-takeover.spec.ts`       | Takeover with log alignment, detach-on-disconnect, out-of-band cancel in both bands, cancel-vs-disconnect divergence, and the superseded-driver epoch fence |

`durable-takeover.spec.ts` drives `/api/durable-takeover`, a provider-free harness
whose fake agent journal advances only on an explicit `?action=tick`, so every
disconnect happens at a known point in the stream. Two things to know before
extending it:

- **The disconnect is injected server-side** (`?action=drop`, a plain abort with
  no reason) — a genuine precondition, not a workaround. A client `fetch` abort
  does not propagate to the server through this app's dev server, so a test
  cannot otherwise produce a mid-stream socket close the run observes; the spec
  documents this in the `SseStream` comments (around lines 141-146).
- **`?action=seed` is also used, and is still legitimate**: it lets a test reach
  the cross-host takeover case — attaching from a process that never held the
  original connection — which a single test process cannot otherwise produce.
  A detached run's log now stays open for takeover: `RunDetachedCapability` and
  `packages/ai/src/delivery-detach.ts` carry the run's detach verdict to the
  sink, which skips both the synthetic `RUN_ERROR` and `durability.close()` for
  an unrequested disconnect on a detachable run. That path is pinned by
  `'a real disconnect, then an attach, continues the stream'` — a normal
  passing test, not a `test.fail()` case.

## What to add for your change

E2E coverage is mandatory for every feature, bug fix, or behavior change (see the root `CLAUDE.md`). Mirror of that table, kept in sync here:

| Change type                             | What E2E test to add                                                                                                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New provider adapter                    | Add provider to `feature-support.ts` + `test-matrix.ts`. Existing feature tests auto-run.                                                                                                                  |
| New feature (e.g., new generation type) | Add feature to types, feature config, support matrix. Create fixture + spec file.                                                                                                                          |
| Bug fix in chat/streaming               | Add a test case to `chat.spec.ts` or `tools-test/` that reproduces the bug.                                                                                                                                |
| Tool system change                      | Add scenario to `tools-test-scenarios.ts` + test in `tools-test/` specs.                                                                                                                                   |
| Middleware change                       | Add test to `middleware.spec.ts` with appropriate scenario.                                                                                                                                                |
| Client-side change (useChat, etc.)      | Add test covering the observable behavior change.                                                                                                                                                          |
| joinRun + client-tool continuation      | Add a spec that reloads mid-run, tails with `joinRun`, and asserts the client-tool result POSTs after replay (see `tests/join-run-client-tool.spec.ts`).                                                   |
| Durable/detachable run + takeover       | Add a spec that disconnects mid-stream, reconnects with the same `runId`, and asserts the resumed stream continues from the aligned offset instead of restarting the agent.                                |
| Out-of-band cancel vs. plain disconnect | Add a case distinguishing `requestRunCancel`/`wasCancelRequested` (durable cancel — record ends `'aborted'`) from an unrequested disconnect on a detachable run (record stays `'running'`, resumable).     |
| New run-store backend                   | Run `runPersistenceConformance` from `packages/ai-persistence/src/testkit/` against it; it now pins `undefined` vs. explicit `false` on `cancelRequested` and absent vs. explicit `undefined` on `update`. |
| New sandbox provider                    | Run the journal conformance suite from `@tanstack/ai-sandbox/testkit` against it, using `makeFakeShellSpawn` (also from that testkit) to exercise the journal/claim/driver seam without a real sandbox.    |

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

Existing prefixes: `[chat]`, `[oneshot]`, `[reasoning]`, `[multiturn-1]`, `[multiturn-2]`, `[toolcall]`, `[parallel]`, `[approval]`, `[approval-deny]`, `[text-tool-text]`, `[structured]`, `[structured-stream]`, `[structured-stream-abort]`, `[agentic]`, `[mmimage]`, `[mmstruct]`, `[summarize]`, `[imagegen]`, `[tts]`, `[transcription]`, `[abort-test]`, `[error-test]`.

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

### Vertex (Gemini on Vertex AI)

`vertex` is the Gemini adapter with Vertex auth and the Vertex request path. It is not a new protocol.

The factory in `src/lib/providers.ts` calls `vertexText` with `vertexE2eConfig()` from `src/lib/vertex-e2e.ts`:

- `project` + `location` so `@google/genai` posts to `/v1/projects/{p}/locations/{l}/publishers/google/models/{m}:(generateContent|streamGenerateContent)`. aimock already serves that path.
- A dummy `googleAuthOptions.authClient` so the SDK does not look for Application Default Credentials in CI.
- `apiVersion: 'v1'`. The SDK default for Vertex is `v1beta1`, and aimock's Vertex handler only matches `/v1/…`.

Chat, tools, structured output, multimodal image, and summarize reuse the existing Gemini fixtures. Media, embedding, TTS, video, and Gemini Interactions stay off the Vertex row: those Gemini e2e mounts live under `/v1beta`, and Vertex uses a different path.

Claude on Vertex (`anthropicVertexText`) is not in this matrix. That SDK talks OAuth and a different Vertex URL that aimock does not mock.

### Vertex Grok and Vertex Mistral

`vertex-grok` is the Grok Responses adapter with Vertex auth. The factory in `src/lib/providers.ts` calls `grokVertexText` with:

- `baseURL` pointed at aimock `/v1`, so the OpenAI client posts `/v1/responses` like the xAI Grok row
- a dummy `authClient` so the factory does not look for Application Default Credentials
- the factory still prefixes the wire model with `xai/`

`vertex-mistral` is the Mistral chat adapter with Vertex auth. The factory calls `mistralVertexText` with `resolveRequestUrl` pointed at aimock `/v1/chat/completions`. That skips the Vertex publisher `:rawPredict` rewrite.

Both rows reuse the existing Grok and Mistral fixtures. Image, TTS, transcription, and embedding stay off these rows.

### Bedrock Converse coverage gap

The `bedrock` and `bedrock-responses` providers in this matrix use `createBedrockText` with a `baseURL` pointing at aimock — they speak Bedrock's **OpenAI-compatible** endpoint, which aimock's OpenAI replay handles fine.

The default `bedrock-converse` adapter (introduced later) uses `@aws-sdk/client-bedrock-runtime` and speaks AWS's **binary event-stream (`vnd.amazon.eventstream`) Converse protocol**, which `@copilotkit/aimock` does not currently mock. Adding `bedrock-converse` to the live matrix would fail without a Converse-capable aimock provider.

**Coverage today:** the Converse translation layer (message converter, tool converter, stream processor, structured output, adapter) is covered by unit tests in `packages/ai-bedrock/tests/converse/` (64 tests). The OpenAI-compatible `bedrock` and `bedrock-responses` entries remain in the E2E matrix as-is.

**Follow-up:** a Bedrock/Converse provider will be added to aimock to close this gap and enable full E2E coverage of the Converse path.

### BytePlus (Ark) path handling and record-mode gap

BytePlus splits across two products, and the E2E wiring reflects that split:

- **Ark** (chat, Seedream image, Seedance video) serves everything under `/api/v3`, so the chat, image and video adapters get `baseURL: <mock>/api/v3`.
- **Seed Speech** (TTS, ASR) is a separate host with a separate key, and its adapters append `/api/v3/...` themselves — so they get the bare `<mock>` base.

Chat and image need **no mock changes**. aimock's compat-path normalizer rewrites any non-`/v1/`, non-`/v2/` path ending in a known OpenAI suffix to `/v1/<suffix>`, so `/api/v3/chat/completions` and `/api/v3/images/generations` land on the native handlers and the provider-agnostic fixtures apply unchanged. Seedream's request body differs from OpenAI's (`size` as a `1K`/`2K` token, no `n`, `watermark`), but aimock's image handler only reads `model` and `prompt` and answers with the `{ created, data: [...] }` envelope Seedream also returns.

Three endpoints have no aimock equivalent and are mounted in `global-setup.ts`, all on the `/api/v3` prefix — each returns `false` for paths it doesn't own so chat and image still fall through:

- `byteplusSeedanceMount()` — `POST`/`GET /contents/generations/tasks[/{id}]`
- `byteplusTTSMount()` — `POST /tts/create`
- `byteplusASRMount()` — `POST /auc/bigmodel/recognize/flash`

**Record-mode gap:** aimock's `RecordProviderKey` union has no `byteplus` entry, so `pnpm record` can't proxy `ark.ap-southeast.bytepluses.com` or the Seed Speech host to capture real fixtures — the same situation as the Bedrock Converse gap above. Chat features reuse the existing provider-agnostic fixtures (aimock matches on message content, not provider); the media endpoints are served by the hand-written mounts listed above. Update those mounts by hand if the wire shapes change, and cross-check against the adapter unit tests in `packages/ai-byteplus/tests/`.

**SDK baseURL notes:**

- OpenAI, Grok: `LLMOCK_OPENAI` (with `/v1`) + `defaultHeaders`
- Groq: `LLMOCK_BASE` (SDK appends `/openai/v1/` internally) + `defaultHeaders`
- Anthropic: `LLMOCK_BASE` + `defaultHeaders`
- Gemini: `httpOptions: { baseUrl: LLMOCK_BASE, headers }`
- Vertex: `vertexE2eConfig(LLMOCK_BASE, headers)` (`project` + `location` + dummy auth + `apiVersion: 'v1'`)
- Vertex Grok: `grokVertexText` with `baseURL: LLMOCK_OPENAI`, dummy `authClient`, and `defaultHeaders`
- Vertex Mistral: `mistralVertexText` with `resolveRequestUrl` → `LLMOCK_BASE/v1/chat/completions`, dummy `authClient`, and `defaultHeaders`
- Ollama: `{ host: LLMOCK_BASE, headers }` (config object)
- OpenRouter: `serverURL` with `?testId=` query param (SDK doesn't support headers)
- BytePlus: `LLMOCK_BASE + /api/v3` + `defaultHeaders` for Ark (chat, image, video); bare `LLMOCK_BASE` + `defaultHeaders` for Seed Speech (TTS, ASR)

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
