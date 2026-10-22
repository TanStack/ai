---
'@tanstack/ai-acp': major
'@tanstack/ai-angular': major
'@tanstack/ai-anthropic': major
'@tanstack/ai-bedrock': major
'@tanstack/ai-byteplus': major
'@tanstack/ai-claude-code': major
'@tanstack/ai-client': major
'@tanstack/ai-cloudflare': major
'@tanstack/ai-code-mode-snippets': major
'@tanstack/ai-code-mode': major
'@tanstack/ai-codex': major
'@tanstack/ai-cohere': major
'@tanstack/ai-compaction': major
'@tanstack/ai-computer-local': major
'@tanstack/ai-computer-playwright': major
'@tanstack/ai-computer-sandbox': major
'@tanstack/ai-computer-use': major
'@tanstack/ai-devtools-core': major
'@tanstack/ai-durable-stream': major
'@tanstack/ai-elevenlabs': major
'@tanstack/ai-event-client': major
'@tanstack/ai-fal': major
'@tanstack/ai-gemini': major
'@tanstack/ai-grok-build': major
'@tanstack/ai-grok': major
'@tanstack/ai-groq': major
'@tanstack/ai-isolate-cloudflare': major
'@tanstack/ai-isolate-daytona': major
'@tanstack/ai-isolate-e2b': major
'@tanstack/ai-isolate-node': major
'@tanstack/ai-isolate-quickjs-bun': major
'@tanstack/ai-isolate-quickjs': major
'@tanstack/ai-llmgateway': major
'@tanstack/ai-lovable': major
'@tanstack/ai-mcp': major
'@tanstack/ai-memory': major
'@tanstack/ai-mistral': major
'@tanstack/ai-octane': major
'@tanstack/ai-ollama': major
'@tanstack/ai-ollaya': major
'@tanstack/ai-openai': major
'@tanstack/ai-opencode': major
'@tanstack/ai-openrouter': major
'@tanstack/ai-perplexity': major
'@tanstack/ai-persistence': major
'@tanstack/ai-preact': major
'@tanstack/ai-react': major
'@tanstack/ai-reactor': major
'@tanstack/ai-remix': major
'@tanstack/ai-sandbox-blaxel': major
'@tanstack/ai-sandbox-boxd': major
'@tanstack/ai-sandbox-cloudflare': major
'@tanstack/ai-sandbox-daytona': major
'@tanstack/ai-sandbox-docker': major
'@tanstack/ai-sandbox-e2b': major
'@tanstack/ai-sandbox-local-process': major
'@tanstack/ai-sandbox-railway': major
'@tanstack/ai-sandbox-sprites': major
'@tanstack/ai-sandbox-upstash-box': major
'@tanstack/ai-sandbox-vercel': major
'@tanstack/ai-sandbox': major
'@tanstack/ai-skills': major
'@tanstack/ai-solid': major
'@tanstack/ai-svelte': major
'@tanstack/ai-typesafe': major
'@tanstack/ai-utils': major
'@tanstack/ai-vercel-gateway': major
'@tanstack/ai-vertex': major
'@tanstack/ai-vue': major
'@tanstack/ai-worldlabs': major
'@tanstack/ai': major
'@tanstack/openai-base': major
'@tanstack/preact-ai-devtools': major
'@tanstack/react-ai-devtools': major
'@tanstack/solid-ai-devtools': major
'@tanstack/svelte-ai-devtools': major
---

TanStack AI 1.0.0. This release removes every API that was deprecated in 0.x. Read the upgrade guide before you upgrade: https://tanstack.com/ai/latest/docs/migration/v1

- Removed all `@deprecated` exports, options, fields, and type aliases. Each one has a replacement that already shipped in 0.x.
- Removed `addToolApprovalResponse()` from `ChatClient` and every chat hook. Resolve the bound `tool-approval` interrupt with `resolveInterrupt` instead. The devtools event `tools:approval:responded` is also removed.
- Removed the old wire formats: the CUSTOM `approval-requested` and `tool-input-available` events, the `[DONE]` SSE line, the `data` copy of `forwardedProps`, pre-binding interrupt descriptors and their `approval_required` and `client_tool_input` reasons, and the STEP events that adapters sent next to `REASONING_*` events. Use a 1.0 client with a 1.0 server.
- Removed the `toolName` alias from `TOOL_CALL_START` chunks. Read `toolCallName` instead.
- `threadId` is now required on `useChat` and every other chat hook, `ChatClient`, the generation hooks and clients, `chat()`, `summarize()`, the generation functions, `codeModeWithSnippets()`, `selectRelevantSnippets()`, `CompactionContext`, and `SummarizeInput`. TanStack AI no longer makes a thread id for you. Pass a stable id for each conversation. `createChatHook` factory options no longer take `threadId`: pass it on each hook call. Octane generation hooks take `threadId` instead of `id`. `@tanstack/ai-sandbox` removes `resolveDurableThreadId` and `DurableThreadIdRequiredError`.
- The published `@tanstack/ai-octane/ui` types are now strict. `UI.Messages`, `UI.Message`, `UI.Part`, and `UI.Interrupts` type their render children. `ToolProps` types `part.input` and `part.output` for the named tool. `toolsComponents` and `interruptsComponents` are required when the chat options declare tools or named interrupts. Code that relied on the old loose types can fail to compile.
- A connection adapter's `connect()` and `send()` need the run context (with `threadId`) as their fourth argument. `ChatClient` and the generation clients pass it.
- `@tanstack/ai-sandbox`: `createToolBridgeCore()`, `startHostToolBridge()`, a `ToolBridgeProvisioner`, and `executeHostTool()` take a required `threadId`. Bridged tools get it in their context.
- `@tanstack/ai-sandbox`: the harness tool bridge and `executeHostTool()` refuse a tool with `needsApproval`. Before, the tool ran with no approval. Remove `needsApproval`, or run the tool with an HTTP adapter.
- `stream()` and `rpcStream()` pass the AG-UI `RunAgentInput` for the run as the fourth factory argument, the same body the HTTP adapters send. Read it on the server with `chatParamsFromRequestBody()` or `generationParamsFromBody()`, so `threadId`, `runId`, and interrupt `resume` reach a server function. `RunAgentInput` is exported from `@tanstack/ai/client`.
- A generation `fetcher` gets `threadId` and `runId` in its second argument, next to `signal` and `headers`. Pass them to the server generation call.
- `generationParamsFromBody()` and `generationParamsFromRequest()` read the generation input from `forwardedProps`. A server that reads `body.data` gets `undefined`. Read `body.forwardedProps` instead. They also require `threadId` and `runId` and return them as strings, the same as `chatParamsFromRequestBody()` and the AG-UI `RunAgentInput`. A body that holds only the input is rejected.
- Removed the readers for data saved in old 0.x formats (old Cloudflare run-log records, a bare `UIMessage[]` from client persistence, artifact records without `blobKey`).
- Removed provider models that are shut down.
- `@tanstack/ai-react-ui`, `@tanstack/ai-solid-ui`, and `@tanstack/ai-vue-ui` get no 1.0 release. Import from `@tanstack/ai-react/ui`, `@tanstack/ai-solid/ui`, or `@tanstack/ai-vue/ui`.
