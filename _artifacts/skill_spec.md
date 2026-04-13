# TanStack AI — Skill Spec

TanStack AI is a type-safe, provider-agnostic AI SDK for building AI-powered applications. It provides chat completion, streaming, isomorphic tool calling, media generation, and code execution across React, Solid, Vue, Svelte, and Preact, with adapters for OpenAI, Anthropic, Gemini, Ollama, Grok, Groq, and OpenRouter.

## Domains

| Domain                          | Description                                                                    | Skills                                     |
| ------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------ |
| Building chat experiences       | End-to-end chat — server endpoints, streaming, client hooks, message rendering | chat-experience, structured-outputs        |
| Implementing tool calling       | Isomorphic tools, server/client execution, approval flows, lazy discovery      | tool-calling                               |
| Generating media content        | Image, video, TTS, transcription via activity-specific adapters                | media-generation                           |
| Executing LLM-generated code    | Code Mode sandbox setup, isolate drivers, skills system                        | code-mode                                  |
| Configuring adapters and models | Provider selection, type safety, model options, runtime switching              | adapter-configuration                      |
| Transport and protocol          | AG-UI protocol, SSE/HTTP stream, custom backend connections                    | custom-backend-integration, ag-ui-protocol |
| Extending behavior              | Middleware hooks for analytics, caching, observability                         | middleware                                 |

## Skill Inventory

| Skill                      | Type        | Domain             | What it covers                                                                        | Failure modes |
| -------------------------- | ----------- | ------------------ | ------------------------------------------------------------------------------------- | ------------- |
| chat-experience            | core        | chat-experiences   | chat(), useChat, streaming, SSE/HTTP responses, message formats, multimodal, thinking | 12            |
| tool-calling               | core        | tool-system        | toolDefinition(), .server()/.client(), approval, lazy discovery, rendering            | 6             |
| media-generation           | core        | media-generation   | generateImage/Video/Speech/Transcription, summarize, generation hooks                 | 4             |
| code-mode                  | core        | code-execution     | createCodeModeTool, isolate drivers, skills, client events                            | 4             |
| structured-outputs         | core        | chat-experiences   | outputSchema on chat(), schema conversion                                             | 3             |
| adapter-configuration      | core        | adapter-management | Provider adapters, modelOptions, type safety, extending, reasoning                    | 5             |
| custom-backend-integration | composition | transport-protocol | Custom ConnectionAdapter, SSE/HTTP stream connections                                 | 3             |
| ag-ui-protocol             | core        | transport-protocol | AG-UI events, StreamChunk types, SSE/NDJSON formats                                   | 3             |
| middleware                 | core        | extensibility      | Lifecycle hooks, tool caching, analytics, event firing                                | 3             |

## Failure Mode Inventory

### Chat Experience (12 failure modes)

| #   | Mistake                                                              | Priority | Source               | Cross-skill? |
| --- | -------------------------------------------------------------------- | -------- | -------------------- | ------------ |
| 1   | Using monolithic openai() instead of openaiText()                    | CRITICAL | migration guide      | —            |
| 2   | Using Vercel AI SDK patterns (streamText, generateText)              | CRITICAL | maintainer interview | —            |
| 3   | Using Vercel createOpenAI() provider pattern                         | CRITICAL | maintainer interview | —            |
| 4   | Using toResponseStream instead of toServerSentEventsResponse         | HIGH     | migration guide      | —            |
| 5   | Passing model as separate parameter to chat()                        | HIGH     | migration guide      | —            |
| 6   | Nesting temperature/maxTokens in options object                      | HIGH     | migration guide      | —            |
| 7   | Using providerOptions instead of modelOptions                        | HIGH     | migration guide      | —            |
| 8   | Implementing custom SSE stream instead of toServerSentEventsResponse | HIGH     | maintainer interview | —            |
| 9   | Implementing custom onEnd instead of middleware                      | HIGH     | maintainer interview | middleware   |
| 10  | Importing from @tanstack/ai-client instead of framework package      | HIGH     | maintainer interview | —            |
| 11  | Not handling RUN_ERROR events in streaming                           | MEDIUM   | docs                 | —            |

### Tool Calling (6 failure modes)

| #   | Mistake                                                       | Priority | Source           | Cross-skill?          |
| --- | ------------------------------------------------------------- | -------- | ---------------- | --------------------- |
| 1   | Missing @standard-schema/spec causes tool types to be unknown | CRITICAL | issue #235       | adapter-configuration |
| 2   | Not passing tool definitions to both server and client        | HIGH     | docs + interview | —                     |
| 3   | Multiple client tools stall in same round                     | HIGH     | issue #302       | —                     |
| 4   | Server tool output missing from UIMessage parts               | HIGH     | issue #176       | —                     |
| 5   | Anthropic null tool input stalling loops                      | HIGH     | issue #265       | adapter-configuration |
| 6   | Tool results always stringified, blocking multimodal          | MEDIUM   | issue #363       | —                     |

