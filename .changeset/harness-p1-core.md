---
'@tanstack/ai-harness': minor
'@tanstack/ai': minor
'@tanstack/ai-persistence': minor
---

New package `@tanstack/ai-harness`. `defineHarness` takes the same options as `chat()`, plus typed `agents`, `plugins`, and a `busy` policy. `createHarnessHost().open(harness, { threadId })` opens a long-lived session. A session runs chat turns with `prompt`, takes messages during a turn with `steer` and `followUp`, answers approvals with `resolve`, and cancels work with `cancel`. `session.agents.<name>.run(input)` runs a typed agent from code, and `start(input, { wake: true })` runs it in the background. Every operation streams AG-UI events with cursors. `definePlugin` adds tools, prompts, chat middleware, generation middleware, and agents, with capabilities that plugins provide to each other and resources that close with the session or the turn.

`@tanstack/ai` exports `CapabilityRegistry`, `runAgentStream`, `createSubagentId`, `compactForModel`, and the `SubagentsBag` type for harness hosts. `@tanstack/ai-persistence` adds the optional `inbox` store (`InboxStore`, `defineInboxStore`) that keeps accepted session inputs across restarts. The memory backend and the conformance testkit cover it.
