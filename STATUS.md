# Open Generative UI — Implementation Status & Architecture

**Date**: 2026-10-14  
**Specification**: Open Generative UI (Draft 0.1)  
**Workspace**: `packages/ai-generative-ui`, `examples/generative-ui`, and `goose` desktop POC  

---

## 1. Specification Overview (Draft 0.1)

The Open Generative UI specification defines a declarative, portable, model-composed user interface standard for autonomous AI agents. Rather than dumping raw prose, markdown tables, or executing arbitrary/untrusted HTML/JS, the agent composes structured node graphs from a shared component catalog that the host application natively renders.

### Core Architecture (4 Layers)
```
┌─────────────────────────────────────────────────────────┐
│ Driver (§7)                                             │
│ Produces node graphs: fixture / programmatic / live LLM │
├─────────────────────────────────────────────────────────┤
│ Node Graph (§5)                                         │
│ Versioned, validated, transport-agnostic data           │
├─────────────────────────────────────────────────────────┤
│ Transport Binding (§4.1)                                │
│ AG-UI state events · MCP/ACP tool result · file/HTTP    │
├─────────────────────────────────────────────────────────┤
│ Host Renderer (§9)                                      │
│ Maps nodes to host's own components / design system     │
└─────────────────────────────────────────────────────────┘
```

### The 8 Canonical Jobs to be Done
- **U1 (Compare)**: Side-by-side option evaluations with matching attributes (`compare-plans-basic`).
- **U2 (Understand)**: Explorable mechanical/process systems with interactive hotspots (`bicycle-drivetrain`).
- **U3 (Plan & Track)**: Step sequences with timers and completion checklists (`cooking-plan`).
- **U4 (Calculate)**: Parameter exploration bound to **deterministic host compute functions** (`bill-split`, `savingsGrowth`), never LLM arithmetic.
- **U5 (Collect Input)**: Structured forms that return typed intent data back to the agent (`recipe-parameters`).
- **U6 (Decide / Approve)**: Explicit approval boundaries with approve/reject actions (`approval-tool-call`).
- **U7 (Monitor)**: Glanceable metric cards, trends, and progress bars (`spend-monitor`).
- **U8 (Locate)**: Geographic or route itinerary waypoints with notes (`trip-stops`).
- **§6.4 Vector Scenes**: Sandboxed 2D SVG scenes (`chord-diagram-emaj7`) with declared interactivity, semantic paint roles (`accent`, `neutral`, `muted`, `surface`, `danger`), and forbidden script/eval vectors.

### Safety & Resilience
- **Zero Raw HTML/JS**: Graphs contain only declarative component primitives. Handlers are attached solely by the host renderer.
- **Bounded Repair (§9.3)**: Host validators degrade unknown containers to `Stack`, unknown leaves to `Text`, swap inverted slider/stepper bounds, synthesize missing `fallbackText` (§9.2), drop unsafe SVG path commands, and absorb vector elements placed in `children` into `props.shapes`.
- **Bidirectional Intent Model (§8)**: User actions emit typed payloads (`local`, `submit`, `action`) back to the host/agent without arbitrary networking.

---

## 2. Current Implementation Status

### A. Core Package: `@tanstack/ai-generative-ui`
Located at `packages/ai-generative-ui`.

- **Type Definitions (`src/types.ts`)**:
  - `GraphDocument`, `UINode`, `GraphProvenance`, `ComputeBinding`, `IntentPayload`, `HostCapability`.
  - 22 Catalog component schemas across Layout (`Stack`, `Columns`, `Section`, `Tabs`, `Timeline`), Content (`Text`, `Image`, `Table`, `List`, `Metric`, `Chart`, `Map`, `Diagram`, `Callout`), Input (`Form`, `TextInput`, `NumberInput`, `Select`, `Slider`, `Stepper`, `Toggle`, `Checkbox`, `Checklist`, `Button`, `Choice`), and Vector (`Scene`).
- **Schema & Validation (`src/schema.ts`, `src/validator.ts`)**:
  - JSON Schema compliant definitions for `render_ui` tool calling.
  - Full bounded repair validator enforcing §9.3 rules and SVG path grammar validation (`/^[ \t\r\n]*([MmLlHhVvCcSsQqTtAaZz][ \t\r\n,0-9.-]*)+$/`).
