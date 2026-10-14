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

### B. Web Playground: `examples/generative-ui`
Located at `examples/generative-ui`.

- **Live Multi-Provider LLM Integration**:
  - Middleware in `vite.config.ts` supporting OpenAI (`gpt-4o`), Anthropic (`claude-sonnet-4-5-20250929`), Gemini (`gemini-3.8-flash`), xAI (`grok-4.20-0309-non-reasoning`), and OpenRouter via native fetch and `.env.local` keys.
  - Automatic tool calling invocation using the `render_ui` specification schema.
- **Playground Features (`src/App.tsx`)**:
  - Scenario Selector covering all 9 canonical fixtures (U1–U8 + §6.4.3 chord diagram) plus the stored "Live-shape: Recipe Card" regression scenario.
  - Live AI prompt bar with sample chips (*Mortgage calculator*, *Streaming tiers*, *Recipe checklist*, *Dmaj9 chord voicing*).
  - Bounded Repair banner detailing applied schema repairs.
  - Visual vs. Fallback Text mode toggle (§9.2).
  - Interactive JSON inspector toggle.
  - Real-time Outbound Intent Stream logging and visual confirmation toast.
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
| Unit Tests | `pnpm --filter @tanstack/ai-generative-ui test:lib` | ✅ 21/21 passing |
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
