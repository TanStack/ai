# Docs Sidebar Restructure + Code Mode Client Integration

**Date:** 2026-04-07
**Status:** Draft

## Problem

The docs sidebar has a single flat "Guides" section with 21+ pages, making it hard to find concepts. Three existing code mode docs (`code-mode.md`, `code-mode-with-skills.md`, `code-mode-isolates.md`) were never added to the sidebar config. There is no documentation for showing code mode execution in a client-side UI.

## Approach

**Approach A: New top-level folders.** Split `docs/guides/` into thematic top-level folders. The existing `sync-docs-config.ts` script maps top-level folders to sidebar sections, so this works with minimal script changes. URLs change from `guides/*` to `<section>/*`.

## Personas

1. **Backend builder** — Has a Node.js app, wants to add code mode to their chat endpoint. Already uses `chat()` and tools. **Served by existing `code-mode.md`.**
2. **Fullstack builder** — Wants to show code mode execution progress in their React UI (console logs, tool calls, results). **Gap — needs new page.**
3. **Evaluator** — Wants to understand what code mode is and whether it fits. **Served by existing `code-mode.md` "Why Code Mode?" section.**
4. **Skill builder** — Wants persistent skill libraries. **Served by existing `code-mode-with-skills.md`.**

## Design

### 1. Folder restructure

Move all files from `docs/guides/` into new top-level folders under `docs/`:

| New folder | Files (moved from `docs/guides/`) |
|---|---|
| `docs/tools/` | `tools.md`, `tool-architecture.md`, `server-tools.md`, `client-tools.md`, `tool-approval.md`, `lazy-tool-discovery.md` |
| `docs/chat/` | `agentic-cycle.md`, `streaming.md`, `connection-adapters.md`, `structured-outputs.md` |
| `docs/code-mode/` | `code-mode.md`, `code-mode-with-skills.md`, `code-mode-isolates.md`, `client-integration.md` (new) |
| `docs/media/` | `generations.md`, `realtime-chat.md`, `text-to-speech.md`, `transcription.md`, `image-generation.md`, `video-generation.md` |
| `docs/advanced/` | `middleware.md`, `observability.md`, `multimodal-content.md`, `per-model-type-safety.md`, `runtime-adapter-switching.md`, `tree-shaking.md`, `extend-adapter.md` |
| `docs/migration/` | `migration.md` |

Delete `docs/guides/` after all files are moved.

### 2. Sync script updates

In `scripts/sync-docs-config.ts`:

- Update `SECTION_ORDER`:
  ```typescript
  const SECTION_ORDER = [
    'getting-started', 'tools', 'chat', 'code-mode',
    'media', 'advanced', 'migration', 'api', 'adapters', 'community-adapters'
  ]
  ```

- Update `LABEL_OVERRIDES`:
  ```typescript
  const LABEL_OVERRIDES: Record<string, string> = {
    api: 'API',
    'code-mode': 'Code Mode',
    'chat': 'Chat & Streaming',
  }
  ```

### 3. Frontmatter `order` renumbering

Each file keeps its `order` field but renumbered to be sequential within its new section (starting from 1). This ensures correct ordering within each sidebar group.

### 4. Internal link updates

All relative links between doc pages must be updated to reflect new paths. Examples:
- `./tools.md` in a code-mode page becomes `../tools/tools.md`
- `../guides/tools` in quick-start becomes `../tools/tools`
- Cross-references within the same new folder (e.g., code-mode pages linking to each other) stay as `./`

### 5. New page: `docs/code-mode/client-integration.md`

**Title:** Showing Code Mode in the UI
**Target persona:** Fullstack builder
**User story:** As a fullstack builder, I want to display real-time code execution progress (console logs, tool calls, results) in my React app, so my users can see what the LLM is doing.

**Journey:**
- **Point A:** Code mode works on the server. The client gets tool call results but shows no execution detail.
- **Point B:** The React app renders a live execution panel showing console output, external function calls, and final results as they stream in.

**Content outline:**

1. How code mode events reach the client
   - Server emits CUSTOM events via AG-UI protocol during sandbox execution
   - Events: `code_mode:execution_started`, `code_mode:console`, `code_mode:external_call`, `code_mode:external_result`, `code_mode:external_error`

2. Listening to events with `useChat`
   - `onCustomEvent` callback in `useChat` options
   - Signature: `(eventType: string, data: unknown, context: { toolCallId?: string }) => void`
   - Events are associated with a `toolCallId` so you can group them per execution

3. Building an execution panel
   - Store events by toolCallId in React state
   - Render console logs, tool calls, and results
   - Show execution status (running/success/error)
   - Complete, runnable code example

4. Cross-link back to `code-mode.md` for server setup and `code-mode-with-skills.md` for skills

**Style:** Matches existing docs — second person, code-first, frontmatter with `title`/`id`/`order`, relative cross-links.

### 6. Cross-linking updates

After the restructure, update existing pages that should reference code mode:
- `tools/tools.md` — add a callout mentioning Code Mode as an alternative to sequential tool calls
- `chat/agentic-cycle.md` — mention Code Mode as a way to reduce agent loop round-trips

### 7. Sidebar result

After running `pnpm run sync-docs-config`, the sidebar becomes:

```
Getting Started
  Overview
  Quick Start
  Devtools
Tools
  Tools
  Tool Architecture
  Server Tools
  Client Tools
  Tool Approval Flow
  Lazy Tool Discovery
Chat & Streaming
  Agentic Cycle
  Streaming
  Connection Adapters
  Structured Outputs
Code Mode
  Code Mode
  Showing Code Mode in the UI    ← new
  Code Mode with Skills
  Code Mode Isolate Drivers
Media
  Generations
  Realtime Voice Chat
  Text-to-Speech
  Transcription
  Image Generation
  Video Generation
Advanced
  Middleware
  Observability
  Multimodal Content
  Per-Model Type Safety
  Runtime Adapter Switching
  Tree-Shaking
  Extend Adapter
Migration
  Migration Guide
API
  @tanstack/ai
  @tanstack/ai-client
  @tanstack/ai-react
  @tanstack/ai-solid
  @tanstack/ai-preact
Adapters
  ...
Community Adapters
  ...
Class References (collapsed)
  ...
Function References (collapsed)
  ...
Interface References (collapsed)
  ...
Type Alias References (collapsed)
  ...
Variable References (collapsed)
  ...
```

## Out of scope

- Redirects for old `guides/*` URLs (handled at the tanstack.com site level, not in this repo)
- New reference pages for code mode types (auto-generated separately)
- Changes to existing code mode doc content (the 3 pages are already comprehensive)