- **Deterministic Compute Engine (`src/compute.ts`)**:
  - Built-in compute functions: `billSplit`, `loanPayment` (+ `mortgage`/`calculateMortgage` aliases), `savingsGrowth`, `percentOf`, `sum`.
  - Input-key aliasing (e.g. `loanAmount`/`principal`/`amount` all resolve) so a model's phrasing still hits the right parameter.
  - `describe()` / `describeComputeForPrompt()` emit a machine-readable catalog of functions, their inputs, and output shapes — injected into the live system prompt so models bind to functions that actually exist (§7.3) instead of inventing names.
  - Type-safe `ComputeRegistry` allowing custom host arithmetic registration.
- **Drivers (`src/drivers/index.ts`)**:
  - `FixtureDriver`: Mock driver delivering the 9 canonical spec fixtures plus a stored live-shape regression fixture (`recipe-card`).
  - `ProgrammaticDriver`: Fluent builder API for constructing graphs in application code with zero LLM dependency.
  - `LiveDriver`: Automated tool schema generator and output processor for model-driven generation.
- **React Host Renderer (`src/react/index.tsx`)**:
  - Dynamic host renderer with recursive `NodeRenderer`, styled as a cohesive, production-grade light design system (the reference host surface).
  - Real data visualisation: a fixed-plot gradient bar `Chart`, a geographically-projected SVG `Map` (lat/lng → viewport with route path + numbered pins), dashboard `Metric` cards with signed delta pills, and a stepped `Timeline` with done/current/upcoming states.
  - `Section` renders a highlighted, badged variant when its title/`highlighted` flag marks it "Recommended".
  - SVG Vector scene rendering with interactive shape selection and keyboard accessibility.
  - Reactive compute bindings automatically recalculating outputs when inputs change — results are written at the declared `output` path **and** flattened to the state root, so both nested (`loan.monthlyPayment`) and scalar (`monthlyPayment`) model bindings resolve.
  - **Flexible input binding**: an input's value path is an explicit `bind.value` or the implicit `<nodeId>.value` convention a live model naturally emits; state is seeded from each input's declared `props.value` on mount so computes have real inputs on first render.
  - Prop-name tolerance for common model variance (`label`/`text`/`title` on buttons, `content`/`text` on text and callouts) and a clean em-dash empty state on unpopulated metrics.
  - Accessible Text Fallback component (`GenerativeUITextFallback`).
- **Test Suite**:
  - 21/21 unit tests passing across 4 test suites:
    - `tests/schema-validator.test.ts`
    - `tests/compute.test.ts` (incl. `loanPayment` amortization, aliases, 0% edge case, `percentOf`, catalog integrity)
    - `tests/drivers.test.ts`
    - `tests/react-renderer.test.tsx` (incl. a bind-less stepper + id-less checklist regression)

---

### B. Web Example: `examples/generative-ui`
Located at `examples/generative-ui`. Two surfaces behind a top-bar toggle, with a deliberate default: **Chat is the product; the Playground is a test bench** (spec §1 principle 6, §15.1).

- **Live Multi-Provider LLM Integration**:
  - Middleware in `vite.config.ts` supporting OpenAI (`gpt-4o`), Anthropic (`claude-sonnet-4-5-20250929`), Gemini (`gemini-3.8-flash`), xAI (`grok-4.20-0309-non-reasoning`), and OpenRouter via native fetch and `.env.local` keys.
  - `/api/chat` (conversational, `tool_choice: auto` so the model interleaves prose + an optional `render_ui` call) and `/api/generate` (one-shot, forced tool call, used by the Playground) share one provider-call helper.
- **Chat surface (`src/ChatSurface.tsx`) — the default, inline-first demo**:
  - A conversation stream where a graph is **message content**, interleaved with the model's markdown prose in chat typography (a small inline-markdown renderer, no new deps).
  - **In-place revision**: a per-`graphId` store keeps the latest revision; a graph renders only in the latest message that references its `graphId`, so a follow-up ("make it a 15-year term") reuses the same `graphId` at the next `revision` with a *revised in place* badge, and never duplicates.
  - **Instant, model-free starters** backed by canonical fixtures (spec §14) plus live suggestion chips; provider selector; a dev-only `window.__genuiGraphs` hook for browser/E2E assertions.
  - Structured intents (§8) route into the stream as system pills (`intent · selectPlan · {plan:'pro'} · routed to agent`).
- **Playground surface (`src/Playground.tsx`) — developer test bench**:
  - Scenario Selector covering all 9 canonical fixtures (U1–U8 + §6.4.3 chord diagram) plus the stored "Live-shape: Recipe Card" regression scenario.
  - Live AI prompt bar, Bounded Repair banner, Visual vs. Fallback Text toggle (§9.2), JSON inspector, real-time Outbound Intent log.
  - Styled with Tailwind CSS v4 using `@source` workspace resolution.

