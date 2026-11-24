---
'@tanstack/ai': minor
'@tanstack/ai-client': minor
'@tanstack/ai-react': minor
'@tanstack/ai-preact': minor
'@tanstack/ai-solid': minor
'@tanstack/ai-vue': minor
'@tanstack/ai-svelte': minor
'@tanstack/ai-angular': minor
'@tanstack/ai-remix': minor
'@tanstack/ai-octane': minor
'@tanstack/ai-persistence': minor
'@tanstack/ai-sandbox': minor
'@tanstack/ai-sandbox-cloudflare': minor
'@tanstack/ai-claude-code': minor
'@tanstack/ai-codex': minor
'@tanstack/ai-grok-build': minor
'@tanstack/ai-opencode': minor
'@tanstack/ai-acp': minor
'@tanstack/ai-harness': minor
---

Add typed activities that stay after a reload. An activity is a row in `messages` that the UI shows, for example a progress card or an approval prompt.

- `defineActivityType({ activityType, contentSchema })` in `@tanstack/ai` defines an activity type. A server tool sends a row with `context?.emitActivity?.(definition, id, content)`. A middleware sends a row with `ctx.emitActivity(definition, id, content)`. The schema checks the content, and a bad value throws a `TypeError`. Each call sends one `ACTIVITY_SNAPSHOT` that replaces the row with that `id`.
- `ChatMiddlewareContext` has a new required field, `emitActivity`. A middleware context that you build by hand, for example in a test, needs it.
- The rows and `CUSTOM` events that a middleware sends in `onFinish` or `onAbort` now go out before the last `RUN_FINISHED`. As a result, `onFinish` runs before that chunk. A consumer that stops at the last `RUN_FINISHED` of a completed run gets `onFinish`, not `onAbort`.
- `useChat`, `createChat`, `injectChat`, and `ChatClient` take an `activities` array. The array types the activity parts of `messages`. A check such as `part.activityType === 'sandbox.status'` narrows the content of a built-in type or of a type in the array. For another type, use `definition.is(part)`.
- `createChatUI` and `createChatHook` take an `activitiesComponents` map, keyed by activity type. Each component gets typed `ActivityProps`. A type with no entry uses `partsComponents.activity`. The message component (`MessageProps`) and `ChatUIMessages` also give typed activity parts. `selectChatUI` and `selectMessageUI` take these typed messages with no cast, and the selection keeps their activity types.
- `withPersistence` saves the activities each time that an activity changes during a run. As a result, a reload during the run shows the rows. A row that a middleware sends in `setup` is saved at once, so a reload during a sandbox boot shows the `starting` row. Before the run starts, each save first loads the stored rows and the stored messages, and puts the new rows after them. This is two more store reads. As a result, a reload shows each row after the user message of its run. A run that fails or stops before it starts keeps its rows. A regenerate removes the rows of the turn that it replaces, and keeps the rows that the new run saved before it started. A turn that ends with a tool call is not a regenerate when the client sends that tool call again under its own message id, so its rows stay. A failed save logs a warning, and the run continues. Before the run starts, a failed load skips the save. A failed load in `onConfig` stops the run, because a save without the stored rows would delete them.
- `withSandbox` sends a `sandbox.status` row with the status `starting`, then `ready` (with `sandboxId` and `resumed`). If the start throws or the user stops the run, the status is `failed`. On an attach to a durable run, `withSandbox` sends no row.
- When an action waits for a decision, the Claude Code, OpenCode, and ACP adapters deny the action for this run. Then they send a `sandbox.approval` row with the status `pending`. The next run sets the status to `granted` or `denied`. One decision covers one action: for Claude Code, the same command, or the same tool for other actions. For OpenCode, it is the same permission type and title. For ACP, it is the same kind, title, and files. `chat()` does not send an adapter `ACTIVITY_DELTA` that changes no row, so each decision reaches the client and the store once. `@tanstack/ai-sandbox` exports the builders `buildApprovalActivity` and `approvalDecisionActivities`.
- `ChatClient` and every binding (`useChat`, `createChat`, `injectChat`) have `respondToSandboxApproval(approvalId, granted)`. It sets the pending `sandbox.approval` row to `granted` or `denied`, then starts the next run. The SSE and HTTP stream requests carry the decided rows. That run has no new user message, so the Claude Code, OpenCode, and ACP adapters send the agent the text "The user answered your approval requests. Continue the task." `@tanstack/ai-sandbox` exports this step as `withApprovalContinuation(messages, approvals)`. `chat()` reads the decided rows from the request and from the saved rows, and gives the decisions to the adapter in `approvals`.
- A tool that runs through the sandbox tool bridge gets `context?.emitActivity` with the Claude Code, Codex, OpenCode, Grok Build, and ACP adapters.
- Fix: `ChatSandboxCoordinator` from `@tanstack/ai-sandbox-cloudflare/agent` did not give the tool bridge `emitCustomEvent`. As a result, the `CUSTOM` events of a bridged tool did not get to the run stream. It now gives the bridge `emitCustomEvent` and `emitActivity`.
- The harness keeps the activities in its session log. The session snapshot has them in `activities`. The session view has them in `state.activities`, live and after a reload. `SessionViewState` has a new required field, `activities`, so a view state that you build by hand needs it. The snapshot version is now `7`. An older snapshot still loads, with no activities. A durable compaction (`withCompaction({ durable: true })`) and the `/compact` command keep only the newest `sandbox.status` row of the session. A plugin does the same with `ctx.session.replaceTranscript(messages, { compaction: true })`. A view that is open keeps the old rows. A new view, for example after a reload, shows the change.

Deprecated: the `CUSTOM` events `sandbox.starting`, `sandbox.created`, `sandbox.resumed`, and `approval-requested`. TanStack AI still sends them, so a handler for them still works. Read the `sandbox.status` and `sandbox.approval` rows instead. A later breaking release removes these events.
