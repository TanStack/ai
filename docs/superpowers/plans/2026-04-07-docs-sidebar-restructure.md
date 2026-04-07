# Docs Sidebar Restructure + Code Mode Client Integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the flat "Guides" sidebar into thematic sections, add the 3 existing code mode docs to the sidebar, and write a new client-integration page for code mode.

**Architecture:** Move all `docs/guides/*.md` files into new top-level folders (`tools/`, `chat/`, `code-mode/`, `media/`, `advanced/`, `migration/`). Update `sync-docs-config.ts` to recognize the new folders. Fix all cross-references. Write one new doc page.

**Tech Stack:** Markdown, TypeScript (sync script), pnpm

---

### Task 1: Create new folders and move files

**Files:**
- Create: `docs/tools/`, `docs/chat/`, `docs/code-mode/`, `docs/media/`, `docs/advanced/`, `docs/migration/`
- Move: all files from `docs/guides/` into the appropriate new folder
- Delete: `docs/guides/` (empty after moves)

- [ ] **Step 1: Create folders and move files**

```bash
# Create new folders
mkdir -p docs/tools docs/chat docs/code-mode docs/media docs/advanced docs/migration

# Tools section
mv docs/guides/tools.md docs/tools/
mv docs/guides/tool-architecture.md docs/tools/
mv docs/guides/server-tools.md docs/tools/
mv docs/guides/client-tools.md docs/tools/
mv docs/guides/tool-approval.md docs/tools/
mv docs/guides/lazy-tool-discovery.md docs/tools/

# Chat & Streaming section
mv docs/guides/agentic-cycle.md docs/chat/
mv docs/guides/streaming.md docs/chat/
mv docs/guides/connection-adapters.md docs/chat/
mv docs/guides/structured-outputs.md docs/chat/

# Code Mode section
mv docs/guides/code-mode.md docs/code-mode/
mv docs/guides/code-mode-with-skills.md docs/code-mode/
mv docs/guides/code-mode-isolates.md docs/code-mode/

# Media section
mv docs/guides/generations.md docs/media/
mv docs/guides/realtime-chat.md docs/media/
mv docs/guides/text-to-speech.md docs/media/
mv docs/guides/transcription.md docs/media/
mv docs/guides/image-generation.md docs/media/
mv docs/guides/video-generation.md docs/media/

# Advanced section
mv docs/guides/middleware.md docs/advanced/
mv docs/guides/observability.md docs/advanced/
mv docs/guides/multimodal-content.md docs/advanced/
mv docs/guides/per-model-type-safety.md docs/advanced/
mv docs/guides/runtime-adapter-switching.md docs/advanced/
mv docs/guides/tree-shaking.md docs/advanced/
mv docs/guides/extend-adapter.md docs/advanced/

# Migration section
mv docs/guides/migration.md docs/migration/
```

- [ ] **Step 2: Remove empty guides folder**

```bash
rmdir docs/guides
```

- [ ] **Step 3: Verify all files landed correctly**

```bash
ls docs/tools/ docs/chat/ docs/code-mode/ docs/media/ docs/advanced/ docs/migration/
```

Expected: Each folder contains only its designated `.md` files. `docs/guides/` no longer exists.

---

### Task 2: Renumber frontmatter `order` fields

Each file needs its `order` renumbered to be sequential within its new section (starting from 1).

**Files:**
- Modify: all moved `.md` files (frontmatter only)

- [ ] **Step 1: Update order fields in tools/ section**

| File | New order |
|------|-----------|
| `docs/tools/tools.md` | 1 |
| `docs/tools/tool-architecture.md` | 2 |
| `docs/tools/server-tools.md` | 3 |
| `docs/tools/client-tools.md` | 4 |
| `docs/tools/tool-approval.md` | 5 |
| `docs/tools/lazy-tool-discovery.md` | 6 |

- [ ] **Step 2: Update order fields in chat/ section**

| File | New order |
|------|-----------|
| `docs/chat/agentic-cycle.md` | 1 |
| `docs/chat/streaming.md` | 2 |
| `docs/chat/connection-adapters.md` | 3 |
| `docs/chat/structured-outputs.md` | 4 |

- [ ] **Step 3: Update order fields in code-mode/ section**

| File | New order |
|------|-----------|
| `docs/code-mode/code-mode.md` | 1 |
| `docs/code-mode/code-mode-with-skills.md` | 3 |
| `docs/code-mode/code-mode-isolates.md` | 4 |

Order 2 is reserved for the new `client-integration.md` page (Task 6).

- [ ] **Step 4: Update order fields in media/ section**