---

### C. Desktop Integration: Goose (`block/goose`)
Located at `/Users/jherr/projects/goose` on branch `feat/generative-ui-poc`.

- **Linked Package**: `@tanstack/ai-generative-ui` linked via workspace dependency.
- **Timeline Renderer (`ui/desktop/src/components/GenerativeUI/GenerativeUIMessage.tsx`)**:
  - Native host renderer mounting inside Goose's conversation message stream.
  - Detects `render_ui` tool calls in `ui/desktop/src/components/ToolCallWithResponse.tsx`.
  - Handles outbound intents (`action` / `submit`) and routes them back into the active session via Goose's `append()` message channel.
- **Unit & Integration Tests**:
  - `GenerativeUIMessage.test.tsx` verifying native rendering across all canonical fixtures with green typechecks and test suites.

---

## 3. Quality Gates Verification

| Check | Tool / Target | Status |
|-------|---------------|--------|
| Unit Tests | `pnpm --filter @tanstack/ai-generative-ui test:lib` | ✅ 23/23 passing |
| Type Check (package) | `nx test:types ai-generative-ui` | ✅ Passing |
| Type Check (example) | `nx test:types generative-ui-example` | ✅ Passing |
| Lint | `pnpm test:oxlint` | ✅ 0 errors (pre-existing `no-explicit-any` warnings only) |
| Package Build & Types | `vite build` + `tsc` + `publint --strict` | ✅ Clean ESM & DTS |
| Example Build | `pnpm --filter generative-ui-example build` | ✅ Clean bundle |

---

## 4. This Session: Fixes, Hardening & Browser Verification

Every change below was driven and verified in a real browser (Chrome automation) against the running playground and live provider calls.

### Bugs found & fixed
- **Host renderer was completely unstyled (critical).** `examples/generative-ui/src/index.css` pointed `@source` at `../../packages/...`, which resolves to a non-existent `examples/packages/...`. Tailwind generated none of the renderer's utility classes, so the host card rendered with no background, padding, or component styling. Corrected to `../../../packages/ai-generative-ui/src`.
- **`Chart` bars were invisible.** Bars used a percentage height inside an auto-height flex column (circular height dependency → collapse). Rebuilt as a fixed-height plot with pixel-computed gradient bars, a baseline, and hover states.
- **Live calculators never computed.** The `render_ui` tool schema never told the model which compute functions exist, so it invented names (`calculateMortgage`) that silently no-op'd. Added a compute catalog to the system prompt, expanded the registry (loan/mortgage, percentage), and added input-key aliasing. Also supported the implicit `<nodeId>.value` binding pattern and on-mount state seeding so a prefilled input reaches its bound compute.
- **Bind-less inputs were inert.** A live model frequently omits `bind.value`/`bind.state` and item `id`s (addressing inputs by node id). A `Stepper`/`Slider`/`Checklist` without an explicit bind did nothing. Inputs now resolve an implicit `<nodeId>.value` (and `Checklist` an implicit `<nodeId>.state` with index-based item keys), so they are interactive and persist regardless. Covered by a regression test.
- **Prop-name drift.** `Section` titles via `label`, button labels via `text`, etc. were dropped on the floor. Components now tolerate the common synonyms (`title`/`label`/`heading`, `label`/`text`/`title`, `content`/`text`).
- **`prefer-const` lint error** in `validator.ts` and non-null-assertion lint errors in `compute.ts` (both now clean).

### Design elevation
Reworked the host renderer into a cohesive "technical atelier" design system (refined neutrals, cobalt accent, hairline borders, layered shadows, tabular numerals) and the playground shell into a designed developer surface (Bricolage Grotesque / Hanken Grotesk / JetBrains Mono, engineering-grid + radial-glow background, staggered surface entrance). New real visualisations for `Chart`, `Map`, `Metric`, and `Timeline`; a badged "Recommended" `Section` variant.

### Browser-verified behaviours
- All 9 canonical fixtures render correctly (U1–U8 + §6.4.3 vector scene).
- U4 bill-split and live-generated tip/mortgage calculators compute **reactively** via host code — confirmed a slider drag updates tip `$18 → $27` and total `$118 → $127` live.
- Structured intents (§8) fire and log on hotspot/plan/map interactions.
- Bounded repair (§9.3) applies all 7 expected fixes to the malformed test graph (degradations, swapped slider bounds, dropped unsafe SVG path, synthesized `fallbackText`).
- Live generation returns valid, rendering graphs across all five providers (OpenAI, Anthropic, Gemini, xAI, OpenRouter).