### Media Generation (4 failure modes)

| #   | Mistake                                                   | Priority | Source               | Cross-skill? |
| --- | --------------------------------------------------------- | -------- | -------------------- | ------------ |
| 1   | Using removed embedding() function                        | HIGH     | migration guide      | —            |
| 2   | Forgetting toServerSentEventsResponse with TanStack Start | HIGH     | maintainer interview | —            |
| 3   | Not downloading OpenAI image URLs before expiry           | MEDIUM   | docs                 | —            |
| 4   | Using stream:true for unsupported activities              | MEDIUM   | docs                 | —            |

### Code Mode (4 failure modes)

| #   | Mistake                                     | Priority | Source      | Cross-skill? |
| --- | ------------------------------------------- | -------- | ----------- | ------------ |
| 1   | Passing API keys/secrets to sandbox         | CRITICAL | docs        | —            |
| 2   | Not setting timeout for execution           | HIGH     | source code | —            |
| 3   | Node isolated-vm platform incompatibility   | HIGH     | source code | —            |
| 4   | Expecting identical behavior across drivers | MEDIUM   | docs        | —            |

### Structured Outputs (3 failure modes)

| #   | Mistake                                                            | Priority | Source               | Cross-skill? |
| --- | ------------------------------------------------------------------ | -------- | -------------------- | ------------ |
| 1   | Trying to implement provider-specific structured output strategies | HIGH     | maintainer interview | —            |
| 2   | Using convertSchemaToJsonSchema with ArkType                       | MEDIUM   | issue #276           | —            |
| 3   | Missing required array in OpenAI schema                            | MEDIUM   | source code          | —            |

### Adapter Configuration (5 failure modes)

| #   | Mistake                                                 | Priority | Source            | Cross-skill?                     |
| --- | ------------------------------------------------------- | -------- | ----------------- | -------------------------------- |
| 1   | Missing @standard-schema/spec makes all types any       | CRITICAL | issues #235, #191 | tool-calling, structured-outputs |
| 2   | Confusing legacy monolithic with tree-shakeable adapter | HIGH     | issue #407        | —                                |
| 3   | Ollama silently drops systemPrompts                     | HIGH     | issue #388        | —                                |
| 4   | Anthropic prompt caching fails on system prompts        | HIGH     | issue #379        | —                                |
| 5   | Wrong API key environment variable name                 | MEDIUM   | source code       | —                                |

### Custom Backend Integration (3 failure modes)

| #   | Mistake                                   | Priority | Source           | Cross-skill? |
| --- | ----------------------------------------- | -------- | ---------------- | ------------ |
| 1   | Providing both connect and subscribe+send | HIGH     | source assertion | —            |
| 2   | SSE browser connection limits             | MEDIUM   | docs             | —            |
| 3   | HTTP stream without reconnection          | MEDIUM   | docs             | —            |

### AG-UI Protocol (3 failure modes)

| #   | Mistake                                 | Priority | Source     | Cross-skill? |
| --- | --------------------------------------- | -------- | ---------- | ------------ |
| 1   | Message format doesn't match AG-UI spec | HIGH     | issue #311 | —            |
| 2   | Proxy buffering breaks SSE              | MEDIUM   | docs       | —            |
| 3   | Assuming fixed event sequence           | MEDIUM   | docs       | —            |

### Middleware (3 failure modes)

| #   | Mistake                                   | Priority | Source     | Cross-skill? |
| --- | ----------------------------------------- | -------- | ---------- | ------------ |
| 1   | Structured output runs outside middleware | HIGH     | issue #390 | —            |
| 2   | Trying to modify StreamChunks (read-only) | MEDIUM   | docs       | —            |
| 3   | Middleware exceptions breaking stream     | MEDIUM   | docs       | —            |

## Tensions

| Tension                              | Skills                                                      | Agent implication                                                                                   |
| ------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Type safety vs. quick prototyping    | adapter-configuration <-> chat-experience                   | Agents skip @standard-schema/spec and use dynamic model strings, silently losing all type safety    |
| Tree-shaking vs. API discoverability | adapter-configuration <-> chat-experience, media-generation | Agents import from package root or use wildcards, defeating bundle optimization                     |
| Server/client tool state asymmetry   | tool-calling <-> chat-experience                            | Agents build tool UI that checks part.output, working for client tools but failing for server tools |
| AG-UI protocol vs. internal format   | ag-ui-protocol <-> custom-backend-integration               | Agents use TanStack AI message format, breaking interop with standard AG-UI clients                 |