| File | New order |
|------|-----------|
| `docs/media/generations.md` | 1 |
| `docs/media/realtime-chat.md` | 2 |
| `docs/media/text-to-speech.md` | 3 |
| `docs/media/transcription.md` | 4 |
| `docs/media/image-generation.md` | 5 |
| `docs/media/video-generation.md` | 6 |

- [ ] **Step 5: Update order fields in advanced/ section**

| File | New order |
|------|-----------|
| `docs/advanced/middleware.md` | 1 |
| `docs/advanced/observability.md` | 2 |
| `docs/advanced/multimodal-content.md` | 3 |
| `docs/advanced/per-model-type-safety.md` | 4 |
| `docs/advanced/runtime-adapter-switching.md` | 5 |
| `docs/advanced/tree-shaking.md` | 6 |
| `docs/advanced/extend-adapter.md` | 7 |

- [ ] **Step 6: Update order field in migration/ section**

| File | New order |
|------|-----------|
| `docs/migration/migration.md` | 1 |

---

### Task 3: Fix cross-section internal links (guide-to-guide)

After the move, files that were in the same folder but are now in different folders have broken relative links. These need updating from `./target` to `../new-section/target`.

**Files:**
- Modify: doc files with cross-section links

- [ ] **Step 1: Fix links in tools/ that point to other sections**

| File | Old link | New link |
|------|----------|----------|
| `docs/tools/tool-architecture.md:11` | `[The Agentic Cycle](./agentic-cycle)` | `[The Agentic Cycle](../chat/agentic-cycle)` |
| `docs/tools/lazy-tool-discovery.md:222` | `[Agentic Cycle](./agentic-cycle)` | `[Agentic Cycle](../chat/agentic-cycle)` |

- [ ] **Step 2: Fix links in media/ that point to other sections**

| File | Old link | New link |
|------|----------|----------|
| `docs/media/realtime-chat.md:444` | `[Tools](./tools)` | `[Tools](../tools/tools)` |
| `docs/media/realtime-chat.md:446` | `[Multimodal Content](./multimodal-content)` | `[Multimodal Content](../advanced/multimodal-content)` |

Note: `realtime-chat.md:445` links to `[Text-to-Speech](./text-to-speech)` — stays the same (same folder).

- [ ] **Step 3: Fix links in advanced/ that point to other sections**

| File | Old link | New link |
|------|----------|----------|
| `docs/advanced/middleware.md:649` | `[Tools](./tools)` | `[Tools](../tools/tools)` |
| `docs/advanced/middleware.md:650` | `[Agentic Cycle](./agentic-cycle)` | `[Agentic Cycle](../chat/agentic-cycle)` |
| `docs/advanced/middleware.md:652` | `[Streaming](./streaming)` | `[Streaming](../chat/streaming)` |

Note: `middleware.md:651` links to `[Observability](./observability)` — stays the same (same folder).

- [ ] **Step 4: Fix links in chat/ that point to other sections**

No cross-section links found. `connection-adapters.md:229` links to `[Streaming](./streaming)` — same folder, no change.

- [ ] **Step 5: Fix links in migration/ that point to other sections**

| File | Old link | New link |
|------|----------|----------|
| `docs/migration/migration.md:434` | `[Tree-Shaking Guide](./tree-shaking)` | `[Tree-Shaking Guide](../advanced/tree-shaking)` |

---

### Task 4: Fix external links (from other sections pointing to guides/)

All references from non-guide sections using `../guides/*` paths need updating to `../new-section/*`.

**Files:**
- Modify: files in `docs/getting-started/`, `docs/api/`, `docs/adapters/`, `docs/community-adapters/`, `docs/protocol/`

- [ ] **Step 1: Fix getting-started/ links**

| File | Old link | New link |
|------|----------|----------|
| `docs/getting-started/overview.md:107` | `../guides/tools` | `../tools/tools` |
| `docs/getting-started/quick-start.md:263` | `../guides/tools` | `../tools/tools` |
| `docs/getting-started/quick-start.md:264` | `../guides/client-tools` | `../tools/client-tools` |

- [ ] **Step 2: Fix api/ links**

| File | Old link | New link |
|------|----------|----------|
| `docs/api/ai.md:346` | `../guides/tools` | `../tools/tools` |
| `docs/api/ai-react.md:316` | `../guides/tools` | `../tools/tools` |
| `docs/api/ai-react.md:317` | `../guides/client-tools` | `../tools/client-tools` |
| `docs/api/ai-solid.md:331` | `../guides/tools` | `../tools/tools` |
| `docs/api/ai-solid.md:332` | `../guides/client-tools` | `../tools/client-tools` |
| `docs/api/ai-preact.md:316` | `../guides/tools` | `../tools/tools` |
| `docs/api/ai-preact.md:317` | `../guides/client-tools` | `../tools/client-tools` |
| `docs/api/ai-client.md:350` | `../guides/connection-adapters` | `../chat/connection-adapters` |