### Stored regression artifact
The real-world graph that first surfaced the bind-less interactivity bug is now checked in verbatim as the `recipe-card` canonical fixture and a **"Live-shape: Recipe Card"** scenario in the playground dropdown, so the tricky pattern (inputs by node id, no `bind`, no item ids, section titles via `label`) can be reproduced deterministically without the LLM and is locked down by a unit test.

---

## 5. This Session: Inline-First Conversation Surface (spec §15.1)

The updated Draft 0.1 (§1 principle 6, §15) promotes **inline-first** from preference to requirement: the flagship surface is a conversation stream where graphs render as message content, not a standalone playground. This session builds that surface and makes it the default; the playground is retained as a labelled test bench. Every behaviour below was driven and verified in a real browser (Chrome automation) against live provider calls.

### What was built
- **Conversational endpoint** `/api/chat` (`vite.config.ts`): a shared `callProvider()` helper across all five providers with `tool_choice: auto`, so the model narrates in markdown **and** optionally emits a `render_ui` graph in the same turn. Conversation history (including on-screen graphs) is serialized back to the model; the most recent graph is embedded in full so it can be revised field-by-field.
- **`ChatSurface.tsx`**: message stream with user bubbles, assistant prose (minimal inline-markdown renderer), and graphs rendered inline as native message content. Per-`graphId` store realizes **revise-in-place** — a follow-up turn reuses the same `graphId` at the next `revision`, the live graph moves to the turn that mentions it (never duplicated), and shows a *revised in place* badge. Fixture-backed starters render instantly with no model (spec §14).
- **App shell** (`App.tsx`): a top-bar **Chat / Playground** toggle, Chat default. The former playground moved verbatim to `Playground.tsx`.

### Renderer hardening for live wiring drift (`src/react/index.tsx`)
Live models mis-wire computed values in two recurring ways; both are now absorbed and locked by a regression test:
- **Binding path placed in `props.value` as a literal string** (e.g. `"loan.monthlyPayment"`) instead of `bind.value` → `resolveDisplayValue` resolves path-shaped display strings against live state.
- **Compute output-name drift** (metric binds `wrongName.totalPaid`) → `resolveBinding` falls back to the leaf key at the state root (compute already flattens every object-result key there).
- The system prompt now carries a **complete worked mortgage example** (exact compute + `bind.value` wiring), which markedly improves first-try correctness.

### Browser-verified end-to-end
- Instant fixture (Compare Plans) renders inline as message content; `selectPlan` **action intent** routes into the stream.
- Live-composed **mortgage calculator** renders inline and computes host-side (**$2,528.27 / mo**, total **$910,177.95** for $400k @ 6.5% / 30y — matching the compute verified in isolation), and **recomputes reactively** ($600k → **$3,792.41 / mo**).
- **In-place revision**: "change it to a 15-year term" returned `mortgage_calculator_01` at **revision 2** with the badge; the rev-1 graph collapsed to text.
- Playground test bench still renders all fixtures, live generation, repair, and the intent log.

### Follow-up fix: graph JSON leaked into chat prose
A revision follow-up ("add a balloon payment feature") came back with the raw graph JSON dumped as text instead of rendering. Root cause: prior graphs were embedded as fenced JSON inside **assistant text** in the history, which taught the model (few-shot) to reply in that same textual format rather than calling `render_ui`. Fixes:
- Prior graphs now ride the provider history as real **`render_ui` tool-call / tool-result messages** (OpenAI `tool_calls` + `tool` role; Anthropic `tool_use` + `tool_result`), so the model keeps calling the tool for revisions. No graph JSON is ever placed in assistant text.
- Safety net in `/api/chat`: recover a graph the model still text-dumps (fenced block that parses to a `{ specVersion, root }`) and strip any leaked `[UI currently on screen …]` marker from the shown prose.
- Added a `balloonLoan` / `balloonMortgage` compute function (amortizes the financed portion, defers the lump sum) so "add a balloon payment" actually computes instead of adding inert inputs. Browser-verified: the follow-up revised `mortgageCalc` to **rev 2** in place with a clean "Here you go." prose line, Balloon inputs, and host-computed Monthly **$1,347.13** / Balloon Due **$100,000** / Total **$261,656.09**.

### Gates
23/23 unit tests (added the live-wiring + balloon-loan regression tests), package + example typecheck, oxlint (0 errors), and both builds all green via `nx run-many --targets=test:lib,test:types,test:oxlint,build --projects=ai-generative-ui,generative-ui-example`.