## Cross-References

| From                       | To                    | Reason                                                                                |
| -------------------------- | --------------------- | ------------------------------------------------------------------------------------- |
| chat-experience            | tool-calling          | Most chats include tools; tools need definitions on both server and client            |
| chat-experience            | adapter-configuration | Chat requires adapter selection; adapter choice affects available features            |
| chat-experience            | middleware            | Analytics, logging, and caching set up alongside chat                                 |
| tool-calling               | code-mode             | Code Mode is advanced alternative to tools for complex multi-step operations          |
| structured-outputs         | adapter-configuration | Just use outputSchema — but adapter choice determines internal strategy transparently |
| media-generation           | adapter-configuration | Each media activity requires a specific activity adapter                              |
| custom-backend-integration | ag-ui-protocol        | Custom backends must implement SSE or HTTP stream format                              |
| code-mode                  | chat-experience       | Code Mode always used on top of chat; requires handling custom events                 |

## Subsystems & Reference Candidates

| Skill                      | Subsystems                                                                                       | Reference candidates                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| media-generation           | Image (OpenAI, Gemini), Video (OpenAI), TTS (OpenAI, Gemini, ElevenLabs), Transcription (OpenAI) | —                                                                             |
| code-mode                  | Node.js isolated-vm, QuickJS WASM, Cloudflare Workers                                            | —                                                                             |
| adapter-configuration      | OpenAI, Anthropic, Gemini, Ollama, Grok, Groq, OpenRouter                                        | Model metadata (50+ models), Provider-specific modelOptions (10+ per adapter) |
| chat-experience            | —                                                                                                | —                                                                             |
| tool-calling               | —                                                                                                | —                                                                             |
| structured-outputs         | —                                                                                                | —                                                                             |
| custom-backend-integration | —                                                                                                | —                                                                             |
| ag-ui-protocol             | —                                                                                                | —                                                                             |
| middleware                 | —                                                                                                | —                                                                             |

## Remaining Gaps

| Skill                 | Question                                                                                                           | Status   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------ | -------- |
| chat-experience       | Recommended pattern for message persistence across page reloads?                                                   | open     |
| tool-calling          | Expected behavior when server tool throws — terminate loop or return error to LLM?                                 | open     |
| adapter-configuration | Is @standard-schema/spec intended as hard dep or peer dep? Silent degradation seems unintentional.                 | open     |
| ag-ui-protocol        | How much AG-UI spec compliance is intended? Message format divergence — design choice or known gap?                | open     |
| middleware            | Is structured output running outside middleware (#390) a known limitation or bug?                                  | open     |
| structured-outputs    | Should skill teach provider strategies? **Resolved:** always use outputSchema, adapter handles it.                 | resolved |
| chat-experience       | Import from ai-client or framework package? **Resolved:** always framework package, only ai-client for vanilla JS. | resolved |

## Key Rules from Maintainer Interview

These rules must be embedded in every relevant skill:

1. **Always import from framework package** (e.g., `@tanstack/ai-react`), never from `@tanstack/ai-client` — unless vanilla JS.
2. **Always use outputSchema on chat()** for structured outputs — never implement provider-specific strategies.
3. **Always ask the user which adapter and model** they want when implementing features — suggest the latest model.
4. **Always prompt the user about Code Mode** when they're building chat — it's an option they should know about.
5. **Tools must be passed to both server (chat()) and client (useChat/clientTools)** — this is the #1 implicit knowledge gap.

## Recommended Skill File Structure

- **Core skills:** chat-experience, tool-calling, media-generation, code-mode, structured-outputs, adapter-configuration, ag-ui-protocol, middleware
- **Framework skills:** None needed separately — framework-specific guidance folded into chat-experience and media-generation
- **Lifecycle skills:** None identified (no migration between major versions yet — library is pre-1.0)
- **Composition skills:** custom-backend-integration
- **Reference files:** adapter-configuration (model metadata, provider options)

## Composition Opportunities

| Library         | Integration points                                                           | Composition skill needed?                                                                     |
| --------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| TanStack Start  | Server functions with generation hooks (must use toServerSentEventsResponse) | No — documented within skills, but toServerSentEventsResponse is a critical integration point |
| React Router v7 | API routes for chat endpoints                                                | No — standard framework routing                                                               |
| Next.js         | API routes / App Router for chat endpoints                                   | No — standard framework routing                                                               |
| Zod             | Tool schemas, structured output schemas                                      | No — Zod is a core dependency, not a composition                                              |