- [ ] **Step 3: Fix adapters/ links**

| File | Old link | New link |
|------|----------|----------|
| `docs/adapters/anthropic.md:229` | `../guides/tools` | `../tools/tools` |
| `docs/adapters/openai.md:332` | `../guides/tools` | `../tools/tools` |
| `docs/adapters/openrouter.md:131` | `../guides/tools` | `../tools/tools` |
| `docs/adapters/groq.md:271` | `../guides/tools` | `../tools/tools` |
| `docs/adapters/grok.md:231` | `../guides/tools` | `../tools/tools` |
| `docs/adapters/ollama.md:291` | `../guides/tools` | `../tools/tools` |
| `docs/adapters/gemini.md:383` | `../guides/image-generation` | `../media/image-generation` |
| `docs/adapters/gemini.md:386` | `../guides/tools` | `../tools/tools` |

- [ ] **Step 4: Fix community-adapters/ links**

| File | Old link | New link |
|------|----------|----------|
| `docs/community-adapters/cencori.md:182` | `../guides/streaming` | `../chat/streaming` |
| `docs/community-adapters/cencori.md:183` | `../guides/tools` | `../tools/tools` |
| `docs/community-adapters/cloudflare.md:297` | `../guides/streaming` | `../chat/streaming` |
| `docs/community-adapters/cloudflare.md:298` | `../guides/tools` | `../tools/tools` |
| `docs/community-adapters/decart.md:247` | `../guides/image-generation` | `../media/image-generation` |
| `docs/community-adapters/decart.md:248` | `../guides/video-generation` | `../media/video-generation` |
| `docs/community-adapters/soniox.md:225` | `../guides/transcription` | `../media/transcription` |

- [ ] **Step 5: Fix protocol/ links**

| File | Old link | New link |
|------|----------|----------|
| `docs/protocol/chunk-definitions.md:383` | `../guides/connection-adapters` | `../chat/connection-adapters` |
| `docs/protocol/http-stream-protocol.md:427` | `../guides/connection-adapters` | `../chat/connection-adapters` |
| `docs/protocol/sse-protocol.md:353` | `../guides/connection-adapters` | `../chat/connection-adapters` |

---

### Task 5: Update sync script

**Files:**
- Modify: `scripts/sync-docs-config.ts`

- [ ] **Step 1: Update SECTION_ORDER**

In `scripts/sync-docs-config.ts`, replace the `SECTION_ORDER` constant (line 13):

```typescript
// Old
const SECTION_ORDER = ['getting-started', 'guides', 'api', 'adapters']

// New
const SECTION_ORDER = [
  'getting-started',
  'tools',
  'chat',
  'code-mode',
  'media',
  'advanced',
  'migration',
  'api',
  'adapters',
  'community-adapters',
]
```

- [ ] **Step 2: Update LABEL_OVERRIDES**

Replace the `LABEL_OVERRIDES` constant (line 16):

```typescript
// Old
const LABEL_OVERRIDES: Record<string, string> = {
  api: 'API',
}

// New
const LABEL_OVERRIDES: Record<string, string> = {
  api: 'API',
  'code-mode': 'Code Mode',
  chat: 'Chat & Streaming',
}
```

- [ ] **Step 3: Run the sync script to regenerate config.json**

```bash
pnpm run sync-docs-config
```

Expected: config.json is updated with the new section structure. Verify the output lists all new sections with correct item counts.

- [ ] **Step 4: Verify config.json looks correct**

Open `docs/config.json` and verify:
- Sections appear in order: Getting Started, Tools, Chat & Streaming, Code Mode, Media, Advanced, Migration, API, Adapters, Community Adapters, then collapsible reference sections
- Each section contains the correct pages
- Code Mode section includes all 3 existing pages
- No leftover "Guides" section

---

### Task 6: Write new client-integration.md page

**Files:**
- Create: `docs/code-mode/client-integration.md`

- [ ] **Step 1: Write the client integration doc**

Create `docs/code-mode/client-integration.md` with the following content:

```markdown
---
title: Showing Code Mode in the UI
id: code-mode-client-integration
order: 2
---

You have [Code Mode](../../code-mode/code-mode) working on your server — the LLM writes and executes TypeScript, and you get results back. But your users see nothing while the sandbox runs. By the end of this guide, your React app will show real-time execution progress: console output, external function calls, and final results as they stream in.

## How events reach the client

When code runs inside the sandbox, Code Mode emits **custom events** through the AG-UI streaming protocol. These events travel alongside normal chat chunks (text, tool calls) and arrive in your client via the `onCustomEvent` callback.

The events emitted during each `execute_typescript` call:

| Event | When | Key fields |
|-------|------|------------|
| `code_mode:execution_started` | Sandbox begins executing | `timestamp`, `codeLength` |
| `code_mode:console` | Each `console.log/error/warn/info` | `level`, `message`, `timestamp` |
| `code_mode:external_call` | Before an `external_*` function runs | `function`, `args`, `timestamp` |
| `code_mode:external_result` | After a successful `external_*` call | `function`, `result`, `duration` |
| `code_mode:external_error` | When an `external_*` call fails | `function`, `error`, `duration` |

Every event includes a `toolCallId` that ties it to the specific `execute_typescript` tool call, so you can render events alongside the right message.

## Listening to events with useChat

Pass an `onCustomEvent` callback to `useChat`. The callback receives the event type, payload, and a context object with the `toolCallId`:

```typescript
import { useCallback, useRef, useState } from "react";
import { useChat, fetchServerSentEvents } from "@tanstack/ai-react";

interface VMEvent {
  id: string;
  eventType: string;
  data: unknown;
  timestamp: number;
}

