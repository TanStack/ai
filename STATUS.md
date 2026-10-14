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
  - Built-in compute functions: `billSplit`, `savingsGrowth`, `sum`.
  - Type-safe `ComputeRegistry` allowing custom host arithmetic registration.
- **Drivers (`src/drivers/index.ts`)**:
  - `FixtureDriver`: Mock driver delivering the 9 canonical spec fixtures.
  - `ProgrammaticDriver`: Fluent builder API for constructing graphs in application code with zero LLM dependency.
  - `LiveDriver`: Automated tool schema generator and output processor for model-driven generation.
- **React Host Renderer (`src/react/index.tsx`)**:
  - Dynamic host renderer with recursive `NodeRenderer`.
  - SVG Vector scene rendering with interactive shape selection and keyboard accessibility.
  - Reactive compute bindings automatically recalculating outputs when inputs change.
  - Accessible Text Fallback component (`GenerativeUITextFallback`).
- **Test Suite**:
  - 16/16 unit tests passing across 4 test suites:
    - `tests/schema-validator.test.ts`
    - `tests/compute.test.ts`
    - `tests/drivers.test.ts`
    - `tests/react-renderer.test.tsx`

---

### B. Web Playground: `examples/generative-ui`
Located at `examples/generative-ui`.

- **Live Multi-Provider LLM Integration**:
  - Middleware in `vite.config.ts` supporting OpenAI (`gpt-4o`), Anthropic (`claude-sonnet-4-5-20250929`), Gemini (`gemini-3.8-flash`), xAI (`grok-4.20-0309-non-reasoning`), and OpenRouter via native fetch and `.env.local` keys.
  - Automatic tool calling invocation using the `render_ui` specification schema.
- **Playground Features (`src/App.tsx`)**:
  - Scenario Selector covering all 9 canonical fixtures (U1–U8 + §6.4.3 chord diagram).
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
| Unit Tests | `pnpm --filter @tanstack/ai-generative-ui test:lib` | ✅ 16/16 passing |
| Type Check | `pnpm test:types` | ✅ 101/101 projects passing |
| Monorepo Dependencies | `pnpm test:sherif` | ✅ Clean (0 errors) |
| Dead Code / Unused Deps | `pnpm test:knip` | ✅ Clean (0 issues) |
| Package Build & Types | `vite build` + `tsc` + `publint --strict` | ✅ Clean ESM & DTS |
| Example Build | `pnpm --filter generative-ui-example build` | ✅ Clean bundle |