export function CodeModeChat() {
  const [toolCallEvents, setToolCallEvents] = useState<
    Map<string, Array<VMEvent>>
  >(new Map());
  const eventIdCounter = useRef(0);

  const handleCustomEvent = useCallback(
    (
      eventType: string,
      data: unknown,
      context: { toolCallId?: string },
    ) => {
      const { toolCallId } = context;
      if (!toolCallId) return;

      const event: VMEvent = {
        id: `event-${eventIdCounter.current++}`,
        eventType,
        data,
        timestamp: Date.now(),
      };

      setToolCallEvents((prev) => {
        const next = new Map(prev);
        const events = next.get(toolCallId) || [];
        next.set(toolCallId, [...events, event]);
        return next;
      });
    },
    [],
  );

  const { messages, sendMessage, isLoading } = useChat({
    connection: fetchServerSentEvents("/api/chat"),
    onCustomEvent: handleCustomEvent,
  });

  // Render messages with events — see next section
}
```

Events are keyed by `toolCallId` so each `execute_typescript` call gets its own event timeline.

## Rendering execution progress

When rendering messages, check for `execute_typescript` tool calls and display their events:

```typescript
function MessageList({
  messages,
  toolCallEvents,
}: {
  messages: Array<{ id: string; role: string; parts: Array<any> }>;
  toolCallEvents: Map<string, Array<VMEvent>>;
}) {
  return (
    <div>
      {messages.map((message) => (
        <div key={message.id}>
          {message.parts.map((part) => {
            if (part.type === "text") {
              return <p key={part.id}>{part.content}</p>;
            }

            if (
              part.type === "tool-call" &&
              part.name === "execute_typescript"
            ) {
              const events = toolCallEvents.get(part.id) || [];
              const result = part.output;

              return (
                <div key={part.id}>
                  <CodeExecutionPanel
                    code={part.input?.typescriptCode}
                    events={events}
                    result={result}
                    isRunning={!result}
                  />
                </div>
              );
            }

            return null;
          })}
        </div>
      ))}
    </div>
  );
}
```

## Building an execution panel

Here's a complete `CodeExecutionPanel` component that shows the generated code, live event stream, and final result:

```typescript
function CodeExecutionPanel({
  code,
  events,
  result,
  isRunning,
}: {
  code?: string;
  events: Array<VMEvent>;
  result?: { success: boolean; result?: unknown; logs?: string[]; error?: { message: string } };
  isRunning: boolean;
}) {
  return (
    <div className="border rounded-lg overflow-hidden my-2">
      {/* Generated code */}
      {code && (
        <details open>
          <summary className="px-3 py-2 bg-gray-100 font-mono text-sm cursor-pointer">
            TypeScript code
          </summary>
          <pre className="p-3 text-sm overflow-x-auto bg-gray-50">
            <code>{code}</code>
          </pre>
        </details>
      )}

      {/* Live event stream */}
      {events.length > 0 && (
        <div className="border-t px-3 py-2">
          <div className="text-xs font-semibold text-gray-500 mb-1">
            Execution log
          </div>
          <div className="space-y-1 font-mono text-xs">
            {events.map((event) => (
              <EventLine key={event.id} event={event} />
            ))}
            {isRunning && (
              <div className="text-blue-500 animate-pulse">Running...</div>
            )}
          </div>
        </div>
      )}

      {/* Final result */}
      {result && (
        <div
          className={`border-t px-3 py-2 text-sm ${
            result.success ? "bg-green-50" : "bg-red-50"
          }`}
        >
          {result.error && (
            <div className="text-red-700">Error: {result.error.message}</div>
          )}
          {result.logs && result.logs.length > 0 && (
            <pre className="text-gray-600 text-xs mt-1">
              {result.logs.join("\n")}
            </pre>
          )}
          {result.success && result.result !== undefined && (
            <pre className="text-green-800 text-xs mt-1">
              {JSON.stringify(result.result, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function EventLine({ event }: { event: VMEvent }) {
  const data = event.data as Record<string, unknown>;

  switch (event.eventType) {
    case "code_mode:console":
      return (
        <div
          className={
            data.level === "error"
              ? "text-red-600"
              : data.level === "warn"
                ? "text-yellow-600"
                : "text-gray-600"
          }
        >
          [{String(data.level)}] {String(data.message)}
        </div>
      );

    case "code_mode:external_call":
      return (
        <div className="text-amber-600">
          → {String(data.function)}(
          {JSON.stringify(data.args)})
        </div>
      );

    case "code_mode:external_result":
      return (
        <div className="text-green-600">
          ← {String(data.function)} ({data.duration}ms)
        </div>
      );

    case "code_mode:external_error":
      return (
        <div className="text-red-600">
          ✗ {String(data.function)}: {String(data.error)}
        </div>
      );

    case "code_mode:execution_started":
      return <div className="text-cyan-600">▶ Execution started</div>;

    default:
      return (
        <div className="text-gray-400">
          {event.eventType}: {JSON.stringify(data)}
        </div>
      );
  }
}
```

This gives you:
- A collapsible code block showing the TypeScript the model wrote
- A live event log showing console output, external function calls with arguments, results with durations, and errors
- A status-colored result panel with logs and the return value

## Adapting for other frameworks

The `onCustomEvent` callback is available through `ChatClient` from `@tanstack/ai-client`, which all framework integrations use under the hood. In Solid, Vue, or Svelte, pass `onCustomEvent` in the same way you pass it to `useChat` in React — the callback signature is identical:

```typescript
(eventType: string, data: unknown, context: { toolCallId?: string }) => void
```

See [Code Mode](../../code-mode/code-mode) for setting up the server side, and [Code Mode with Skills](../../code-mode/code-mode-with-skills) for adding persistent skill libraries.
```

- [ ] **Step 2: Verify the file renders correctly**

Check that frontmatter is valid and the file appears in the right position when the sync script runs (Task 5 Step 3 handles this — re-run if needed).

---

### Task 7: Add cross-links to existing pages

**Files:**
- Modify: `docs/tools/tools.md`, `docs/chat/agentic-cycle.md`

- [ ] **Step 1: Add Code Mode callout to tools.md**

In `docs/tools/tools.md`, add before the "## Next Steps" section at the end of the file:

```markdown
> **Tip:** If your use case involves calling multiple tools with complex logic (filtering, aggregation, parallel calls), consider [Code Mode](../code-mode/code-mode) — it lets the LLM write a TypeScript program that orchestrates tools in a single execution instead of one tool call at a time.
```

- [ ] **Step 2: Add Code Mode callout to agentic-cycle.md**

In `docs/chat/agentic-cycle.md`, add a callout in the section discussing multiple iterations / round-trips:

```markdown
> **Tip:** Code Mode can reduce agent loop iterations by letting the LLM write a program that calls multiple tools in a single execution. See [Code Mode](../code-mode/code-mode).
```

---

### Task 8: Final verification

- [ ] **Step 1: Re-run sync script**

```bash
pnpm run sync-docs-config
```

Verify `docs/config.json` contains all sections in the correct order with all pages.

- [ ] **Step 2: Run docs link checker**

```bash
pnpm test:docs
```

Expected: No broken links. If any fail, fix the paths and re-run.

- [ ] **Step 3: Spot-check the config**

Verify the Code Mode section in `docs/config.json` contains 4 entries:
1. Code Mode
2. Showing Code Mode in the UI
3. Code Mode with Skills
4. Code Mode Isolate Drivers

- [ ] **Step 4: Commit**

```bash
git add docs/ scripts/sync-docs-config.ts
git commit -m "docs: restructure sidebar into thematic sections and add code mode client integration guide"
```
